import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./index";
import { tenants, projects, materialRequests, users } from "./index";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function run() {
  console.log("🏗️ Seeding operations data (project + stranded requests)...");

  const [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) throw new Error("No tenant found — run 'seed' first");

  const [requester] = await db.select().from(users).where(eq(users.email, "dawit@enderasie.com")).limit(1);
  const actor = requester ?? (await db.select().from(users).limit(1))[0];
  if (!actor) throw new Error("No user found — register a user first");

  // Idempotent: reuse the project if it already exists
  let [project] = await db.select().from(projects).where(eq(projects.code, "AYAT-01"));
  if (!project) {
    [project] = await db.insert(projects).values({
      tenantId: tenant.id,
      code: "AYAT-01",
      name: "Ayat Villa Construction",
      status: "active",
    }).returning();
    console.log("✅ Project created:", project.name);
  } else {
    console.log("ℹ️ Project already exists:", project.name);
  }

  // Park two stranded requests so the Approvals Inbox demo data returns
  const existing = await db.select().from(materialRequests).where(eq(materialRequests.projectId, project.id));
  if (existing.length === 0) {
    await db.insert(materialRequests).values([
      { projectId: project.id, requestedBy: actor.id, title: "Stranded Request 1", description: "Reborn after DB rebuild", estimatedCost: "15000", status: "submitted" },
      { projectId: project.id, requestedBy: actor.id, title: "Stranded Request 2", description: "Reborn after DB rebuild", estimatedCost: "15000", status: "eng_verified" },
    ]);
    console.log("✅ Stranded requests parked in the workflow");
  }

  process.exit(0);
}

run().catch((err) => { console.error("❌", err); process.exit(1); });