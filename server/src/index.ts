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
import pushRouter from './routes/push';
import { startScheduledPushRunner } from './services/scheduledPushRunner';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

// Render (and any other PaaS) terminates TLS in front of us, so the socket
// address is always the proxy's. Without this every rate limiter buckets the
// entire user base together and starts issuing 429s to innocent users once a
// handful of accounts are active. One hop is what Render puts in front of the
// service — do not widen this to `true`, which would let a client spoof its
// own address via X-Forwarded-For and bypass IP-keyed limits entirely.
app.set('trust proxy', 1);

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
// AI requests carry their media inline as base64 (see geminiService's
// `mediaParts`), and base64 costs ~33% on top of the raw bytes. 10mb rejected
// pairs of ordinary phone clips outright; 25mb covers the trimmed swing clips
// the app actually produces while still bounding how much a single request can
// pin in memory on a small instance. Full-length videos remain too large by
// design — those need to move to a presigned-URL flow rather than a bigger cap.
app.use(express.json({ limit: '25mb' }));

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
app.use('/api/push', pushRouter);

// PayApp payments routes
app.use('/api/payments/payapp', payappPaymentsRouter);
app.use('/api/payments/payapp-membership', payappMembershipsRouter);

// Unknown /api/* paths must answer with JSON. Without this Express falls back
// to its HTML error page, and the client's `res.json()` parse then reports a
// misleading "Unexpected token '<'" instead of the actual 404.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Terminal error handler. Route handlers already try/catch, but a throw in
// middleware (e.g. the CORS rejection above, or a malformed JSON body) would
// otherwise surface as an HTML stack trace.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[swingnote-server] Unhandled request error:', err);
  if (res.headersSent) return;

  // body-parser's size rejection. Surfaced explicitly so an oversized swing
  // video reads as "the file is too big" instead of a generic 500 that looks
  // like the server fell over.
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: '전송한 파일이 너무 큽니다. 영상을 짧게 잘라서 다시 시도해주세요.',
    });
    return;
  }

  const isCorsRejection = err.message?.startsWith('CORS blocked for origin');
  res.status(isCorsRejection ? 403 : 500).json({
    error: isCorsRejection ? 'Origin not allowed' : 'Internal server error',
  });
});

// A single unhandled rejection anywhere (a dropped DB socket, an aborted
// upstream AI call) would otherwise take the whole process down and log out
// every connected coach and student. Log and keep serving; Render's health
// check still catches a genuinely wedged process.
process.on('unhandledRejection', (reason) => {
  console.error('[swingnote-server] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[swingnote-server] Uncaught exception:', err);
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
