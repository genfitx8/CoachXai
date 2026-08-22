import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { rateLimit } from 'express-rate-limit';
import pool from '../services/db';
import { sendPasswordResetMail, sendSignupVerificationMail, isMailConfigured } from '../services/mail';
import type { AuthRole } from '../middleware/auth';

const router = Router();

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRY = '30d';
const PASSWORD_RECOVERY_MESSAGE = '등록된 이메일로 비밀번호 안내 메일을 발송했습니다.';
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000;
const PASSWORD_RECOVERY_WINDOW_MS = 10 * 60 * 1000;
const PASSWORD_RECOVERY_MAX_REQUESTS = 5;

// ── 회원가입 이메일 인증 ──────────────────────────────────────────────────
// 가입 폼에 적힌 이메일이 실제로 본인 것인지 확인한 뒤에만 계정을 만든다.
// 확인하지 않고 만들면 오타난 주소로 가입된 계정이 비밀번호 재설정 메일을
// 영영 못 받아 복구 불가능해지고, 남의 주소로도 가입이 된다.
const EMAIL_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
// 코드 확인 이후 가입 완료까지 허용하는 시간. 남은 폼을 마저 채우기에는
// 넉넉하되, 확인해 둔 이메일이 무기한 가입권으로 남지는 않을 만큼 짧게.
const EMAIL_VERIFICATION_GRACE_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
const EMAIL_VERIFICATION_SENT_MESSAGE = '입력하신 이메일로 인증번호를 보냈습니다.';
const EMAIL_NOT_VERIFIED_MESSAGE = '이메일 인증이 필요합니다. 인증번호를 확인해주세요.';
const EMAIL_IN_USE_ERROR = 'Email already in use';

// 메일 발송을 동반하므로 비밀번호 찾기와 같은 강도로 조인다. 확인 쪽은
// 코드 자체를 무차별 대입하는 경로라 행(row)별 시도 횟수 제한과 함께 건다.
const emailVerificationRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  // 한 IP를 여러 사람이 공유하는 경우(아카데미 와이파이에서 회원들이 함께
  // 가입)가 실제로 있어서 비밀번호 찾기보다 조금 여유를 둔다.
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const emailVerificationConfirmLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
// Admin login is a single shared credential, so throttle it harder than the
// per-account login routes to slow brute-force attempts.
const adminLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const passwordRecoveryLimiter = rateLimit({
  windowMs: PASSWORD_RECOVERY_WINDOW_MS,
  limit: PASSWORD_RECOVERY_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.json({ message: PASSWORD_RECOVERY_MESSAGE });
  },
});

const ADMIN_JWT_EXPIRY = '12h';
// Credentials the admin console shipped with before server-side admin auth
// existed (they were hardcoded in the frontend bundle, so they were never a
// secret). They stay as the fallback so an un-migrated deployment keeps
// working, but ADMIN_EMAIL / ADMIN_PASSWORD should be set in production.
const LEGACY_ADMIN_EMAIL = 'admin@coachx.kr';
const LEGACY_ADMIN_PASSWORD = 'admin1234';
const ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

const branchAdminLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function signBranchAdminToken(id: string, branchId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ id, role: 'branch_admin', branchId }, secret, {
    expiresIn: '12h',
  } as jwt.SignOptions);
}

function signToken(id: string, role: AuthRole, expiresIn: string = JWT_EXPIRY): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ id, role }, secret, { expiresIn } as jwt.SignOptions);
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
    // The student's own bio. coach_memo is deliberately absent — it is the
    // coach's private note and must never reach the student.
    memo: row.memo,
    currentPoints: row.current_points,
    isSubscribed: row.is_subscribed,
    subscriptionPlan: row.subscription_plan,
    subscriptionEndDate: row.subscription_end_date,
    pushToken: row.push_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/** 6자리 숫자 코드. 추측 가능한 Math.random() 대신 crypto로 뽑는다. */
function generateVerificationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function verificationCodeMatches(code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashVerificationCode(code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/**
 * 이메일 인증 강제 여부. 기본은 켬. SMTP가 없는 개발 환경에서는 코드가
 * 서버 콘솔에 찍히므로 그대로도 가입 흐름을 끝까지 돌려볼 수 있다.
 * 인증 단계를 아예 건너뛰어야 하는 배포만 REQUIRE_EMAIL_VERIFICATION=false
 * 로 빠져나간다.
 */
function isEmailVerificationRequired(): boolean {
  return (process.env.REQUIRE_EMAIL_VERIFICATION ?? 'true').trim().toLowerCase() !== 'false';
}

async function isEmailTaken(role: 'coach' | 'client', email: string): Promise<boolean> {
  const table = role === 'coach' ? 'coaches' : 'clients';
  const result = await pool.query(
    `SELECT id FROM ${table} WHERE LOWER(email) = $1 LIMIT 1`,
    [normalizeEmail(email)]
  );
  return result.rows.length > 0;
}

/**
 * 아직 가입에 쓰이지 않은, 유효 시간 안의 "확인 완료" 인증 행을 찾는다.
 * 가입 라우트는 이 행이 있을 때만 계정을 만들고, 만든 뒤 이 행을 소모시켜
 * 같은 코드로 두 번 가입하는 것을 막는다.
 */
async function findVerifiedEmailVerification(
  role: 'coach' | 'client',
  email: string
): Promise<string | null> {
  const result = await pool.query(
    `SELECT id FROM email_verifications
      WHERE email = $1 AND role = $2
        AND consumed_at IS NULL
        AND verified_at IS NOT NULL
        AND verified_at > $3
      ORDER BY verified_at DESC
      LIMIT 1`,
    [normalizeEmail(email), role, Date.now() - EMAIL_VERIFICATION_GRACE_MS]
  );
  return (result.rows[0]?.id as string | undefined) ?? null;
}

// POST /api/auth/email/verify/request — 가입용 인증번호 발송
router.post(
  '/email/verify/request',
  emailVerificationRequestLimiter,
  async (req: Request, res: Response) => {
    const { email, role } = req.body as { email?: string; role?: 'coach' | 'client' };

    if (!email || (role !== 'coach' && role !== 'client')) {
      res.status(400).json({ error: 'email and role are required' });
      return;
    }
    const normalizedEmail = normalizeEmail(email);
    // 최소 형태 검사. 진짜 검증은 코드가 실제로 도착하는지 여부가 한다.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      res.status(400).json({ error: '올바른 이메일 주소를 입력해주세요.' });
      return;
    }

    // 운영 환경에서 SMTP가 없으면 코드는 서버 콘솔에만 찍힌다. 그런데도
    // "보냈습니다"라고 답하면 사용자는 오지 않는 메일을 기다리며 가입을
    // 끝낼 수 없다. 조용한 막다른 길 대신 이유를 밝히고 거절한다.
    if (isEmailVerificationRequired() && !isMailConfigured() && process.env.NODE_ENV === 'production') {
      console.error(
        '[auth] SMTP 미설정 상태에서 가입 인증번호 요청이 들어왔습니다. ' +
          'SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS 를 설정하거나, ' +
          '인증을 끄려면 REQUIRE_EMAIL_VERIFICATION=false 로 두세요.'
      );
      res.status(503).json({
        error: '이메일 발송 설정이 완료되지 않아 인증번호를 보낼 수 없습니다. 관리자에게 문의해주세요.',
      });
      return;
    }

    try {
      // 가입 라우트와 같은 판정을 여기서 미리 한다. 코드까지 받아 넣은
      // 다음에야 "이미 사용 중인 이메일"을 듣는 것은 헛수고다.
      if (await isEmailTaken(role, normalizedEmail)) {
        res.status(400).json({ error: EMAIL_IN_USE_ERROR });
        return;
      }

      const now = Date.now();
      // 새 코드를 보내는 순간 이전 코드는 죽는다. 재발송 후에도 옛 코드가
      // 살아 있으면 유효한 코드가 여러 개 떠도는 셈이 된다.
      await pool.query(
        `UPDATE email_verifications SET consumed_at = $1
          WHERE email = $2 AND role = $3 AND consumed_at IS NULL`,
        [now, normalizedEmail, role]
      );

      const code = generateVerificationCode();
      await pool.query(
        `INSERT INTO email_verifications (email, role, code_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          normalizedEmail,
          role,
          hashVerificationCode(code),
          now + EMAIL_VERIFICATION_CODE_TTL_MS,
          now,
        ]
      );

      const expiresInMinutes = Math.floor(EMAIL_VERIFICATION_CODE_TTL_MS / (60 * 1000));
      // 비밀번호 찾기와 달리 발송 실패를 삼키지 않는다. 코드를 못 받으면
      // 가입이 아예 막히므로, 다시 시도할 수 있게 실패를 그대로 알린다.
      await sendSignupVerificationMail(normalizedEmail, code, expiresInMinutes);

      res.json({ message: EMAIL_VERIFICATION_SENT_MESSAGE, expiresInMinutes });
    } catch (err) {
      console.error('[auth] email/verify/request error:', err);
      res.status(500).json({ error: '인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  }
);

// POST /api/auth/email/verify/confirm — 인증번호 확인
router.post(
  '/email/verify/confirm',
  emailVerificationConfirmLimiter,
  async (req: Request, res: Response) => {
    const { email, role, code } = req.body as {
      email?: string;
      role?: 'coach' | 'client';
      code?: string;
    };

    if (!email || !code || (role !== 'coach' && role !== 'client')) {
      res.status(400).json({ error: 'email, role, and code are required' });
      return;
    }
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = code.trim();

    try {
      const result = await pool.query(
        `SELECT id, code_hash, attempts, expires_at, verified_at
           FROM email_verifications
          WHERE email = $1 AND role = $2 AND consumed_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1`,
        [normalizedEmail, role]
      );
      const row = result.rows[0] as
        | { id: string; code_hash: string; attempts: number; expires_at: string; verified_at: string | null }
        | undefined;

      if (!row || Number(row.expires_at) < Date.now()) {
        res.status(400).json({ error: '인증번호가 만료되었습니다. 다시 요청해주세요.' });
        return;
      }
      if (Number(row.attempts) >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
        res.status(429).json({
          error: '인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.',
        });
        return;
      }

      if (!verificationCodeMatches(normalizedCode, row.code_hash)) {
        // 시도 횟수는 실패했을 때만 늘린다. 코드를 맞힌 사람이 뒤로 갔다
        // 돌아와 다시 확인하는 것까지 소진 대상은 아니다.
        await pool.query(
          'UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1',
          [row.id]
        );
        const remaining = EMAIL_VERIFICATION_MAX_ATTEMPTS - (Number(row.attempts) + 1);
        res.status(400).json({
          error:
            remaining > 0
              ? `인증번호가 일치하지 않습니다. (남은 시도 ${remaining}회)`
              : '인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.',
        });
        return;
      }

      if (!row.verified_at) {
        await pool.query('UPDATE email_verifications SET verified_at = $1 WHERE id = $2', [
          Date.now(),
          row.id,
        ]);
      }

      res.json({ verified: true });
    } catch (err) {
      console.error('[auth] email/verify/confirm error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

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
      res.status(400).json({ error: EMAIL_IN_USE_ERROR });
      return;
    }

    // 이메일 인증을 통과한 흔적이 없으면 계정을 만들지 않는다. 폼이 아니라
    // 여기가 실제 관문 — 클라이언트를 거치지 않고 이 엔드포인트를 직접
    // 때려도 인증 없는 가입은 성립하지 않는다.
    let verificationId: string | null = null;
    if (isEmailVerificationRequired()) {
      verificationId = await findVerifiedEmailVerification('coach', email);
      if (!verificationId) {
        res.status(400).json({ error: EMAIL_NOT_VERIFIED_MESSAGE });
        return;
      }
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
    // 계정이 실제로 만들어진 뒤에 소모시킨다. 위에서 미리 소모시키면 삽입이
    // 실패했을 때 인증만 날아가고 가입은 안 된 상태가 된다.
    if (verificationId) {
      await pool.query('UPDATE email_verifications SET consumed_at = $1 WHERE id = $2', [
        now,
        verificationId,
      ]);
    }
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
      res.status(400).json({ error: EMAIL_IN_USE_ERROR });
      return;
    }

    // 코치 가입과 같은 관문. 아래 사전등록 회원 병합 경로도 이 검사를
    // 지난 뒤에만 도달한다 — 병합도 결국 그 이메일로 로그인할 계정을
    // 세우는 일이므로 인증을 건너뛸 이유가 없다.
    let verificationId: string | null = null;
    if (isEmailVerificationRequired()) {
      verificationId = await findVerifiedEmailVerification('client', email);
      if (!verificationId) {
        res.status(400).json({ error: EMAIL_NOT_VERIFIED_MESSAGE });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = Date.now();

    // Legacy pre-registered members: coaches used to be able to create a
    // member row from just a name + phone, before that member had an account
    // of their own. Those rows have no password_hash. New ones are no longer
    // created — students self-register and pick their coach — but rows made
    // before that change are still in the table, so signup keeps merging into
    // a matching one instead of stranding the member's coach linkage and
    // lesson history on an orphan row.
    //
    // The comparison is digits-only on both sides. A literal `phone = $1`
    // never matched when the coach typed 010-1234-5678 and the member typed
    // 01012345678, which silently produced exactly the duplicate account this
    // merge exists to prevent. Every other phone lookup in the codebase
    // already normalizes this way (see lessons.ts and utils/clientMatch.ts).
    let client = null;
    const normalizedPhone = (phone ?? '').replace(/[^0-9]/g, '');
    if (normalizedPhone) {
      const preRegistered = await pool.query(
        `SELECT * FROM clients
          WHERE REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') = $1
            AND password_hash IS NULL
          ORDER BY created_at ASC
          LIMIT 1`,
        [normalizedPhone]
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

    if (verificationId) {
      await pool.query('UPDATE email_verifications SET consumed_at = $1 WHERE id = $2', [
        now,
        verificationId,
      ]);
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

// POST /api/auth/login/admin
//
// The admin console used to authenticate purely in the browser against a
// hardcoded email/password pair, which meant an admin session carried no JWT.
// Every protected list endpoint therefore rejected it, and the dashboard
// silently fell back to whatever happened to be cached in that device's
// localStorage — so 코치 회원 목록 showed one stale coach instead of the
// real roster. Issuing a real token here lets the admin read server data.
router.post('/login/admin', adminLoginLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const expectedEmail = (process.env.ADMIN_EMAIL || LEGACY_ADMIN_EMAIL).trim().toLowerCase();
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    const plainPassword = process.env.ADMIN_PASSWORD;

    if (!passwordHash && !plainPassword) {
      console.warn(
        '[auth] ADMIN_PASSWORD / ADMIN_PASSWORD_HASH is not configured; ' +
          'falling back to the legacy built-in admin credentials. Set one of them.'
      );
    }

    const emailMatches = email.trim().toLowerCase() === expectedEmail;
    let passwordMatches: boolean;
    if (passwordHash) {
      passwordMatches = await bcrypt.compare(password, passwordHash);
    } else {
      passwordMatches = password === (plainPassword || LEGACY_ADMIN_PASSWORD);
    }

    if (!emailMatches || !passwordMatches) {
      res.status(401).json({ error: '관리자 로그인 정보가 일치하지 않습니다.' });
      return;
    }

    // Admin is not a row in any table. Use the nil UUID as the token
    // identity so any route that still interpolates the caller id into a
    // `uuid` column comparison matches nothing instead of blowing up with a
    // Postgres invalid-input-syntax error.
    const token = signToken(ADMIN_SENTINEL_ID, 'admin', ADMIN_JWT_EXPIRY);
    res.json({ token });
  } catch (err) {
    console.error('[auth] login/admin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login/branch-admin — server-side branch staff auth
// (docs/DATA_ARCHITECTURE.md §8.3). Replaces the fully client-side check
// that compared plaintext passwords in localStorage. loginId format is the
// same one the UI already uses: "지점이름:유저이름".
router.post('/login/branch-admin', branchAdminLoginLimiter, async (req: Request, res: Response) => {
  const { loginId, password } = req.body as { loginId?: string; password?: string };

  if (!loginId || !password) {
    res.status(400).json({ error: 'loginId and password are required' });
    return;
  }
  const colonIdx = loginId.indexOf(':');
  if (colonIdx <= 0 || colonIdx === loginId.length - 1) {
    res.status(400).json({
      error: '로그인 아이디 형식이 올바르지 않습니다. "지점이름:유저이름" 형식으로 입력해주세요.',
    });
    return;
  }
  const branchName = loginId.slice(0, colonIdx).trim();
  const username = loginId.slice(colonIdx + 1).trim();

  try {
    const branchRow = await pool.query(
      `SELECT id, doc FROM branches WHERE name = $1 AND is_active = true LIMIT 1`,
      [branchName]
    );
    const branch = branchRow.rows[0];
    if (!branch) {
      res.status(401).json({ error: '존재하지 않거나 비활성화된 지점입니다.' });
      return;
    }

    const accountRow = await pool.query(
      `SELECT id, password_hash, is_active FROM branch_admins
        WHERE branch_id = $1 AND username = $2`,
      [branch.id, username]
    );
    const account = accountRow.rows[0];
    if (!account) {
      res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
      return;
    }
    if (!account.is_active) {
      res.status(401).json({ error: '비활성화된 계정입니다. 시스템 관리자에게 문의하세요.' });
      return;
    }
    const passwordMatches = await bcrypt.compare(password, account.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
      return;
    }

    const token = signBranchAdminToken(account.id, branch.id);
    res.json({
      token,
      branchId: branch.id,
      branchName,
      username,
      adminId: account.id,
    });
  } catch (err) {
    console.error('[auth] login/branch-admin error:', err);
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
