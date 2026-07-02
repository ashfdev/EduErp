import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
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

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  app.use("/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/students", studentsRouter);
  app.use("/api/subjects", subjectsRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/exams", examsRouter);
  app.use("/api/marks", marksRouter);

  app.use(errorHandler);

  return app;
}
