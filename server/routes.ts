import type { Express } from "express";
import { createServer, type Server } from "http";
import { findInquiryByEmailAndPhone, getHoursBalance, getSessions, searchStudent, submitScheduleChangeRequest, getFranchiseEmail, query } from "./sqlServerStorage";
import { emailService } from "./emailService";
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

  // Get students only (fast initial load)
  app.get("/api/students", requireAuth, async (req, res) => {
    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      
      // Get parent and student info only
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent data not found" });
      }

      const studentsInfo = inquiryData.students;

      res.json({
        students: studentsInfo.map((student: any) => ({
          id: student.ID,
          name: `${student.FirstName} ${student.LastName}`,
          grade: 'N/A',
          subject: 'N/A',
          status: 'active',
          progress: 0
        }))
      });
    } catch (error) {
      console.error('Students error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get recent sessions (from tblSessionSchedule - past dates)
  app.get("/api/sessions/recent", requireAuth, async (req, res) => {
    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      const { studentId } = req.query;
      
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent data not found" });
      }

      const studentsInfo = inquiryData.students;
      const recentSessions: any[] = [];

      // Find student by name (the frontend passes the selected student name)
      const selectedStudentName = studentId; // This is actually the student name from the frontend
      let targetStudent = null;
      
      if (selectedStudentName) {
        targetStudent = studentsInfo.find((s: any) => 
          `${s.FirstName} ${s.LastName}` === selectedStudentName
        );
      }

      if (targetStudent) {
        const studentSessions = await getSessions(targetStudent.ID);
        studentSessions.forEach((session: any) => {
          if (session.category === "recent") {
            session.studentName = `${targetStudent.FirstName} ${targetStudent.LastName}`;
            session.studentId = targetStudent.ID;
            recentSessions.push(session);
          }
        });
      } else if (!selectedStudentName) {
        // Get sessions for all students if no specific student
        for (const student of studentsInfo) {
          const studentSessions = await getSessions(student.ID);
          studentSessions.forEach((session: any) => {
            if (session.category === "recent") {
              session.studentName = `${student.FirstName} ${student.LastName}`;
              session.studentId = student.ID;
              recentSessions.push(session);
            }
          });
        }
      }

      res.json({
        sessions: recentSessions
      });
    } catch (error) {
      console.error('Recent sessions error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get upcoming sessions (from tblSessionSchedule - future dates)
  app.get("/api/sessions/upcoming", requireAuth, async (req, res) => {
    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      const { studentId } = req.query;
      
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent data not found" });
      }

      const studentsInfo = inquiryData.students;
      const upcomingSessions: any[] = [];

      // Find student by name (the frontend passes the selected student name)
      const selectedStudentName = studentId; // This is actually the student name from the frontend
      let targetStudent = null;
      
      if (selectedStudentName) {
        targetStudent = studentsInfo.find((s: any) => 
          `${s.FirstName} ${s.LastName}` === selectedStudentName
        );
      }

      if (targetStudent) {
        const studentSessions = await getSessions(targetStudent.ID);
        studentSessions.forEach((session: any) => {
          if (session.category === "upcoming") {
            session.studentName = `${targetStudent.FirstName} ${targetStudent.LastName}`;
            session.studentId = targetStudent.ID;
            upcomingSessions.push(session);
          }
        });
      } else if (!selectedStudentName) {
        // Get sessions for all students if no specific student
        for (const student of studentsInfo) {
          const studentSessions = await getSessions(student.ID);
          studentSessions.forEach((session: any) => {
            if (session.category === "upcoming") {
              session.studentName = `${student.FirstName} ${student.LastName}`;
              session.studentId = student.ID;
              upcomingSessions.push(session);
            }
          });
        }
      }

      res.json({
        sessions: upcomingSessions
      });
    } catch (error) {
      console.error('Upcoming sessions error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get billing (heavy query, load only when needed)
  app.get("/api/billing", requireAuth, async (req, res) => {
    try {
      const inquiryId = req.session.inquiryId!;
      
      // Get billing information
      const billingInfo = await getHoursBalance(inquiryId);
      
      res.json({
        billing: billingInfo || null
      });
    } catch (error) {
      console.error('Billing error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Submit schedule change request
  app.post("/api/schedule-change-request", requireAuth, async (req, res) => {
    try {
      const { studentId, currentSession, preferredDate, preferredTime, requestedChange, reason, additionalNotes } = req.body;
      const studentIds = req.session.studentIds || [];
      const inquiryId = req.session.inquiryId!;
      const email = req.session.email!;
      const contactPhone = req.session.contactPhone!;
      
      // Verify the student belongs to the authenticated parent
      if (!studentIds.includes(parseInt(studentId))) {
        return res.status(403).json({ message: "Unauthorized access to student" });
      }

      // Get parent and student information for email
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent data not found" });
      }

      const student = inquiryData.students.find((s: any) => s.ID === parseInt(studentId));
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Get franchise email
      const franchiseEmail = await getFranchiseEmail(inquiryId);
      if (!franchiseEmail) {
        return res.status(404).json({ message: "Franchise email not found" });
      }

      // Submit the schedule change request (existing functionality)
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

      // Get franchise email for client-side email composition
      res.json({ 
        ...result, 
        franchiseEmail: franchiseEmail
      });
    } catch (error) {
      console.error('Schedule change request error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // New endpoint to get franchise email based on student
  app.post("/api/get-franchise-email", async (req, res) => {
    try {
      const { studentId } = req.body;
      
      if (!studentId) {
        return res.status(400).json({ message: "Student ID is required" });
      }

      // Get the inquiry ID for this student  
      const inquiryResult = await query(
        "SELECT InquiryID FROM tblstudents WHERE ID = @studentId",
        { studentId: parseInt(studentId) }
      );

      if (!inquiryResult.recordset || inquiryResult.recordset.length === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      const inquiryID = inquiryResult.recordset[0].InquiryID;

      // Get franchise email using your specific query
      const franchiseResult = await query(
        "SELECT FranchiesEmail FROM tblFranchies WHERE ID IN (SELECT FranchiesID FROM tblInquiry WHERE ID = @InquiryID)",
        { InquiryID: inquiryID }
      );

      if (!franchiseResult.recordset || franchiseResult.recordset.length === 0) {
        return res.status(404).json({ message: "Franchise email not found" });
      }

      const franchiseEmail = franchiseResult.recordset[0].FranchiesEmail;

      res.json({ 
        franchiseEmail: franchiseEmail 
      });

    } catch (error) {
      console.error("Error fetching franchise email:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
