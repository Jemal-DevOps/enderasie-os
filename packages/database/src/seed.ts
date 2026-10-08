import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm"; // <--- Added eq for explicit fetching
import * as schema from "./index";
import { roles, permissions, rolePermissions, tenants, users, tenantMemberships } from "./index";

// Connect to the database (local or Neon, depending on .env)
const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);
const db = drizzle(sql, { schema });

async function seed() {
  console.log("🌱 Seeding Enderasie OS...");

  // 1. Seed the 8 System Roles
  await db.insert(roles).values([
    { key: "company_owner", name: "Company Owner", scope: "company", description: "Full access to the company realm" },
    { key: "company_admin", name: "Company Admin", scope: "company", description: "Manages users and company settings" },
    { key: "project_manager", name: "Project Manager", scope: "project", description: "Oversees site operations and budget" },
    { key: "site_engineer", name: "Site Engineer", scope: "project", description: "Manages daily site activities and material requests" },
    { key: "storekeeper", name: "Storekeeper", scope: "project", description: "Manages GRN, MIN, and physical inventory" },
    { key: "finance_manager", name: "Finance Manager", scope: "company", description: "Manages budgets, POs, and invoices" },
    { key: "subcontractor", name: "Subcontractor", scope: "project", description: "External vendor with limited access" },
    { key: "auditor", name: "Auditor", scope: "company", description: "Read-only access to all records" },
  ]).onConflictDoNothing();

  // EXPLICITLY fetch them from the DB so we have their IDs!
  const seededRoles = await db.select().from(roles);
  console.log("✅ Roles seeded");

  // 2. Seed the Permission Catalog
  await db.insert(permissions).values([
    { key: "tenant.manage", module: "core", action: "manage" },
    { key: "user.manage", module: "core", action: "manage" },
    { key: "project.create", module: "project", action: "create" },
    { key: "project.view", module: "project", action: "view" },
    { key: "inventory.grn.create", module: "inventory", action: "create" },
    { key: "inventory.grn.approve", module: "inventory", action: "approve" },
    { key: "inventory.min.create", module: "inventory", action: "create" },
    { key: "finance.budget.edit", module: "finance", action: "edit" },
    { key: "finance.invoice.approve", module: "finance", action: "approve" },
  ]).onConflictDoNothing();

  // EXPLICITLY fetch them!
  const seededPerms = await db.select().from(permissions);
  console.log("✅ Permissions seeded");

  // Helper to find a permission ID by its key
  const permId = (key: string) => seededPerms.find(p => p.key === key)!.id;
  const owner = seededRoles.find(r => r.key === "company_owner")!;
  const admin = seededRoles.find(r => r.key === "company_admin")!;
  const pm = seededRoles.find(r => r.key === "project_manager")!;
  const store = seededRoles.find(r => r.key === "storekeeper")!;
  const finance = seededRoles.find(r => r.key === "finance_manager")!;

  // 3. Map Roles to Permissions (The Access Matrix)
  await db.insert(rolePermissions).values([
    // Owner gets EVERYTHING
    ...seededPerms.map(p => ({ roleId: owner.id, permissionId: p.id })),
    // Admin gets almost everything except tenant deletion
    ...seededPerms.filter(p => p.key !== "tenant.manage").map(p => ({ roleId: admin.id, permissionId: p.id })),
    // PM gets project and inventory management
    { roleId: pm.id, permissionId: permId("project.view") },
    { roleId: pm.id, permissionId: permId("inventory.grn.create") },
    { roleId: pm.id, permissionId: permId("inventory.grn.approve") },
    { roleId: pm.id, permissionId: permId("inventory.min.create") },
    { roleId: pm.id, permissionId: permId("finance.budget.edit") },
    // Storekeeper gets inventory creation
    { roleId: store.id, permissionId: permId("inventory.grn.create") },
    { roleId: store.id, permissionId: permId("inventory.min.create") },
    // Finance gets finance modules
    { roleId: finance.id, permissionId: permId("finance.budget.edit") },
    { roleId: finance.id, permissionId: permId("finance.invoice.approve") },
  ]).onConflictDoNothing();

  console.log("✅ Role-Permissions mapped");

  // 4. Create the First Tenant & Super Admin
  await db.insert(tenants).values({
    slug: "enderasie-gc",
    name: "Enderasie General Construction",
    country: "ET",
    currency: "ETB",
  }).onConflictDoNothing();

  // Explicitly fetch the tenant we just created (or already existed)
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "enderasie-gc"));

  // Note: We use a dummy hash here. The API layer will handle real bcrypt hashing when users register/reset.
  await db.insert(users).values({
    email: "admin@enderasie.com",
    passwordHash: "super_secret_hash_replace_in_api", 
    fullName: "Jemal (Super Admin)",
    phone: "+251900000000",
  }).onConflictDoNothing();

  // Explicitly fetch the user
  const [superAdmin] = await db.select().from(users).where(eq(users.email, "admin@enderasie.com"));

  // 5. Link the User to the Tenant with the Owner Role
  await db.insert(tenantMemberships).values({
    tenantId: tenant.id,
    userId: superAdmin.id,
    roleId: owner.id,
  }).onConflictDoNothing();

  console.log("🏢 First Tenant & Super Admin created!");
  console.log("📧 Email: admin@enderasie.com");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});