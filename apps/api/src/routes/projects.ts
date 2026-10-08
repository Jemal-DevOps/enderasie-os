import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, projects } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select({ id: projects.id, code: projects.code, name: projects.name, status: projects.status })
    .from(projects)
    .where(eq(projects.tenantId, req.user!.tenantId));
  res.json({ projects: rows });
});

export default router;