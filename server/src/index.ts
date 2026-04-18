import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import payappPaymentsRouter from './routes/payappPayments';
import payappMembershipsRouter from './routes/payappMemberships';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

app.use(cors({ origin: process.env.APP_BASE_URL || 'http://localhost:3000' }));
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
