import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import payappPaymentsRouter from './routes/payappPayments';
import payappMembershipsRouter from './routes/payappMemberships';

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
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// PayApp payments routes
app.use('/api/payments/payapp', payappPaymentsRouter);
app.use('/api/payments/payapp-membership', payappMembershipsRouter);

app.listen(PORT, () => {
  console.log(`[swingnote-server] running on http://localhost:${PORT}`);
});

export default app;
