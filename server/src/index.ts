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
import reservationsRouter from './routes/reservations';
import homeworkRouter from './routes/homework';
import pointsRouter from './routes/points';
import branchesRouter from './routes/branches';
import bayReservationsRouter from './routes/bayReservations';
import aiAssetsRouter from './routes/aiAssets';
import curriculumTemplatesRouter from './routes/curriculumTemplates';
import pushRouter from './routes/push';
import aiFeedbackRouter from './routes/aiFeedback';
import consentsRouter from './routes/consents';
import youtubeRouter from './routes/youtube';
import { startScheduledPushRunner } from './services/scheduledPushRunner';

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
app.use('/api/reservations', reservationsRouter);
app.use('/api/homework', homeworkRouter);
app.use('/api/points', pointsRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/bay-reservations', bayReservationsRouter);
app.use('/api/ai-assets', aiAssetsRouter);
app.use('/api/curriculum-templates', curriculumTemplatesRouter);
app.use('/api/push', pushRouter);
app.use('/api/ai-feedback', aiFeedbackRouter);
app.use('/api/consents', consentsRouter);
app.use('/api/youtube', youtubeRouter);

// PayApp payments routes
app.use('/api/payments/payapp', payappPaymentsRouter);
app.use('/api/payments/payapp-membership', payappMembershipsRouter);

// Unknown /api/* path. Express' default handler answers with an HTML page, and
// the client turns a body it cannot parse into a bare "HTTP 404" — which is
// indistinguishable from "that row does not exist" and told a coach nothing
// when a reservation write landed on a backend without the endpoint. Answer
// with the same JSON envelope every route uses instead.
app.use('/api', (req, res) => {
  res
    .status(404)
    .json({ error: `Endpoint not found: ${req.method} ${req.originalUrl.split('?')[0]}` });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[swingnote-server] running on http://localhost:${PORT}`);
    });
    startScheduledPushRunner();
  })
  .catch((err) => {
    console.error('[swingnote-server] DB init failed:', err);
    process.exit(1);
  });

export default app;
