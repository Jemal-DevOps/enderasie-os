import { Router, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db, contracts, ipcs, cashReceipts, auditLog } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireContractScope, requireIpcScope } from "../middleware/scope.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

const createContractSchema = z.object({
  projectId: z.string().uuid(),
  contractNumber: z.string().min(1),
  clientName: z.string().min(1),
  totalValue: z.string().regex(/^\d+(\.\d+)?$/),
  retentionPercent: z.string().regex(/^\d+(\.\d+)?$/).optional().default("5.00"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const createIpcSchema = z.object({
  ipcNumber: z.string().min(1),
  claimedAmount: z.string().regex(/^\d+(\.\d+)?$/),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

const approveIpcSchema = z.object({
  approvedAmount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  reason: z.string().optional(),
});

const recordReceiptSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  receivedDate: z.string().optional(),
  reference: z.string().optional(),
});

// 1. LIST CONTRACTS
router.get("/contracts", requireAuth, requirePermission("finance.contract.view"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rows = await db.select().from(contracts).where(eq(contracts.tenantId, req.user!.tenantId));
    res.json({ contracts: rows });
  })
);

// 2. CREATE CONTRACT
router.post("/contracts", requireAuth, requirePermission("finance.contract.create"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = createContractSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

    const created = await db.transaction(async (tx) => {
      const [contract] = await tx.insert(contracts).values({
        ...parsed.data,
        tenantId: req.user!.tenantId,
      }).returning();

      await tx.insert(auditLog).values({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        entityTable: "contracts",
        entityId: contract.id,
        action: "create",
        after: { contractNumber: contract.contractNumber, totalValue: contract.totalValue },
        ip: req.ip,
      });
      return contract;
    });

    res.status(201).json({ message: "Contract created", contract: created });
  })
);

// 3. LIST IPCs FOR A CONTRACT
router.get("/contracts/:contractId/ipcs", requireAuth, requireContractScope, requirePermission("finance.contract.view"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rows = await db.select().from(ipcs).where(eq(ipcs.contractId, req.params.contractId));
    res.json({ ipcs: rows });
  })
);

// 4. CREATE IPC (Draft)
router.post("/contracts/:contractId/ipcs", requireAuth, requireContractScope, requirePermission("finance.ipc.create"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = createIpcSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

    const created = await db.transaction(async (tx) => {
      const [ipc] = await tx.insert(ipcs).values({
        ...parsed.data,
        contractId: req.params.contractId,
        tenantId: req.user!.tenantId,
        status: "draft",
        approvedAmount: "0",
      }).returning();

      await tx.insert(auditLog).values({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        entityTable: "ipcs",
        entityId: ipc.id,
        action: "create_draft",
        after: { ipcNumber: ipc.ipcNumber, claimedAmount: ipc.claimedAmount },
        ip: req.ip,
      });
      return ipc;
    });

    res.status(201).json({ message: "IPC Draft created", ipc: created });
  })
);

// 5. APPROVE IPC (outcome pattern — single response, outside the transaction)
type ApproveOutcome =
  | { code: 200; ipc: typeof ipcs.$inferSelect }
  | { code: 400 | 404 | 409; error: string };

