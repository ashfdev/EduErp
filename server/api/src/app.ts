import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { requestId } from "./middleware/request-id";
import { defaultApiLimiter } from "./middleware/rate-limit";
import { errorHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health";
import { settingsRouter } from "./modules/settings";
import { uploadsRouter } from "./modules/uploads.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { studentsRouter } from "./modules/students/students.routes";
import { subjectsRouter } from "./modules/subjects/subjects.routes";
import { staffRouter } from "./modules/staff/staff.routes";
import { attendanceRouter } from "./modules/attendance/attendance.routes";
import { examsRouter } from "./modules/examination/exams.routes";
import { marksRouter } from "./modules/examination/marks.routes";
import { resultsRouter } from "./modules/results/results.routes";
import { feesRouter } from "./modules/fees/fees.routes";
import { paymentsRouter } from "./modules/fees/payments.routes";
import { admissionRouter } from "./modules/admission/admission.routes";
import { documentsRouter } from "./modules/documents/documents.routes";
import { websiteRouter } from "./modules/website";
import { contentRouter } from "./modules/content/content.routes";
import { hrRouter } from "./modules/hr";
import { libraryRouter } from "./modules/library/library.routes";
import { transportRouter } from "./modules/transport/transport.routes";
import { hostelRouter } from "./modules/hostel/hostel.routes";
import { analyticsRouter } from "./modules/reports/analytics.routes";
import { portalRouter } from "./modules/portal/portal.routes";
import { devicesRouter } from "./modules/devices/devices.routes";
import { accountsModuleRouter } from "./modules/accounts";
import { inventoryModuleRouter } from "./modules/inventory";
import { internalRouter } from "./routes/internal";

const ALLOWED_ORIGINS = [env.ADMIN_URL, env.PORTAL_URL, env.WEBSITE_URL].filter((url): url is string => !!url);

if (env.NODE_ENV === "production" && ALLOWED_ORIGINS.length === 0) {
  // Never fall back to allow-all-with-credentials in production — that
  // reflects any origin back with credentials enabled, defeating CORS
  // entirely. Fail fast at boot instead, same as a missing JWT secret.
  throw new Error("ADMIN_URL, PORTAL_URL, and WEBSITE_URL are all unset in production — refusing to start with an open CORS policy.");
}

export function createApp(): Express {
  const app = express();

  app.use(requestId);
  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      // Falls back to allow-all only in non-production when no app URLs are
      // configured at all (e.g. a bare `pnpm dev` with no .env) so local dev
      // never silently 403s. Production always has ALLOWED_ORIGINS set —
      // enforced by the boot-time check above.
      origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger, genReqId: (req) => req.requestId }));

  app.use("/health", healthRouter);
  app.use("/api/health", healthRouter);

  // Global default limiter for everything else — routes with their own
  // stricter/looser limiter (login, forgot-password, /api/content) still get
  // layered under this one, which is fine since theirs will bind first.
  app.use("/api", defaultApiLimiter);

  app.use("/api/auth", authRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/students", studentsRouter);
  app.use("/api/subjects", subjectsRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/exams", examsRouter);
  app.use("/api/marks", marksRouter);
  app.use("/api/results", resultsRouter);
  app.use("/api/fees", feesRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/admission", admissionRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/website", websiteRouter);
  app.use("/api/content", contentRouter);
  app.use("/api/hr", hrRouter);
  app.use("/api/library", libraryRouter);
  app.use("/api/transport", transportRouter);
  app.use("/api/hostel", hostelRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/portal", portalRouter);
  app.use("/api/devices", devicesRouter);
  app.use("/api/accounts", accountsModuleRouter);
  app.use("/api/inventory", inventoryModuleRouter);
  app.use("/internal", internalRouter);

  app.use(errorHandler);

  return app;
}
