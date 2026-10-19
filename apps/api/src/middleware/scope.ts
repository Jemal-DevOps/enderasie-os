import { Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, projects, materialRequests, contracts, ipcs } from "@enderasie/database";
import { AuthRequest } from "./auth.js";
import { db, projects, materialRequests, contracts, ipcs, subcontracts, measurements } from "@enderasie/database";
// Guard 1: Projects
export async function requireProjectScope(req: AuthRequest, res: Response, next: NextFunction) {
  const projectId = req.params.projectId || req.body?.projectId;
  if (!projectId) return next();
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)));
  if (!project) return res.status(404).json({ error: "Project not found in your company" });
  next();
}

// Guard 2: Material Requests
export async function requireRequestScope(req: AuthRequest, res: Response, next: NextFunction) {
  const requestId = req.params.id || req.body?.requestId;
  if (!requestId) return next();
  const [row] = await db.select({ id: materialRequests.id }).from(materialRequests).innerJoin(projects, eq(materialRequests.projectId, projects.id)).where(and(eq(materialRequests.id, requestId), eq(projects.tenantId, req.user!.tenantId)));
  if (!row) return res.status(404).json({ error: "Request not found in your company" });
  next();
}

// Guard 3: Contracts (NEW)
export async function requireContractScope(req: AuthRequest, res: Response, next: NextFunction) {
  const contractId = req.params.contractId || req.body?.contractId;
  if (!contractId) return next();
  const [row] = await db.select({ id: contracts.id }).from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.tenantId, req.user!.tenantId)));
  if (!row) return res.status(404).json({ error: "Contract not found in your company" });
  next();
}

// Guard 4: IPCs (NEW)
export async function requireIpcScope(req: AuthRequest, res: Response, next: NextFunction) {
  const ipcId = req.params.id || req.body?.ipcId;
  if (!ipcId) return next();
  const [row] = await db.select({ id: ipcs.id })
    .from(ipcs)
    .innerJoin(contracts, eq(ipcs.contractId, contracts.id))
    .where(and(eq(ipcs.id, ipcId), eq(contracts.tenantId, req.user!.tenantId)));
  if (!row) return res.status(404).json({ error: "IPC not found in your company" });
  next();
}
// Guard: Subcontracts (Prevents cross-tenant access to subcontracts)
export async function requireSubcontractScope(req: AuthRequest, res: Response, next: NextFunction) {
  const subcontractId = req.params.id || req.body?.subcontractId;
  if (!subcontractId) return next();
  const [row] = await db.select({ id: subcontracts.id })
    .from(subcontracts)
    .where(and(eq(subcontracts.id, subcontractId), eq(subcontracts.tenantId, req.user!.tenantId)));
  if (!row) return res.status(404).json({ error: "Subcontract not found in your company" });
  next();
}

// Guard: Measurements (Prevents cross-tenant access to measurements)
export async function requireMeasurementScope(req: AuthRequest, res: Response, next: NextFunction) {
  const measurementId = req.params.id;
  if (!measurementId) return next();
  const [row] = await db.select({ id: measurements.id })
    .from(measurements)
    .innerJoin(subcontracts, eq(measurements.subcontractId, subcontracts.id))
    .where(and(eq(measurements.id, measurementId), eq(subcontracts.tenantId, req.user!.tenantId)));
  if (!row) return res.status(404).json({ error: "Measurement not found in your company" });
  next();
}