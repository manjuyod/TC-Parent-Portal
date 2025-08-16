import { type Parent, type Student, type Session, type ScheduleChangeRequest, type BillingInfo, type Transaction, type InsertParent, type InsertStudent, type InsertSession, type InsertScheduleChangeRequest, type InsertBillingInfo, type InsertTransaction } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Parent operations
  getParentByPhone(phone: string): Promise<Parent | undefined>;
  createParent(parent: InsertParent): Promise<Parent>;
  
  // Student operations
  getStudentsByParentId(parentId: string): Promise<Student[]>;
  getStudentById(id: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  
  // Session operations
  getSessionsByStudentIds(studentIds: string[]): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  
  // Schedule change requests
  createScheduleChangeRequest(request: InsertScheduleChangeRequest): Promise<ScheduleChangeRequest>;
  getScheduleChangeRequestsByParentId(parentId: string): Promise<ScheduleChangeRequest[]>;
  
  // Billing operations
  getBillingInfoByParentId(parentId: string): Promise<BillingInfo | undefined>;
  createBillingInfo(billingInfo: InsertBillingInfo): Promise<BillingInfo>;
  
  // Transaction operations
  getTransactionsByParentId(parentId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
}

export class MemStorage implements IStorage {
  private parents: Map<string, Parent>;
  private students: Map<string, Student>;
  private sessions: Map<string, Session>;
  private scheduleChangeRequests: Map<string, ScheduleChangeRequest>;
  private billingInfos: Map<string, BillingInfo>;
  private transactions: Map<string, Transaction>;

  constructor() {
    this.parents = new Map();
    this.students = new Map();
    this.sessions = new Map();
    this.scheduleChangeRequests = new Map();
    this.billingInfos = new Map();
    this.transactions = new Map();
    
    // Initialize with sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // Create sample parent
    const parentId = randomUUID();
    const parent: Parent = {
      id: parentId,
      contactPhone: "(555) 123-4567",
      name: "Sarah Johnson",
      email: "sarah.johnson@email.com",
      createdAt: new Date(),
    };
    this.parents.set(parentId, parent);

    // Create sample students
    const student1Id = randomUUID();
    const student1: Student = {
      id: student1Id,
      parentId,
      name: "Emily Johnson",
      grade: "8th Grade",
      subject: "Mathematics",
      status: "active",
      progress: 75,
    };
    this.students.set(student1Id, student1);

    const student2Id = randomUUID();
    const student2: Student = {
      id: student2Id,
      parentId,
      name: "Michael Johnson",
      grade: "6th Grade",
      subject: "Science",
      status: "active",
      progress: 60,
    };
    this.students.set(student2Id, student2);

    // Create sample sessions
    const session1: Session = {
      id: randomUUID(),
      studentId: student1Id,
      dayOfWeek: "Monday",
      startTime: "3:00 PM",
      endTime: "4:00 PM",
      subject: "Mathematics",
      status: "confirmed",
      createdAt: new Date(),
    };
    this.sessions.set(session1.id, session1);

    const session2: Session = {
      id: randomUUID(),
      studentId: student1Id,
      dayOfWeek: "Friday",
      startTime: "2:00 PM",
      endTime: "3:00 PM",
      subject: "Mathematics",
      status: "confirmed",
      createdAt: new Date(),
    };
    this.sessions.set(session2.id, session2);

    const session3: Session = {
      id: randomUUID(),
      studentId: student2Id,
      dayOfWeek: "Wednesday",
      startTime: "4:30 PM",
      endTime: "5:30 PM",
      subject: "Science",
      status: "pending",
      createdAt: new Date(),
    };
    this.sessions.set(session3.id, session3);

    // Create billing info
    const billingInfo: BillingInfo = {
      id: randomUUID(),
      parentId,
      currentBalance: "0.00",
      monthlyRate: "320.00",
      nextPaymentDate: "March 15, 2024",
      paymentMethod: "**** 4567",
    };
    this.billingInfos.set(billingInfo.id, billingInfo);

    // Create sample transactions
    const transaction1: Transaction = {
      id: randomUUID(),
      parentId,
      date: "Feb 15, 2024",
      description: "Monthly Tuition - Emily & Michael",
      amount: "320.00",
      status: "paid",
      createdAt: new Date(),
    };
    this.transactions.set(transaction1.id, transaction1);

    const transaction2: Transaction = {
      id: randomUUID(),
      parentId,
      date: "Jan 15, 2024",
      description: "Monthly Tuition - Emily & Michael",
      amount: "320.00",
      status: "paid",
      createdAt: new Date(),
    };
    this.transactions.set(transaction2.id, transaction2);
  }

  async getParentByPhone(phone: string): Promise<Parent | undefined> {
    return Array.from(this.parents.values()).find(parent => parent.contactPhone === phone);
  }

  async createParent(insertParent: InsertParent): Promise<Parent> {
    const id = randomUUID();
    const parent: Parent = { 
      ...insertParent, 
      id,
      createdAt: new Date(),
    };
    this.parents.set(id, parent);
    return parent;
  }

  async getStudentsByParentId(parentId: string): Promise<Student[]> {
    return Array.from(this.students.values()).filter(student => student.parentId === parentId);
  }

  async getStudentById(id: string): Promise<Student | undefined> {
    return this.students.get(id);
  }

  async createStudent(insertStudent: InsertStudent): Promise<Student> {
    const id = randomUUID();
    const student: Student = { ...insertStudent, id };
    this.students.set(id, student);
    return student;
  }

  async getSessionsByStudentIds(studentIds: string[]): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(session => 
      studentIds.includes(session.studentId)
    );
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = randomUUID();
    const session: Session = { 
      ...insertSession, 
      id,
      createdAt: new Date(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async createScheduleChangeRequest(insertRequest: InsertScheduleChangeRequest): Promise<ScheduleChangeRequest> {
    const id = randomUUID();
    const request: ScheduleChangeRequest = { 
      ...insertRequest, 
      id,
      status: "pending",
      createdAt: new Date(),
    };
    this.scheduleChangeRequests.set(id, request);
    return request;
  }

  async getScheduleChangeRequestsByParentId(parentId: string): Promise<ScheduleChangeRequest[]> {
    const students = await this.getStudentsByParentId(parentId);
    const studentIds = students.map(s => s.id);
    return Array.from(this.scheduleChangeRequests.values()).filter(request => 
      studentIds.includes(request.studentId)
    );
  }

  async getBillingInfoByParentId(parentId: string): Promise<BillingInfo | undefined> {
    return Array.from(this.billingInfos.values()).find(billing => billing.parentId === parentId);
  }

  async createBillingInfo(insertBillingInfo: InsertBillingInfo): Promise<BillingInfo> {
    const id = randomUUID();
    const billingInfo: BillingInfo = { ...insertBillingInfo, id };
    this.billingInfos.set(id, billingInfo);
    return billingInfo;
  }

  async getTransactionsByParentId(parentId: string): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(transaction => 
      transaction.parentId === parentId
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = randomUUID();
    const transaction: Transaction = { 
      ...insertTransaction, 
      id,
      createdAt: new Date(),
    };
    this.transactions.set(id, transaction);
    return transaction;
  }
}

export const storage = new MemStorage();
