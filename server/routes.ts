import type { Express } from "express";
import { createServer, type Server } from "http";
import { findInquiryByEmailAndPhone, getHoursBalance, getSessions, searchStudent, submitScheduleChangeRequest } from "./sqlServerStorage";
import { loginSchema } from "@shared/schema";
import session from "express-session";

declare module "express-session" {
  interface SessionData {
    parentId?: string;
    inquiryId?: number;
    email?: string;
    contactPhone?: string;
    studentIds?: number[];
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'tutoring-club-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: false, // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.parentId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, contactPhone } = req.body;
      
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(401).json({ message: "Invalid phone number. Please contact your tutoring center." });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students;

      // Store session data
      req.session.email = email;
      req.session.contactPhone = contactPhone;
      req.session.inquiryId = parentInfo.InquiryID;
      req.session.parentId = parentInfo.InquiryID.toString();
      req.session.studentIds = studentsInfo.map((s: any) => s.ID);

      res.json({ 
        success: true, 
        parent: { 
          id: parentInfo.InquiryID, 
          name: parentInfo.Email || 'Parent',
          contactPhone: parentInfo.ContactPhone
        },
        studentsCount: studentsInfo.length
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ success: true });
    });
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      const studentIds = req.session.studentIds || [];
      
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent not found" });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students;
      
      res.json({
        parent: { 
          id: parentInfo.InquiryID, 
          name: parentInfo.Email || 'Parent', 
          contactPhone: parentInfo.ContactPhone 
        },
        students: studentsInfo.map((s: any) => ({ 
          id: s.ID, 
          name: `${s.FirstName} ${s.LastName}`,
          grade: 'N/A', // Not available in legacy structure
          subject: 'N/A', // Not available in legacy structure  
          status: 'active',
          progress: 0 // Not available in legacy structure
        }))
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get dashboard data
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const inquiryId = req.session.inquiryId!;
      const studentIds = req.session.studentIds || [];
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      
      // Get parent and student info
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent data not found" });
      }

      const studentsInfo = inquiryData.students;
      
      // Get all sessions for all students
      const allSessions: any[] = [];
      for (const student of studentsInfo) {
        const studentSessions = await getSessions(student.ID);
        studentSessions.forEach((session: any) => {
          session.studentName = `${student.FirstName} ${student.LastName}`;
          session.studentId = student.ID;
        });
        allSessions.push(...studentSessions);
      }

      // Get billing information
      const billingInfo = await getHoursBalance(inquiryId);
      
      // Calculate sessions this month
      const sessionsThisMonth = allSessions.length;

      res.json({
        students: studentsInfo.map((student: any) => {
          const studentSessions = allSessions.filter(s => s.studentId === student.ID);
          const nextSession = studentSessions.length > 0 ? 
            `${studentSessions[0].Day} ${studentSessions[0].Time}` : 
            "No sessions scheduled";
          
          return {
            id: student.ID,
            name: `${student.FirstName} ${student.LastName}`,
            grade: 'N/A',
            subject: 'N/A',
            status: 'active',
            progress: 0,
            nextSession,
          };
        }),
        sessions: allSessions,
        billing: billingInfo ? {
          currentBalance: '0.00',
          monthlyRate: '320.00',
          nextPaymentDate: 'N/A',
          paymentMethod: 'N/A',
          sessionsThisMonth,
          ...billingInfo
        } : null,
        transactions: [], // No transaction data in legacy structure
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Submit schedule change request
  app.post("/api/schedule-change-request", requireAuth, async (req, res) => {
    try {
      const { studentId, currentSession, preferredDate, preferredTime, requestedChange, reason } = req.body;
      const studentIds = req.session.studentIds || [];
      
      // Verify the student belongs to the authenticated parent
      if (!studentIds.includes(parseInt(studentId))) {
        return res.status(403).json({ message: "Unauthorized access to student" });
      }

      const result = await submitScheduleChangeRequest({
        studentId: parseInt(studentId),
        currentSession,
        preferredDate,
        preferredTime,
        requestedChange,
        reason
      });
      
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error('Schedule change request error:', error);
      res.status(400).json({ message: "Invalid request data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
