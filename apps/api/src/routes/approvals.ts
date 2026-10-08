import { Router } from "express";
import { eq, inArray, and } from "drizzle-orm";
import { db, rolePermissions, permissions, materialRequests, projects } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

const router = Router();

// Map permissions to the state they can act upon, and the API action required
const APPROVAL_MATRIX: Record<string, { from: string; action: string }> = {
  "material.verify_eng":      { from: "submitted",           action: "verify" },
  "material.approve_pm":      { from: "eng_verified",        action: "approve_pm" },
  "material.issue_stock":     { from: "pm_approved",         action: "issue" },
  "material.procure":         { from: "procurement_pending", action: "procure" },
  "material.review_issuance": { from: "store_issued",        action: "close" },
};

router.get(
  "/awaiting-me",
  requireAuth,
  requirePermission("approvals.view_inbox"),
  async (req: AuthRequest, res) => {
    const { roleId, tenantId } = req.user!;

    // 1. Get all permissions for this user's role
    const userPerms = await db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));

    // 2. Filter to approval permissions and map to expected statuses
    const actionableStatuses: string[] = [];
    const actionMap: Record<string, string> = {}; 

    for (const { key } of userPerms) {
      if (APPROVAL_MATRIX[key]) {
        actionableStatuses.push(APPROVAL_MATRIX[key].from);
        actionMap[APPROVAL_MATRIX[key].from] = APPROVAL_MATRIX[key].action;
      }
    }

    if (actionableStatuses.length === 0) {
      return res.json({ approvals: [], message: "Your role has no pending approval actions." });
    }

    // 3. Fetch requests parked in those statuses for the user's tenant
    const approvals = await db
      .select({
        id: materialRequests.id,
        title: materialRequests.title,
        status: materialRequests.status,
        estimatedCost: materialRequests.estimatedCost,
        projectName: projects.name,
        createdAt: materialRequests.createdAt,
      })
      .from(materialRequests)
      .innerJoin(projects, eq(materialRequests.projectId, projects.id))
      .where(
        and(
          eq(projects.tenantId, tenantId),
          inArray(materialRequests.status, actionableStatuses as any) // cast to any for Drizzle enum typing
        )
      );

    // 4. Attach the required action to each request
    const results = approvals.map(req => ({
      ...req,
      requiredAction: actionMap[req.status]
    }));

    res.json({ approvals: results, count: results.length });
  }
);

export default router;