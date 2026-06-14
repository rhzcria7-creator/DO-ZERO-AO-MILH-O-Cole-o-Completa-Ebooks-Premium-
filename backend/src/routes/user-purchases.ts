import { Router, Request, Response } from "express";
import { supabaseAdmin } from "../services/storage.js";
import { db, purchases } from "../services/database.js";
import { eq } from "drizzle-orm";
import { logger } from "../server.js";
import { getSignedUrl } from "../services/storage.js";

export const userPurchasesRouter = Router();

// Middleware para verificar token Supabase
const verifyAuth = async (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autenticação ausente" });
  }

  const token = authHeader.split(" ")[1];
  
  if (!supabaseAdmin) {
    logger.error("Supabase admin não configurado");
    return res.status(500).json({ error: "Serviço de autenticação indisponível" });
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      logger.warn("Unauthorized access attempt", { error: error?.message });
      return res.status(401).json({ error: "Token inválido" });
    }

    (req as any).user = user;
    next();
  } catch (error) {
    logger.warn("Unauthorized access attempt", { error });
    return res.status(401).json({ error: "Não autorizado" });
  }
};

/**
 * GET /api/user-purchases
 * Lista compras do usuário autenticado.
 */
userPurchasesRouter.get("/", verifyAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.id;
    
    const userPurchases = await db
      .select()
      .from(purchases)
      .where(eq(purchases.userId, uid));

    res.json(userPurchases);
  } catch (error) {
    logger.error("Error fetching purchases", { error });
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

/**
 * GET /api/user-purchases/:purchaseId/download
 * Gera URL de download para uma compra específica.
 */
userPurchasesRouter.get("/:purchaseId/download", verifyAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.id;
    const { purchaseId } = req.params;

    // Verificar se a compra pertence ao usuário e está completa
    const [purchase] = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, parseInt(purchaseId, 10)))
      .limit(1);

    if (!purchase) {
      return res.status(404).json({ error: "Compra não encontrada" });
    }

    if (purchase.userId !== uid) {
      return res.status(403).json({ error: "Acesso não autorizado a esta compra" });
    }

    if (purchase.status !== "completed" && purchase.status !== "approved") {
      return res.status(403).json({ error: "Pagamento não confirmado" });
    }

    // Gerar URL assinada do Supabase Storage
    const url = await getSignedUrl("ebooks", "dozeroaomilhao.pdf", 15 * 60); // 15 minutos

    if (!url) {
      return res.status(500).json({ error: "Erro ao gerar link de download" });
    }

    res.json({ url });
  } catch (error) {
    logger.error("Error generating download url", { error });
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});