router.post("/ipcs/:id/approve", requireAuth, requireIpcScope, requirePermission("finance.ipc.approve"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = approveIpcSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

    const outcome = await db.transaction(async (tx): Promise<ApproveOutcome> => {
      const [ipc] = await tx.select().from(ipcs).where(eq(ipcs.id, req.params.id));
      if (!ipc) return { code: 404, error: "IPC not found" };
      if (ipc.status !== "draft" && ipc.status !== "submitted") {
        return { code: 409, error: `Cannot approve IPC in status: ${ipc.status}` };
      }

      const [contract] = await tx.select().from(contracts).where(eq(contracts.id, ipc.contractId));
      if (!contract) return { code: 404, error: "Contract not found" };

      const [sumRow] = await tx.select({ value: sql<string>`coalesce(sum(${ipcs.approvedAmount}), 0)` })
        .from(ipcs)
        .where(and(
          eq(ipcs.contractId, contract.id),
          sql`${ipcs.id} <> ${ipc.id}`,
          sql`${ipcs.status} in ('approved', 'partially_paid', 'fully_paid')`
        ));

      const totalApprovedSoFar = parseFloat(sumRow?.value ?? "0");
      const newApprovedAmount = parseFloat(parsed.data.approvedAmount || ipc.claimedAmount);
      const contractTotal = parseFloat(contract.totalValue);

      if (totalApprovedSoFar + newApprovedAmount > contractTotal) {
        return { code: 400, error: `Approval rejected: total approved (${totalApprovedSoFar} + ${newApprovedAmount}) exceeds contract value (${contractTotal}).` };
      }

      const [row] = await tx.update(ipcs).set({
        status: "approved",
        approvedAmount: String(newApprovedAmount),
        updatedAt: new Date(),
      }).where(eq(ipcs.id, ipc.id)).returning();

      await tx.insert(auditLog).values({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        entityTable: "ipcs",
        entityId: ipc.id,
        action: "approve",
        before: { status: ipc.status, approvedAmount: ipc.approvedAmount },
        after: { status: "approved", approvedAmount: newApprovedAmount },
        ip: req.ip,
      });

      return { code: 200, ipc: row };
    });

    if (outcome.code !== 200) return res.status(outcome.code).json({ error: outcome.error });
    res.json({ message: "IPC Approved", ipc: outcome.ipc });
  })
);

// 6. RECORD CASH RECEIPT (retention-aware, outcome pattern)
type ReceiptOutcome =
  | { code: 200; receipt: typeof cashReceipts.$inferSelect; ipcStatus: string }
  | { code: 400 | 404 | 409; error: string };

router.post("/ipcs/:id/receipts", requireAuth, requireIpcScope, requirePermission("finance.receipt.record"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = recordReceiptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

    const outcome = await db.transaction(async (tx): Promise<ReceiptOutcome> => {
      const [ipc] = await tx.select().from(ipcs).where(eq(ipcs.id, req.params.id));
      if (!ipc) return { code: 404, error: "IPC not found" };
      if (ipc.status !== "approved" && ipc.status !== "partially_paid") {
        return { code: 409, error: `IPC is not in a payable state (current: ${ipc.status})` };
      }

      const [contract] = await tx.select().from(contracts).where(eq(contracts.id, ipc.contractId));
      if (!contract) return { code: 404, error: "Contract not found" };

      const approved = parseFloat(ipc.approvedAmount);
      const retentionPct = parseFloat(contract.retentionPercent) / 100;
      const netPayable = approved * (1 - retentionPct);

      const [sumRow] = await tx.select({ value: sql<string>`coalesce(sum(${cashReceipts.amount}), 0)` })
        .from(cashReceipts)
        .where(eq(cashReceipts.ipcId, ipc.id));

      const totalPaidSoFar = parseFloat(sumRow?.value ?? "0");
      const newPayment = parseFloat(parsed.data.amount);

      if (totalPaidSoFar + newPayment > netPayable) {
        return { code: 400, error: `Receipt rejected: total payments (${totalPaidSoFar} + ${newPayment}) exceed net payable (${netPayable}). Retention held: ${approved * retentionPct}.` };
      }

      const [receipt] = await tx.insert(cashReceipts).values({
        ipcId: ipc.id,
        tenantId: req.user!.tenantId,
        amount: parsed.data.amount,
        receivedDate: parsed.data.receivedDate || new Date().toISOString().split("T")[0],
        reference: parsed.data.reference,
      }).returning();

      const newTotalPaid = totalPaidSoFar + newPayment;
      const nextStatus = newTotalPaid >= netPayable ? "fully_paid" : "partially_paid";

      await tx.update(ipcs).set({ status: nextStatus, updatedAt: new Date() }).where(eq(ipcs.id, ipc.id));

      await tx.insert(auditLog).values({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        entityTable: "cash_receipts",
        entityId: receipt.id,
        action: "record_receipt",
        after: { amount: newPayment, ipcStatus: nextStatus },
        ip: req.ip,
      });

      return { code: 200, receipt, ipcStatus: nextStatus };
    });

    if (outcome.code !== 200) return res.status(outcome.code).json({ error: outcome.error });
    res.json({ message: "Receipt recorded", receipt: outcome.receipt, ipcStatus: outcome.ipcStatus });
  })
);

export default router;