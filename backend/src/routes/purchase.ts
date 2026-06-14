import { Router, Request, Response, NextFunction } from "express";
import { param, validationResult } from "express-validator";
import { db, purchases } from "../services/database.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../server.js";

export const purchaseRouter = Router();

/**
 * GET /api/purchase/:sessionId
 *
 * Verifica se uma compra foi confirmada pelo gateway de pagamento.
 *
 * IMPORTANTE (segurança / LGPD):
 * - Retorna APENAS um boolean (`verified`) e o `purchaseId` numérico.
 * - NÃO expõe e-mail, nome, valor ou qualquer PII.
 * - Resposta idêntica para "sessão inexistente" e "sessão não paga"
 *   para evitar enumeração.
 * - Sem autenticação: este endpoint pode ser chamado pelo front-end
 *   durante o redirect de retorno. A checagem de propriedade real
 *   do download é feita no endpoint /api/download (token HMAC) e em
 *   /api/user-purchases (Firebase ID Token).
 */
purchaseRouter.get(
  "/:sessionId",
  [
    param("sessionId")
      .isString()
      .isLength({ min: 20, max: 200 })
      .withMessage("Session ID inválido"),
  ],
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          verified: false,
          error: "Session ID inválido",
        });
      }

      const { sessionId } = req.params;

      // Busca compra — APENAS campos não-sensíveis.
      const [purchase] = await db
        .select({
          id: purchases.id,
          status: purchases.status,
          paidAt: purchases.paidAt,
        })
        .from(purchases)
        .where(eq(purchases.stripeSessionId, sessionId))
        .limit(1);

      logger.info("Purchase verification attempt", {
        sessionIdPrefix: sessionId.substring(0, 12) + "...",
        found: !!purchase,
        ip: req.ip,
      });

      if (!purchase) {
        // Resposta uniforme para evitar enumeração.
        return res.json({ verified: false });
      }

      const isVerified =
        purchase.status === "completed" && purchase.paidAt !== null;

      if (isVerified) {
        logger.info("Purchase verified successfully", {
          purchaseId: purchase.id,
          ip: req.ip,
        });
      }

      return res.json({
        verified: isVerified,
        purchaseId: isVerified ? purchase.id : undefined,
      });
    } catch (error) {
      logger.error("Purchase verification error", {
        error,
        sessionIdPrefix: req.params.sessionId?.substring(0, 12),
        ip: req.ip,
      });
      // Falha = não verificado. Nunca vaza dados em erro.
      return res.json({ verified: false });
    }
  }
);

// NOTA: O endpoint GET /api/purchase/:sessionId/details foi REMOVIDO
// por vazar PII (e-mail, nome, valor) sem autenticação. Detalhes
// sensíveis só podem ser consultados por:
//   1. Usuário autenticado via Firebase ID Token em /api/user-purchases
//   2. Admin autenticado em /admin/purchases/:id
//   3. Sistema interno via webhook autenticado (nunca exposto ao client)
