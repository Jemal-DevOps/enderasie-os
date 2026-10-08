import { pgTable, uuid, text, timestamp, pgEnum, numeric, index } from "drizzle-orm/pg-core";
import { users } from "./identity.js"; // Notice the .js!
import { projects } from "./projects.js"; // Notice the .js!

// The lifecycle of a Material Request
export const requestStatusEnum = pgEnum("request_status", [
  "draft",
  "submitted",
  "eng_verified",      // NEW: Project Engineer checks technical need
  "pm_approved",       // PM authorizes
  "procurement_pending", // NEW: shortage sent to Procurement
  "store_issued",      // NEW: stock issued / procured items received
  "delivered",         // NEW: closed by Store Supervisor
  "fulfilled",         // legacy
  "finance_approved",  // legacy
  "rejected",
  "voided",            // NEW: correction with reason
  "returned",          // NEW: correction with reason
]);

export const materialRequests = pgTable("material_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  
  title: text("title").notNull(), // e.g., "500 Bags of Dangote Cement"
  description: text("description"),
  estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }),
  issuedQty: numeric("issued_qty", { precision: 12, scale: 2 }),
  shortQty: numeric("short_qty", { precision: 12, scale: 2 }),
  reason: text("reason"),
  status: requestStatusEnum("status").notNull().default("draft"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("mat_req_project_idx").on(t.projectId),
  statusIdx: index("mat_req_status_idx").on(t.status),
}));