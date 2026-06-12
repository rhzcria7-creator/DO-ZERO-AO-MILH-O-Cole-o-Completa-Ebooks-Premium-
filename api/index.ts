import { app as backendApp, logger } from '../backend/src/server.js';
import { errorHandler } from '../backend/src/middleware/error-handler.js';

// Catch-all error handler
backendApp.use((req, res) => {
  res.status(404).json({ error: "API Route not found on Vercel backend" });
});

backendApp.use(errorHandler(logger));

export default backendApp;
