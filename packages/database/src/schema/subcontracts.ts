import { pgTable, uuid, varchar, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const subcontractorStatusEnum = pgEnum("subcontractor_status", ["active", "inactive"]);
export const subcontractStatusEnum = pgEnum("subcontract_status", ["active", "closed", "terminated"]);
export const measurementStatusEnum = pgEnum("measurement_status", ["draft", "submitted", "approved", "partially_paid", "fully_paid"]);

export const subcontractors = pgTable("subcontractors", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  trade: varchar("trade", { length: 100 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  status: subcontractorStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subcontracts = pgTable("subcontracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  projectId: uuid("project_id").notNull(),
  subcontractorId: uuid("subcontractor_id").notNull(),
  contractNumber: varchar("contract_number", { length: 50 }).notNull(),
  scope: varchar("scope", { length: 500 }),
  totalValue: numeric("total_value", { precision: 15, scale: 2 }).notNull(),
  retentionPercent: numeric("retention_percent", { precision: 5, scale: 2 }).notNull().default("10.00"),
  status: subcontractStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const measurements = pgTable("measurements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  subcontractId: uuid("subcontract_id").notNull(),
  measurementNumber: varchar("measurement_number", { length: 50 }).notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),      // ← FIXED
  claimedAmount: numeric("claimed_amount", { precision: 15, scale: 2 }).notNull(),
  approvedAmount: numeric("approved_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: measurementStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const subcontractPayments = pgTable("subcontract_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  measurementId: uuid("measurement_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paidDate: date("paid_date").notNull(),
  reference: varchar("reference", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subcontractorsRelations = relations(subcontractors, ({ many }) => ({ subcontracts: many(subcontracts) }));
export const subcontractsRelations = relations(subcontracts, ({ one, many }) => ({
  subcontractor: one(subcontractors, { fields: [subcontracts.subcontractorId], references: [subcontractors.id] }),
  measurements: many(measurements),
}));
export const measurementsRelations = relations(measurements, ({ one, many }) => ({
  subcontract: one(subcontracts, { fields: [measurements.subcontractId], references: [subcontracts.id] }),
  payments: many(subcontractPayments),
}));
export const subcontractPaymentsRelations = relations(subcontractPayments, ({ one }) => ({
  measurement: one(measurements, { fields: [subcontractPayments.measurementId], references: [measurements.id] }),
}));