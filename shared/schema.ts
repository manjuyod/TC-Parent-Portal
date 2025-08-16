import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const parents = pgTable("parents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactPhone: text("contact_phone").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentId: varchar("parent_id").notNull().references(() => parents.id),
  name: text("name").notNull(),
  grade: text("grade"),
  subject: text("subject"),
  status: text("status").default("active"),
  progress: integer("progress").default(0),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => students.id),
  dayOfWeek: text("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  subject: text("subject").notNull(),
  status: text("status").default("confirmed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scheduleChangeRequests = pgTable("schedule_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => students.id),
  currentSession: text("current_session").notNull(),
  preferredDate: text("preferred_date").notNull(),
  preferredTime: text("preferred_time").notNull(),
  requestedChange: text("requested_change").notNull(),
  reason: text("reason"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const billingInfo = pgTable("billing_info", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentId: varchar("parent_id").notNull().references(() => parents.id),
  currentBalance: decimal("current_balance", { precision: 10, scale: 2 }).default("0.00"),
  monthlyRate: decimal("monthly_rate", { precision: 10, scale: 2 }).notNull(),
  nextPaymentDate: text("next_payment_date"),
  paymentMethod: text("payment_method"),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentId: varchar("parent_id").notNull().references(() => parents.id),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").default("paid"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertParentSchema = createInsertSchema(parents).omit({
  id: true,
  createdAt: true,
});

export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const insertScheduleChangeRequestSchema = createInsertSchema(scheduleChangeRequests).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertBillingInfoSchema = createInsertSchema(billingInfo).omit({
  id: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  contactPhone: z.string().min(10, "Please enter a valid phone number"),
});

// Types
export type Parent = typeof parents.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type ScheduleChangeRequest = typeof scheduleChangeRequests.$inferSelect;
export type BillingInfo = typeof billingInfo.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;

export type InsertParent = z.infer<typeof insertParentSchema>;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertScheduleChangeRequest = z.infer<typeof insertScheduleChangeRequestSchema>;
export type InsertBillingInfo = z.infer<typeof insertBillingInfoSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type LoginData = z.infer<typeof loginSchema>;
