1|import { Router, Request, Response } from "express";
2|import { adminAuth, adminStorage } from "../../../src/lib/firebase-admin";
3|import { db, purchases } from "../services/database.js";
4|import { eq } from "drizzle-orm";
5|import { logger } from "../server.js";
6|
7|export const userPurchasesRouter = Router();
8|
9|// Middleware to verify Firebase Auth token
10|const verifyAuth = async (req: Request, res: Response, next: Function) => {
11|  const authHeader = req.headers.authorization;
12|  if (!authHeader?.startsWith("Bearer ")) {
13|    return res.status(401).json({ error: "Missing or invalid authorization header" });
14|  }
15|
16|  const token = authHeader.split(" ")[1];
17|  try {
18|    const decodedToken = await adminAuth.verifyIdToken(token);
19|    (req as any).user = decodedToken;
20|    next();
21|  } catch (error) {
22|    logger.warn("Unauthorized access attempt", { error });
23|    return res.status(401).json({ error: "Unauthorized" });
24|  }
25|};
26|
27|userPurchasesRouter.get("/", verifyAuth, async (req: Request, res: Response) => {
28|  try {
29|    const uid = (req as any).user.uid;
30|    const userPurchases = await db
31|      .select()
32|      .from(purchases)
33|      .where(eq(purchases.userId, uid));
34|
35|    res.json(userPurchases);
36|  } catch (error) {
37|    logger.error("Error fetching purchases", { error });
38|    res.status(500).json({ error: "Internal server error" });
39|  }
40|});
41|
42|userPurchasesRouter.get("/:purchaseId/download", verifyAuth, async (req: Request, res: Response) => {
43|  try {
44|    const uid = (req as any).user.uid;
45|    const { purchaseId } = req.params;
46|
47|    // Verify the purchase belongs to the user and is completed/approved
48|    const [purchase] = await db
49|      .select()
50|      .from(purchases)
51|      .where(eq(purchases.id, parseInt(purchaseId, 10)))
52|      .limit(1);
53|
54|    if (!purchase) {
55|      return res.status(404).json({ error: "Purchase not found" });
56|    }
57|
58|    if (purchase.userId !== uid) {
59|      return res.status(403).json({ error: "Unauthorized access to purchase" });
60|    }
61|
62|    if (purchase.status !== "completed" && purchase.status !== "approved") {
63|      return res.status(403).json({ error: "Payment not completed" });
64|    }
65|
66|    // Generate signed URL
67|    const bucket = adminStorage.bucket();
68|    const file = bucket.file("ebooks/dozeroaomilhao.pdf");
69|    
70|    const [exists] = await file.exists();
71|    if (!exists) {
72|      return res.status(404).json({ error: "File temporarily unavailable" });
73|    }
74|
75|    const [url] = await file.getSignedUrl({
76|      version: "v4",
77|      action: "read",
78|      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
79|    });
80|
81|    res.json({ url });
82|  } catch (error) {
83|    logger.error("Error generating download url", { error });
84|    res.status(500).json({ error: "Internal server error" });
85|  }
86|});
87|