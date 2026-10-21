import { pgTable, uuid, varchar, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const staffTypeEnum = pgEnum("staff_type", ["salaried", "daily"]);
export const staffStatusEnum = pgEnum("staff_status", ["active", "inactive"]);
export const timesheetStatusEnum = pgEnum("timesheet_status", ["draft", "approved", "rejected"]);
export const payrollStatusEnum = pgEnum("payroll_status", ["draft", "paid"]);

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }), // e.g., "Foreman", "Mason", "Accountant"
  type: staffTypeEnum("type").notNull(), // 'salaried' (monthly) or 'daily' (wage)
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull(), // Monthly salary OR Daily wage
  bankAccount: varchar("bank_account", { length: 50 }),
  status: staffStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const timesheets = pgTable("timesheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  staffId: uuid("staff_id").notNull(),
  projectId: uuid("project_id"), // Optional: allocate cost to a project
  date: date("date").notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull().default("8"),
  overtimeHours: numeric("overtime_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  status: timesheetStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: payrollStatusEnum("status").notNull().default("draft"),
  totalNet: numeric("total_net", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payrollEntries = pgTable("payroll_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollRunId: uuid("payroll_run_id").notNull(),
  staffId: uuid("staff_id").notNull(),
  basePay: numeric("base_pay", { precision: 12, scale: 2 }).notNull(),
  overtimePay: numeric("overtime_pay", { precision: 12, scale: 2 }).notNull().default("0"),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull(),
});

// Relations
export const staffRelations = relations(staff, ({ many }) => ({ timesheets: many(timesheets) }));
export const timesheetsRelations = relations(timesheets, ({ one }) => ({
  staff: one(staff, { fields: [timesheets.staffId], references: [staff.id] }),
}));
export const payrollRunsRelations = relations(payrollRuns, ({ many }) => ({ entries: many(payrollEntries) }));
export const payrollEntriesRelations = relations(payrollEntries, ({ one }) => ({
  staff: one(staff, { fields: [payrollEntries.staffId], references: [staff.id] }),
  run: one(payrollRuns, { fields: [payrollEntries.payrollRunId], references: [payrollRuns.id] }),
}));