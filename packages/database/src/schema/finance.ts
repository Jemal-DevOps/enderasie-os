import { pgTable, uuid, varchar, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const contractStatusEnum = pgEnum("contract_status", ["active", "closed", "terminated"]);
export const ipcStatusEnum = pgEnum("ipc_status", ["draft", "submitted", "approved", "partially_paid", "fully_paid"]);

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  projectId: uuid("project_id").notNull(),
  contractNumber: varchar("contract_number", { length: 50 }).notNull(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  totalValue: numeric("total_value", { precision: 15, scale: 2 }).notNull(),
  retentionPercent: numeric("retention_percent", { precision: 5, scale: 2 }).notNull().default("5.00"),
  status: contractStatusEnum("status").notNull().default("active"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ipcs = pgTable("ipcs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contractId: uuid("contract_id").notNull(),
  ipcNumber: varchar("ipc_number", { length: 50 }).notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  claimedAmount: numeric("claimed_amount", { precision: 15, scale: 2 }).notNull(),
  approvedAmount: numeric("approved_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: ipcStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cashReceipts = pgTable("cash_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  ipcId: uuid("ipc_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  receivedDate: date("received_date").notNull(),
  reference: varchar("reference", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations for clean Drizzle joins
export const contractsRelations = relations(contracts, ({ many }) => ({ ipcs: many(ipcs) }));
export const ipcsRelations = relations(ipcs, ({ one, many }) => ({
  contract: one(contracts, { fields: [ipcs.contractId], references: [contracts.id] }),
  receipts: many(cashReceipts),
}));
export const cashReceiptsRelations = relations(cashReceipts, ({ one }) => ({
  ipc: one(ipcs, { fields: [cashReceipts.ipcId], references: [ipcs.id] }),
}));