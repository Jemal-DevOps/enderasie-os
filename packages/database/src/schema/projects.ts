import {
  pgTable, uuid, text, timestamp, pgEnum, boolean, numeric, jsonb,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { tenants, users, roles } from "./identity";

export const projectStatusEnum = pgEnum("project_status",
  ["planning", "active", "on_hold", "completed", "archived"]);

// THE TERRITORIES — physical construction sites
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code").notNull(),                 // 'PRJ-001'
  name: text("name").notNull(),
  location: text("location"),
  status: projectStatusEnum("status").notNull().default("planning"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  budget: numeric("budget", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqCode: uniqueIndex("projects_tenant_code_uniq").on(t.tenantId, t.code),
  tenantIdx: index("projects_tenant_idx").on(t.tenantId),
}));

// USER ↔ PROJECT ↔ ROLE — the Procore-style assignment matrix
export const projectAssignments = pgTable("project_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("project_assignments_uniq").on(t.projectId, t.userId, t.roleId),
}));

// IMMUTABLE LEDGER — who did what, when, with before/after snapshots
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id),
  entityTable: text("entity_table").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("audit_tenant_idx").on(t.tenantId, t.createdAt),
}));