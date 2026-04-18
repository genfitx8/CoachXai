import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import tossPaymentsRouter from './routes/tossPayments';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

app.use(cors({ origin: process.env.APP_BASE_URL || 'http://localhost:3000' }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Toss Payments routes
app.use('/api/payments/toss', tossPaymentsRouter);

app.listen(PORT, () => {
  console.log(`[swingnote-server] running on http://localhost:${PORT}`);
});

export default app;
