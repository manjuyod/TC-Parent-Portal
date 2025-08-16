import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, insertScheduleChangeRequestSchema } from "@shared/schema";
import session from "express-session";

declare module "express-session" {
  interface SessionData {
    parentId?: string;
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
      const { contactPhone } = loginSchema.parse(req.body);
      
      const parent = await storage.getParentByPhone(contactPhone);
      if (!parent) {
        return res.status(401).json({ message: "Invalid phone number. Please contact your tutoring center." });
      }

      req.session.parentId = parent.id;
      res.json({ success: true, parent: { id: parent.id, name: parent.name } });
    } catch (error) {
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
      const parentId = req.session.parentId!;
      const parent = await storage.getParentByPhone("(555) 123-4567"); // This would be looked up by ID in real implementation
      
      if (!parent) {
        return res.status(404).json({ message: "Parent not found" });
      }

      const students = await storage.getStudentsByParentId(parentId);
      
      res.json({
        parent: { id: parent.id, name: parent.name, contactPhone: parent.contactPhone },
        students: students.map(s => ({ id: s.id, name: s.name, grade: s.grade, subject: s.subject, status: s.status, progress: s.progress }))
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get dashboard data
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const parentId = req.session.parentId!;
      
      const students = await storage.getStudentsByParentId(parentId);
      const studentIds = students.map(s => s.id);
      const sessions = await storage.getSessionsByStudentIds(studentIds);
      const billingInfo = await storage.getBillingInfoByParentId(parentId);
      const transactions = await storage.getTransactionsByParentId(parentId);

      // Calculate sessions this month (mock calculation)
      const sessionsThisMonth = sessions.length * 4; // Assuming weekly sessions

      res.json({
        students: students.map(student => {
          const studentSessions = sessions.filter(s => s.studentId === student.id);
          const nextSession = studentSessions.length > 0 ? 
            `${studentSessions[0].dayOfWeek} ${studentSessions[0].startTime}` : 
            "No sessions scheduled";
          
          return {
            ...student,
            nextSession,
          };
        }),
        sessions: sessions.map(session => {
          const student = students.find(s => s.id === session.studentId);
          return {
            ...session,
            studentName: student?.name || "Unknown",
          };
        }),
        billing: billingInfo ? {
          ...billingInfo,
          sessionsThisMonth,
        } : null,
        transactions: transactions.slice(0, 10), // Latest 10 transactions
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Submit schedule change request
  app.post("/api/schedule-change-request", requireAuth, async (req, res) => {
    try {
      const requestData = insertScheduleChangeRequestSchema.parse(req.body);
      
      // Verify the student belongs to the authenticated parent
      const student = await storage.getStudentById(requestData.studentId);
      if (!student || student.parentId !== req.session.parentId) {
        return res.status(403).json({ message: "Unauthorized access to student" });
      }

      const request = await storage.createScheduleChangeRequest(requestData);
      
      res.json({ 
        success: true, 
        message: "Schedule change request submitted successfully!",
        request 
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid request data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
