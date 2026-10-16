import { Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, projects, materialRequests } from "@enderasie/database";
import { AuthRequest } from "./auth.js";

// Guard 1: any projectId in params/body must live in the caller's tenant
export async function requireProjectScope(req: AuthRequest, res: Response, next: NextFunction) {
  const projectId = req.params.projectId || req.body?.projectId;
  if (!projectId) return next();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)));
  if (!project) return res.status(404).json({ error: "Project not found in your company" });
  next();
}

// Guard 2: any material request id must prove ownership through the project join
export async function requireRequestScope(req: AuthRequest, res: Response, next: NextFunction) {
  const requestId = req.params.id || req.body?.requestId;
  if (!requestId) return next();
  const [row] = await db
    .select({ id: materialRequests.id })
    .from(materialRequests)
    .innerJoin(projects, eq(materialRequests.projectId, projects.id))
    .where(and(eq(materialRequests.id, requestId), eq(projects.tenantId, req.user!.tenantId)));
  if (!row) return res.status(404).json({ error: "Request not found in your company" });
  next();
}