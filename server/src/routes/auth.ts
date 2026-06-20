import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { rateLimit } from 'express-rate-limit';
import pool from '../services/db';
import { sendPasswordResetMail } from '../services/mail';

const router = Router();

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRY = '30d';
const PASSWORD_RECOVERY_MESSAGE = '등록된 이메일로 비밀번호 안내 메일을 발송했습니다.';
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000;
const PASSWORD_RECOVERY_WINDOW_MS = 10 * 60 * 1000;
const PASSWORD_RECOVERY_MAX_REQUESTS = 5;
const passwordRecoveryLimiter = rateLimit({
  windowMs: PASSWORD_RECOVERY_WINDOW_MS,
  limit: PASSWORD_RECOVERY_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.json({ message: PASSWORD_RECOVERY_MESSAGE });
  },
});

function signToken(id: string, role: 'coach' | 'client'): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ id, role }, secret, { expiresIn: JWT_EXPIRY });
}

function mapCoach(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    isSubscribed: row.is_subscribed,
    subscriptionPlan: row.subscription_plan,
    subscriptionEndDate: row.subscription_end_date,
    currentPoints: row.current_points,
    pushToken: row.push_token,
    workingSchedule: row.working_schedule,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    coachId: row.coach_id,
    designatedCoach: row.designated_coach,
    currentPoints: row.current_points,
    isSubscribed: row.is_subscribed,
    subscriptionPlan: row.subscription_plan,
    subscriptionEndDate: row.subscription_end_date,
    pushToken: row.push_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// POST /api/auth/signup/coach
router.post('/signup/coach', async (req: Request, res: Response) => {
  const { name, email, password, phone } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
  };

  if (!name || !email || !password) {
    res.status(400).json({ error: 'name, email, and password are required' });
    return;
  }

  try {
    const existing = await pool.query('SELECT id FROM coaches WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = Date.now();

    const result = await pool.query(
      `INSERT INTO coaches (name, email, phone, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, email, phone ?? null, passwordHash, now, now]
    );

    const coach = result.rows[0];
    const token = signToken(coach.id, 'coach');

    res.status(201).json({ token, coach: mapCoach(coach) });
  } catch (err) {
    console.error('[auth] signup/coach error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login/coach
router.post('/login/coach', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const result = await pool.query('SELECT * FROM coaches WHERE email = $1', [email]);
    const coach = result.rows[0];

    if (!coach || !coach.password_hash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, coach.password_hash as string);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken(coach.id, 'coach');
    res.json({ token, coach: mapCoach(coach) });
  } catch (err) {
    console.error('[auth] login/coach error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/signup/client
router.post('/signup/client', async (req: Request, res: Response) => {
  const { name, email, password, phone } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
  };

  if (!name || !email || !password) {
    res.status(400).json({ error: 'name, email, and password are required' });
    return;
  }

  try {
    const existing = await pool.query('SELECT id FROM clients WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = Date.now();

    // If phone provided, check for a coach-pre-registered client with the same phone.
    // These records have no password yet (coach created them without a login account).
    // Merge into that record so the member inherits their coach linkage and lesson history.
    let client = null;
    if (phone) {
      const preRegistered = await pool.query(
        `SELECT * FROM clients WHERE phone = $1 AND password_hash IS NULL LIMIT 1`,
        [phone.trim()]
      );

      if (preRegistered.rows.length > 0) {
        const result = await pool.query(
          `UPDATE clients SET
            name = $1, email = $2, password_hash = $3, updated_at = $4
          WHERE id = $5 RETURNING *`,
          [name, email, passwordHash, now, preRegistered.rows[0].id]
        );
        client = result.rows[0];
      }
    }

    if (!client) {
      const result = await pool.query(
        `INSERT INTO clients (name, email, phone, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, email, phone ?? null, passwordHash, now, now]
      );
      client = result.rows[0];
    }

    const token = signToken(client.id, 'client');
    res.status(201).json({ token, client: mapClient(client) });
  } catch (err) {
    console.error('[auth] signup/client error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login/client
router.post('/login/client', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const result = await pool.query('SELECT * FROM clients WHERE email = $1', [email]);
    const client = result.rows[0];

    if (!client || !client.password_hash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, client.password_hash as string);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken(client.id, 'client');
    res.json({ token, client: mapClient(client) });
  } catch (err) {
    console.error('[auth] login/client error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/password/recover
router.post('/password/recover', passwordRecoveryLimiter, async (req: Request, res: Response) => {
  const { email, phone, role } = req.body as {
    email?: string;
    phone?: string;
    role?: 'coach' | 'client';
  };

  if (!email || !phone || (role !== 'coach' && role !== 'client')) {
    res.status(400).json({ error: 'email, phone, and role are required' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone.trim();

  try {
    const lookupSql =
      role === 'coach'
        ? 'SELECT id, email FROM coaches WHERE LOWER(email) = LOWER($1) AND phone = $2 LIMIT 1'
        : 'SELECT id, email FROM clients WHERE LOWER(email) = LOWER($1) AND phone = $2 LIMIT 1';
    const result = await pool.query(lookupSql, [normalizedEmail, normalizedPhone]);
    const user = result.rows[0] as { id: string; email: string } | undefined;

    if (user?.email) {
      // 32 bytes = 256 bits of entropy for reset token security.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const now = Date.now();
      const expiresAt = now + PASSWORD_RESET_TOKEN_EXPIRY_MS;

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, role, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, role, tokenHash, expiresAt, now]
      );

      const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
      const resetUrl = `${appBaseUrl}/reset-password?token=${rawToken}&role=${role}`;
      const expiresInMinutes = Math.floor(PASSWORD_RESET_TOKEN_EXPIRY_MS / (60 * 1000));
      try {
        await sendPasswordResetMail(user.email, resetUrl, expiresInMinutes);
      } catch (mailError) {
        console.error('[auth] password recovery mail send error:', mailError, {
          role,
          userId: user.id,
          email: user.email,
        });
      }
    }

    res.json({ message: PASSWORD_RECOVERY_MESSAGE });
  } catch (err) {
    console.error('[auth] password/recover error:', err);
    res.json({ message: PASSWORD_RECOVERY_MESSAGE });
  }
});

export default router;
