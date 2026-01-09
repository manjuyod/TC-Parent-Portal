// server/index.ts
import dotenv from "dotenv";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// If you’re behind a proxy/HTTPS in prod, uncomment:
// app.set("trust proxy", 1);

// Disable ETag so JSON API responses don’t 304
app.set("etag", false);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 🔒 Strongly disable caching for API responses to avoid 304s
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

// Simple API logger (captures JSON body)
app.use((req, res, next) => {
  const start = Date.now();
  const p = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (p.startsWith("/api")) {
      let logLine = `${req.method} ${p} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        try {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        } catch {}
      }
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    // Optional: rethrow for node to surface
    throw err;
  });

  // Only setup Vite in development and AFTER routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use the single allowed port (default 5000)
  const port = parseInt(process.env.PORT || "5000", 10);

  // Windows (win32) does NOT support reusePort, so only apply on Linux/Unix
  const listenOpts: any = { port, host: "0.0.0.0" };
  if (process.platform !== "win32") {
    listenOpts.reusePort = true;
  }

  server.listen(listenOpts, () => {
    log(`serving on port ${port}`);
  });
})();
