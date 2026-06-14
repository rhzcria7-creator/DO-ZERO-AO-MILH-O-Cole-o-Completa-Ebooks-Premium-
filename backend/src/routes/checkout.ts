import { Router, Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { logger } from "../server.js";
import { db, purchases } from "../services/database.js";
import { eq, and, gte } from "drizzle-orm";
import { generateConfirmationCode } from "../services/payment.js";

export const checkoutRouter = Router();

/**
 * POST /checkout/session
 * Cria uma compra pendente (aguardando confirmação manual).
 * O pagamento é via Pix estático (QR Code no frontend).
 */
checkoutRouter.post(
  "/session",
  [
    body("email").isEmail().normalizeEmail().withMessage("Email inválido"),
    body("name").isString().trim().isLength({ min: 2, max: 100 }).withMessage("Nome inválido"),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Checkout validation failed", { errors: errors.array(), ip: req.ip });
        return res.status(400).json({ error: "Dados inválidos", details: errors.array() });
      }

      const { email, name } = req.body;

      // Verificar se já existe purchase pendente para este e-mail nas últimas 2h
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const [existingPending] = await db
        .select({ id: purchases.id, status: purchases.status })
        .from(purchases)
        .where(
          and(
            eq(purchases.email, email),
            eq(purchases.status, "pending"),
            gte(purchases.createdAt, twoHoursAgo)
          )
        )
        .limit(1);

      if (existingPending) {
        return res.json({
          success: true,
          purchaseId: existingPending.id,
          message: "Compra já registrada. Aguarde confirmação.",
        });
      }

      // Criar purchase pendente
      const confirmationCode = generateConfirmationCode();
      const [purchase] = await db
        .insert(purchases)
        .values({
          email,
          name,
          product: "Ebook Do Zero ao Milhão — O Guia Definitivo",
          amount: "129.90",
          currency: "BRL",
          status: "pending",
          metadata: JSON.stringify({
            confirmationCode,
            paymentMethod: "pix_static",
            ip: req.ip,
          }),
        })
        .returning({ id: purchases.id });

      logger.info("Purchase created (pending confirmation)", {
        purchaseId: purchase.id,
        email,
        confirmationCode,
        ip: req.ip,
      });

      res.json({
        success: true,
        purchaseId: purchase.id,
        message: "Compra registrada. Aguarde confirmação do pagamento.",
        confirmationCode,
      });
    } catch (error) {
      logger.error("Checkout error", { error, ip: req.ip });
      next(error);
    }
  }
);
