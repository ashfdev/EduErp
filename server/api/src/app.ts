import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { generateOpenApiDocument } from "./openapi/generate";
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
import { teacherRouter } from "./modules/teacher/teacher.routes";
import { resourcesRouter } from "./modules/resources/resources.routes";
import { courseEnrollmentRouter } from "./modules/university/course-enrollment.routes";
import { studentHealthRouter } from "./modules/health/health.routes";
import { disciplineRouter } from "./modules/discipline/discipline.routes";
import { complaintsRouter } from "./modules/complaints/complaints.routes";
import { ptmRouter } from "./modules/ptm/ptm.routes";
import { appraisalsRouter } from "./modules/appraisals/appraisals.routes";
import { quizzesRouter } from "./modules/quizzes/quizzes.routes";
import { devicesRouter } from "./modules/devices/devices.routes";
import { accountsModuleRouter } from "./modules/accounts";
import { inventoryModuleRouter } from "./modules/inventory";
import { bulkSmsRouter } from "./modules/notifications/bulk.routes";
import { notificationCenterRouter } from "./modules/notifications/notification-center.routes";
import { internalRouter } from "./routes/internal";

const ALLOWED_ORIGINS = [env.ADMIN_URL, env.PORTAL_URL, env.WEBSITE_URL, env.TEACHER_URL].filter((url): url is string => !!url);

if (env.NODE_ENV === "production" && ALLOWED_ORIGINS.length === 0) {
  // Never fall back to allow-all-with-credentials in production — that
  // reflects any origin back with credentials enabled, defeating CORS
  // entirely. Fail fast at boot instead, same as a missing JWT secret.
  throw new Error("ADMIN_URL, PORTAL_URL, WEBSITE_URL, and TEACHER_URL are all unset in production — refusing to start with an open CORS policy.");
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

  // Non-production only — a live schema/example browser is convenience
  // tooling for dev/staging, not something to expose on a real deployment.
  if (env.NODE_ENV !== "production") {
    const openApiDocument = generateOpenApiDocument();
    app.get("/api/docs.json", (_req, res) => res.json(openApiDocument));
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

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
  app.use("/api/teacher", teacherRouter);
  app.use("/api/resources", resourcesRouter);
  app.use("/api/course-enrollments", courseEnrollmentRouter);
  app.use("/api/student-health", studentHealthRouter);
  app.use("/api/discipline", disciplineRouter);
  app.use("/api/complaints", complaintsRouter);
  app.use("/api/ptm", ptmRouter);
  app.use("/api/appraisals", appraisalsRouter);
  app.use("/api/quizzes", quizzesRouter);
  app.use("/api/devices", devicesRouter);
  app.use("/api/accounts", accountsModuleRouter);
  app.use("/api/inventory", inventoryModuleRouter);
  // Order matters: notificationCenterRouter first. Its own gate is a bare
  // authenticate() (any logged-in role), while bulkSmsRouter's is
  // authorize(BULK_SMS_ROLES) applied via router.use() — that runs on EVERY
  // request that enters the router, not just requests matching one of its
  // defined routes. With bulkSmsRouter mounted first, every GUARDIAN/
  // CLASS_TEACHER/etc. call to plain GET /api/notifications was rejected
  // with 403 by bulkSmsRouter's blanket role check before Express ever got
  // to try notificationCenterRouter's unrestricted "/" handler — a real,
  // previously-live bug (the entire in-app notification bell was broken for
  // every role except SUPER_ADMIN/ADMIN/PRINCIPAL). Reordering is safe: the
  // two routers' path sets don't overlap (bulk-sms, bulk-sms/preview vs.
  // "/", ":id/read", "read-all"), so legitimate bulk-sms traffic still falls
  // through correctly once notificationCenterRouter finds no matching route.
  app.use("/api/notifications", notificationCenterRouter);
  app.use("/api/notifications", bulkSmsRouter);
  app.use("/internal", internalRouter);

  app.use(errorHandler);

  return app;
}
