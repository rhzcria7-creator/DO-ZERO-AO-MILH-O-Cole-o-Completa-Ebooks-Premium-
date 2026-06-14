import { Router, Request, Response, NextFunction } from "express";
import { param, validationResult } from "express-validator";
import { logger } from "../server.js";
import { config } from "../config/env.js";
import { db, purchases } from "../services/database.js";
import { eq, desc, sql } from "drizzle-orm";
import { createSecureDownloadToken } from "../services/download.js";
import { sendPurchaseConfirmation } from "../services/email.js";

export const adminConfirmRouter = Router();

// Simple auth middleware for admin confirmation
function simpleAdminAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-admin-key"] as string;
  if (!apiKey || apiKey !== config.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  next();
}

/**
 * GET /admin-confirm/pending
 * Lista compras pendentes de confirmação.
 */
adminConfirmRouter.get("/pending", simpleAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await db
      .select({
        id: purchases.id,
        email: purchases.email,
        name: purchases.name,
        product: purchases.product,
        amount: purchases.amount,
        status: purchases.status,
        metadata: purchases.metadata,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .where(eq(purchases.status, "pending"))
      .orderBy(desc(purchases.createdAt))
      .limit(50);

    res.json({ purchases: pending });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin-confirm/confirm/:id
 * Confirma uma compra pendente e envia o ebook.
 */
adminConfirmRouter.post(
  "/confirm/:id",
  simpleAdminAuth,
  [
    param("id").isInt().withMessage("ID inválido"),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const purchaseId = parseInt(req.params.id);

      // Buscar compra
      const [purchase] = await db
        .select()
        .from(purchases)
        .where(eq(purchases.id, purchaseId))
        .limit(1);

      if (!purchase) {
        return res.status(404).json({ error: "Compra não encontrada" });
      }

      if (purchase.status !== "pending") {
        return res.status(400).json({ error: "Compra já foi processada" });
      }

      // Confirmar pagamento
      await db
        .update(purchases)
        .set({
          status: "completed",
          paidAt: new Date(),
        })
        .where(eq(purchases.id, purchaseId));

      // Gerar token de download
      const downloadToken = await createSecureDownloadToken(
        purchaseId,
        purchase.email!
      );

      // Enviar e-mail de confirmação com link de download
      const emailSent = await sendPurchaseConfirmation({
        to: purchase.email!,
        name: purchase.name || "Cliente",
        downloadToken,
        purchaseId,
        amount: Number(purchase.amount || 129.90),
      });

      logger.info("Purchase confirmed and ebook sent", {
        purchaseId,
        email: purchase.email,
        emailSent,
      });

      res.json({
        success: true,
        message: "Compra confirmada. Ebook enviado por e-mail.",
        purchaseId,
        emailSent,
      });
    } catch (error) {
      logger.error("Purchase confirmation error", { error });
      next(error);
    }
  }
);

/**
 * POST /admin-confirm/reject/:id
 * Rejeita uma compra pendente.
 */
adminConfirmRouter.post(
  "/reject/:id",
  simpleAdminAuth,
  [
    param("id").isInt().withMessage("ID inválido"),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const purchaseId = parseInt(req.params.id);

      await db
        .update(purchases)
        .set({
          status: "cancelled",
          statusReason: "Pagamento não confirmado",
        })
        .where(eq(purchases.id, purchaseId));

      logger.info("Purchase rejected", { purchaseId });

      res.json({ success: true, message: "Compra rejeitada." });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin-confirm/stats
 * Estatísticas rápidas.
 */
adminConfirmRouter.get("/stats", simpleAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [pendingCount] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(purchases)
      .where(eq(purchases.status, "pending"));

    const [completedCount] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(purchases)
      .where(eq(purchases.status, "completed"));

    const [totalRevenue] = await db
      .select({ total: sql<string>`coalesce(cast(sum(cast(${purchases.amount} as numeric(10,2))) as text), '0')` })
      .from(purchases)
      .where(eq(purchases.status, "completed"));

    res.json({
      pending: pendingCount?.count ?? 0,
      completed: completedCount?.count ?? 0,
      revenue: totalRevenue?.total ?? "0",
    });
  } catch (error) {
    next(error);
  }
});
