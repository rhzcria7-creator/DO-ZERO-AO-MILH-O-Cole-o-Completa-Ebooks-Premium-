import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { app as backendApp, logger } from "./backend/src/server.ts";
import { errorHandler } from "./backend/src/middleware/error-handler.ts";
import * as dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Mount the existing backend API
  app.use("/", backendApp);

  // Fallback API route handlers (Optional if backendApp handles everything /api)
  
  // Vite Middleware for frontend Development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Fallback 404 handler for API routes that weren't caught
  app.use("/api/*", (_req, res) => {
    res.status(404).json({ error: "Rota da API não encontrada" });
  });

  // Global Error Handler
  app.use(errorHandler(logger));

  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
