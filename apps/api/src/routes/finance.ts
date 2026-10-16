import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { asyncHandler } from "../lib/asyncHandler.js";
// import { db, budgets, auditLog } from "@enderasie/database"; // We will import these in Sprint 4

const router = Router();

// GET /api/finance/budget
// FIXED (መ): Wrapped in asyncHandler to catch any future DB errors
// FIXED (ሐ): Strictly typed with AuthRequest and Response
router.get(
  "/budget",
  requireAuth,
  requirePermission("finance.budget.edit"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Future Sprint 4: Fetch actual budget from DB here
    // const [companyBudget] = await db.select().from(budgets).where(eq(budgets.tenantId, req.user!.tenantId));

    res.json({
      message: "Welcome to the highly classified Finance Dashboard!",
      user: { id: req.user!.userId, email: req.user!.email },
      data: {
        totalBudget: 5000000,
        spent: 1250000,
        remaining: 3750000,
        currency: "ETB"
      }
    });
  })
);

// POST /api/finance/budget/update (Added to demonstrate Sprint 4 Architecture)
router.post(
  "/budget/update",
  requireAuth,
  requirePermission("finance.budget.edit"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.body.newBudget) {
      return res.status(400).json({ error: "newBudget is required" });
    }

    /* 
    ================================================================
    SPRINT 4 BLUEPRINT: Atomicity (ሀ) + Race Condition Safety (ለ)
    When we connect the real DB, the code below is exactly how it 
    will be written to prevent data corruption and double-spending.
    ================================================================
    
    const updated = await db.transaction(async (tx) => {
      // 1. COMPARE-AND-SWAP (CAS) for Race Condition Safety
      const [row] = await tx.update(budgets)
        .set({ amount: req.body.newBudget, updatedAt: new Date() })
        .where(and(eq(budgets.id, req.params.id), eq(budgets.version, req.body.version))) 
        .returning();

      if (!row) return null; // Another user updated it first!

      // 2. ATOMIC AUDIT LOG (If this fails, the update rolls back)
      await tx.insert(auditLog).values({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        entityTable: "budgets",
        entityId: row.id,
        action: "budget_update",
        before: { amount: req.body.oldBudget },
        after: { amount: req.body.newBudget },
        ip: req.ip,
      });

      return row;
    });

    if (!updated) {
      return res.status(409).json({ error: "Conflict: budget was updated by another user." });
    }
    return res.json({ message: "Budget updated", budget: updated });
    */

    // Mock response for today
    res.json({
      message: "Budget updated successfully (mocked).",
      requestedBy: req.user!.email
    });
  })
);

export default router;