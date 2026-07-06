import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './services/db';
import payappPaymentsRouter from './routes/payappPayments';
import payappMembershipsRouter from './routes/payappMemberships';
import authRouter from './routes/auth';
import lessonsRouter from './routes/lessons';
import clientsRouter from './routes/clients';
import coachesRouter from './routes/coaches';
import filesRouter from './routes/files';
import lessonPackagesRouter from './routes/lessonPackages';
import aiRouter from './routes/ai';
import curriculumsRouter from './routes/curriculums';
import curriculumTemplatesRouter from './routes/curriculumTemplates';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

const allowedOrigins = (
  process.env.APP_ALLOWED_ORIGINS ??
  process.env.APP_BASE_URL ??
  'http://localhost:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header (e.g. curl / server-to-server)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Auth routes
app.use('/api/auth', authRouter);

// Core resource routes
app.use('/api/lessons', lessonsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/coaches', coachesRouter);
app.use('/api/files', filesRouter);
app.use('/api/lesson-packages', lessonPackagesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/curriculums', curriculumsRouter);
app.use('/api/curriculum-templates', curriculumTemplatesRouter);

// PayApp payments routes
app.use('/api/payments/payapp', payappPaymentsRouter);
app.use('/api/payments/payapp-membership', payappMembershipsRouter);

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[swingnote-server] running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[swingnote-server] DB init failed:', err);
    process.exit(1);
  });

export default app;
