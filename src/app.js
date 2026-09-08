import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import authRoutes from "./routes/authRoutes.js";
import visitorRoutes from "./routes/visitorRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import worksheetRoutes from "./routes/worksheetRoutes.js";
import unitTestRoutes from "./routes/unitTestRoutes.js";
import dppRoutes from "./routes/dppRoutes.js";
import slipTestRoutes from "./routes/slipTestRoutes.js";
import parentRoutes from "./routes/parentRoutes.js";
import educatorRoutes from "./routes/educatorRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { uploadsDir } from "./middleware/upload.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.clientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  app.use("/uploads", express.static(uploadsDir));

  if (env.nodeEnv !== "test") {
    app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
  }

  app.get("/", (_req, res) => {
    res.status(200).json({
      success: true,
      message: "API is healthy",
      data: {
        siteName: env.siteName,
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/parent", parentRoutes);
  app.use("/api/educator", educatorRoutes);
  app.use("/api/visitors", visitorRoutes);
  app.use("/api/contact", contactRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/content", contentRoutes);
  app.use("/api/worksheets", worksheetRoutes);
  app.use("/api/unit-tests", unitTestRoutes);
  app.use("/api/dpps", dppRoutes);
  app.use("/api/slip-tests", slipTestRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
