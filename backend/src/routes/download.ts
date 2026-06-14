import { Router, Request, Response, NextFunction } from "express";
import { param, validationResult } from "express-validator";
import { config } from "../config/env.js";
import { logger } from "../server.js";
import { getTokenService } from "../services/token.js";
import {
  db,
  purchases,
  downloads,
  activityLogs,
  revokedTokens,
} from "../services/database.js";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";
import { getSignedUrl } from "../services/storage.js";

export const downloadRouter = Router();

// Rate limiting para downloads (5 por hora por IP)
const downloadRateLimit = new Map<string, { count: number; resetAt: number }>();
const DOWNLOAD_RATE_LIMIT = 5;
const DOWNLOAD_RATE_WINDOW = 60 * 60 * 1000; // 1 hora

// IP blocking (bloqueia após 3 tentativas falhas)
const blockedIPs = new Map<string, { until: number; attempts: number }>();
const BLOCK_DURATION = 60 * 60 * 1000; // 1 hora
const MAX_FAILED_ATTEMPTS = 3;

function checkDownloadRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = downloadRateLimit.get(ip);

  if (!record || record.resetAt < now) {
    downloadRateLimit.set(ip, { count: 1, resetAt: now + DOWNLOAD_RATE_WINDOW });
    return true;
  }

  if (record.count >= DOWNLOAD_RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

function checkIPBlocked(ip: string): boolean {
  const record = blockedIPs.get(ip);
  if (!record) return false;
  
  if (Date.now() > record.until) {
    blockedIPs.delete(ip);
    return false;
  }
  return true;
}

function blockIP(ip: string): void {
  blockedIPs.set(ip, {
    until: Date.now() + BLOCK_DURATION,
    attempts: (blockedIPs.get(ip)?.attempts || 0) + 1,
  });
  logger.warn("IP blocked for download abuse", { ip });
}

/**
 * GET /api/download/:token
 * Gera URL temporária do Supabase Storage.
 */
downloadRouter.get(
  "/:token",
  [
    param("token").isString().isLength({ min: 50, max: 500 }).withMessage("Token inválido"),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const { token } = req.params;
    const ip = req.ip || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    try {
      // Verificar IP bloqueado
      if (checkIPBlocked(ip)) {
        logger.warn("Download attempt from blocked IP", { ip });
        return res.status(403).json({ error: "IP temporariamente bloqueado" });
      }

      // Validação de entrada
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Download attempt with invalid token format", { ip, tokenLength: token.length });
        blockIP(ip);
        return res.status(400).json({ error: "Token inválido" });
      }

      // Rate limiting
      if (!checkDownloadRateLimit(ip)) {
        logger.warn("Download rate limit exceeded", { ip });
        return res.status(429).json({ error: "Limite de downloads excedido. Tente novamente em 1 hora." });
      }

      // Verificar se token está na lista de revogados
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const [revokedToken] = await db
        .select({ id: revokedTokens.id, reason: revokedTokens.reason })
        .from(revokedTokens)
        .where(eq(revokedTokens.tokenHash, tokenHash))
        .limit(1);

      if (revokedToken) {
        logger.warn("Download attempt with revoked token", {
          ip,
          tokenHash,
          reason: revokedToken.reason,
        });
        return res.status(403).json({ error: "Token revogado" });
      }

      // Validar token HMAC
      const tokenService = getTokenService();
      const payload = tokenService.verifyToken(token);

      if (!payload) {
        logger.warn("Download attempt with invalid token", { 
          ip, 
          tokenPrefix: token.substring(0, 20) + "...",
          userAgent 
        });
        
        await logAuditEvent("download.invalid_token", null, ip, userAgent, false, "Token inválido ou expirado");
        
        if (checkDownloadRateLimit(ip)) {
          blockIP(ip);
        }
        
        return res.status(403).json({ error: "Token inválido ou expirado" });
      }

      // Buscar compra no banco
      const [purchase] = await db
        .select()
        .from(purchases)
        .where(eq(purchases.id, payload.purchaseId))
        .limit(1);

      if (!purchase) {
        logger.warn("Download attempt for non-existent purchase", { ip, purchaseId: payload.purchaseId });
        blockIP(ip);
        return res.status(404).json({ error: "Compra não encontrada" });
      }

      // Verificar status da compra
      if (purchase.status !== "completed" && purchase.status !== "approved") {
        logger.warn("Download attempt for non-completed purchase", { 
          ip, 
          purchaseId: purchase.id, 
          status: purchase.status 
        });
        
        await logAuditEvent("download.rejected", purchase.id, ip, userAgent, false, `Status: ${purchase.status}`);
        
        return res.status(403).json({ error: "Pagamento não confirmado" });
      }

      // Verificar se e-mail hash corresponde
      const emailHash = tokenService.hashEmail(purchase.email!);
      if (payload.emailHash !== emailHash) {
        logger.warn("Download attempt with mismatched email hash", { 
          ip, 
          purchaseId: purchase.id 
        });
        
        await logAuditEvent("download.email_mismatch", purchase.id, ip, userAgent, false, "Email hash não corresponde");
        
        blockIP(ip);
        return res.status(403).json({ error: "Token não pertence a esta compra" });
      }

      // Registrar download
      await recordDownloadAttempt(purchase.id, token, ip, userAgent);
      await logAuditEvent("download.success", purchase.id, ip, userAgent, true);

      // Gerar URL assinada no Supabase Storage
      const signedUrl = await getSignedUrl("ebooks", "dozeroaomilhao.pdf", 15 * 60); // 15 minutos

      if (!signedUrl) {
        logger.error("Download fail: could not generate signed URL");
        return res.status(500).json({ error: "Arquivo temporariamente indisponível. Entre em contato." });
      }

      logger.info("Generated signed URL for download", { purchaseId: purchase.id });

      // Redirect para o arquivo
      res.redirect(signedUrl);
    } catch (error) {
      logger.error("Download error", { error, ip });
      next(error);
    }
  }
);

async function recordDownloadAttempt(purchaseId: number, token: string, ip: string, userAgent: string) {
  try {
    const [downloadRecord] = await db
      .select()
      .from(downloads)
      .where(eq(downloads.purchaseId, purchaseId))
      .limit(1);

    if (downloadRecord) {
      await db
        .update(downloads)
        .set({ 
          usedCount: (downloadRecord.usedCount || 0) + 1, 
          lastUsedIp: ip 
        })
        .where(eq(downloads.id, downloadRecord.id));
    }
  } catch (error) {
    logger.warn("Failed to record download attempt", { error, purchaseId });
  }
}

async function logAuditEvent(
  action: string, 
  purchaseId: number | null, 
  ip: string, 
  userAgent: string, 
  success: boolean, 
  reason?: string
) {
  try {
    await db.insert(activityLogs).values({
      action,
      entityType: "download",
      entityId: purchaseId,
      metadata: JSON.stringify({ success, reason, tokenPrefix: "" }),
      ipAddress: ip,
      userAgent,
    });
  } catch (error) {
    logger.warn("Failed to log audit event", { error, action });
  }
}
