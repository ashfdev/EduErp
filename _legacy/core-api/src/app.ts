import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import type { ErrorRequestHandler } from 'express';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { academicRouter } from './routes/academic.js';
import { studentsRouter } from './routes/students.js';
import { staffRouter } from './routes/staff.js';
import { attendanceRouter } from './routes/attendance.js';
import { uploadsRouter } from './routes/uploads.js';
import { disciplineRouter } from './routes/discipline.js';
import { feesRouter } from './routes/fees.js';
import { payrollRouter } from './routes/payroll.js';
import { examsRouter } from './routes/exams.js';
import { quizzesRouter } from './routes/quizzes.js';
import { verifyRouter } from './routes/verify.js';
import { publicRouter } from './routes/public.js';
import { websiteRouter } from './routes/website.js';
import { contentRouter } from './routes/content.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.use('/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/academic', academicRouter);
  app.use('/api/v1/students', studentsRouter);
  app.use('/api/v1/staff', staffRouter);
  app.use('/api/v1/attendance', attendanceRouter);
  app.use('/api/v1/uploads', uploadsRouter);
  app.use('/api/v1/discipline', disciplineRouter);
  app.use('/api/v1/fees', feesRouter);
  app.use('/api/v1/payroll', payrollRouter);
  app.use('/api/v1/exams', examsRouter);
  app.use('/api/v1/quizzes', quizzesRouter);
  app.use('/api/v1/verify', verifyRouter); // public, no auth — see routes/verify.ts
  app.use('/api/v1/public', publicRouter); // public, no auth — see routes/public.ts
  app.use('/api/v1/website', websiteRouter);
  app.use('/api/v1/content', contentRouter); // public, no auth — see routes/content.ts

  // Feature routes (admission, ...) land here module by module in later phases,
  // each mounted with requireAuth + requireTenant + requirePermission.

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Express 5 forwards rejected promises from async handlers here automatically —
  // without this, a thrown Prisma error would leak a stack trace via Express's
  // default HTML error page instead of a clean JSON response.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', ...(isDev && { detail: String(err) }) });
  };
  app.use(errorHandler);

  return app;
}
