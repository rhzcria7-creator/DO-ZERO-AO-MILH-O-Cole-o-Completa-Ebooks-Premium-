import { Router, Request, Response } from "express";
import { adminAuth, adminStorage } from "../../../src/lib/firebase-admin.ts";
import { db, purchases } from "../services/database.ts";
import { eq } from "drizzle-orm";
import { logger } from "../server.ts";

export const userPurchasesRouter = Router();

// Middleware to verify Firebase Auth token
const verifyAuth = async (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    logger.warn("Unauthorized access attempt", { error });
    return res.status(401).json({ error: "Unauthorized" });
  }
};

userPurchasesRouter.get("/", verifyAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const userPurchases = await db
      .select()
      .from(purchases)
      .where(eq(purchases.userId, uid));

    res.json(userPurchases);
  } catch (error) {
    logger.error("Error fetching purchases", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

userPurchasesRouter.get("/:purchaseId/download", verifyAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user.uid;
    const { purchaseId } = req.params;

    // Verify the purchase belongs to the user and is completed/approved
    const [purchase] = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, parseInt(purchaseId, 10)))
      .limit(1);

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    if (purchase.userId !== uid) {
      return res.status(403).json({ error: "Unauthorized access to purchase" });
    }

    if (purchase.status !== "completed" && purchase.status !== "approved") {
      return res.status(403).json({ error: "Payment not completed" });
    }

    // Generate signed URL
    const bucket = adminStorage.bucket();
    const file = bucket.file("ebooks/dozeroaomilhao.pdf");
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: "File temporarily unavailable" });
    }

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    res.json({ url });
  } catch (error) {
    logger.error("Error generating download url", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});
