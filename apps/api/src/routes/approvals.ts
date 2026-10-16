import { Router } from "express";
import { eq, inArray, and } from "drizzle-orm";
import { db, materialRequests, projects } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { getRolePermissions } from "../lib/permissionCache.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// Map permissions to the state they can act upon, and the API action required
const APPROVAL_MATRIX: Record<string, { from: string; action: string; label: string }> = {
  "material.verify_eng":      { from: "submitted",           action: "verify",     label: "Verify" },
  "material.approve_pm":      { from: "eng_verified",        action: "approve_pm", label: "Approve" },
  "material.reject_pm":       { from: "eng_verified",        action: "reject_pm",  label: "Reject" },
  "material.issue_stock":     { from: "pm_approved",         action: "issue",      label: "Issue Stock" },
  "material.procure":         { from: "procurement_pending", action: "procure",    label: "Procure Shortage" },
  "material.review_issuance": { from: "store_issued",        action: "close",      label: "Close & Deliver" },
};

router.get(
  "/awaiting-me",
  requireAuth,
  requirePermission("approvals.view_inbox"),
  asyncHandler(async (req: AuthRequest, res) => {
    const { roleId, tenantId } = req.user!;

    // 1. Get permissions from IN-MEMORY CACHE (no DB round-trip!)
    const keys = await getRolePermissions(roleId);

    // 2. Build a map: status → array of available actions (fixes overwrite bug)
    const actionableStatuses: Set<string> = new Set();
    const actionMap: Record<string, { action: string; label: string }[]> = {};

    for (const [perm, rule] of Object.entries(APPROVAL_MATRIX)) {
      if (keys.has(perm)) {
        actionableStatuses.add(rule.from);
        if (!actionMap[rule.from]) actionMap[rule.from] = [];
        actionMap[rule.from].push({ action: rule.action, label: rule.label });
      }
    }

    if (actionableStatuses.size === 0) {
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
          inArray(materialRequests.status, Array.from(actionableStatuses) as any)
        )
      );

    // 4. Attach ALL available actions to each request
    const results = approvals.map((req) => ({
      ...req,
      availableActions: actionMap[req.status] || [],
    }));

    res.json({ approvals: results, count: results.length });
  })
);

export default router;