import {
  pgTable, uuid, text, timestamp, pgEnum, boolean,
  uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";

export const tenantStatusEnum = pgEnum("tenant_status", ["trial", "active", "suspended"]);
export const roleScopeEnum = pgEnum("role_scope", ["company", "project"]);
export const membershipStatusEnum = pgEnum("membership_status", ["invited", "active", "suspended"]);

// THE REALM — one row per construction company
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  country: text("country").notNull().default("ET"),
  currency: text("currency").notNull().default("ETB"),
  timezone: text("timezone").notNull().default("Africa/Addis_Ababa"),
  status: tenantStatusEnum("status").notNull().default("trial"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// GLOBAL IDENTITY — one human, many companies
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ROLE CATALOG — company-level AND project-level roles
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),        // 'company_admin', 'site_engineer'...
  name: text("name").notNull(),
  scope: roleScopeEnum("scope").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(true),
});

// USER ↔ COMPANY ↔ ROLE
export const tenantMemberships = pgTable("tenant_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  status: membershipStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("tenant_memberships_uniq").on(t.tenantId, t.userId, t.roleId),
}));

// FINE-GRAINED PERMISSION CATALOG — 'grn.create', 'budget.approve'...
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  module: text("module").notNull(),
  action: text("action").notNull(),
});

// ROLE ↔ PERMISSION (composite PK)
export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
}));