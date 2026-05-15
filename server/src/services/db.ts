import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      order_id          VARCHAR(255) PRIMARY KEY,
      user_id           VARCHAR(255) NOT NULL,
      amount            INTEGER      NOT NULL,
      points            INTEGER      NOT NULL DEFAULT 0,
      status            VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
      payment_key       VARCHAR(255),
      order_type        VARCHAR(50),
      role              VARCHAR(20),
      plan_name         VARCHAR(255),
      membership_months INTEGER,
      created_at        BIGINT       NOT NULL,
      updated_at        BIGINT       NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS point_transactions (
      id          VARCHAR(255) PRIMARY KEY,
      client_id   VARCHAR(255) NOT NULL,
      amount      INTEGER      NOT NULL,
      type        VARCHAR(100) NOT NULL,
      description TEXT,
      order_id    VARCHAR(255),
      created_at  BIGINT       NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coaches (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                 VARCHAR(255) NOT NULL,
      email                VARCHAR(255) UNIQUE,
      phone                VARCHAR(50),
      password_hash        VARCHAR(255),
      is_subscribed        BOOLEAN DEFAULT false,
      subscription_plan    VARCHAR(20) DEFAULT 'FREE',
      subscription_end_date VARCHAR(50),
      current_points       INTEGER DEFAULT 0,
      push_token           VARCHAR(255),
      working_schedule     JSONB,
      created_at           BIGINT NOT NULL,
      updated_at           BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                 VARCHAR(255) NOT NULL,
      phone                VARCHAR(50),
      email                VARCHAR(255),
      password_hash        VARCHAR(255),
      coach_id             UUID,
      designated_coach     VARCHAR(255),
      current_points       INTEGER DEFAULT 0,
      is_subscribed        BOOLEAN DEFAULT false,
      subscription_plan    VARCHAR(20) DEFAULT 'FREE',
      subscription_end_date VARCHAR(50),
      push_token           VARCHAR(255),
      created_at           BIGINT NOT NULL,
      updated_at           BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id            VARCHAR(255),
      client_name          VARCHAR(255),
      client_phone         VARCHAR(50),
      coach_id             UUID,
      title                VARCHAR(500),
      date                 VARCHAR(50),
      video_url            TEXT,
      video_key            TEXT,
      coach_notes          TEXT,
      ai_analysis          JSONB,
      scorecard            JSONB,
      member_body_analysis JSONB,
      assigned_homework    JSONB,
      media                JSONB,
      lesson_package_id    UUID,
      session_number       INTEGER,
      created_at           BIGINT NOT NULL,
      updated_at           BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_packages (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id           UUID,
      client_id          VARCHAR(255),
      client_name        VARCHAR(255),
      total_sessions     INTEGER DEFAULT 0,
      used_sessions      INTEGER DEFAULT 0,
      remaining_sessions INTEGER DEFAULT 0,
      price_per_session  INTEGER DEFAULT 0,
      description        TEXT,
      expiry_date        VARCHAR(50),
      created_at         BIGINT NOT NULL,
      updated_at         BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_programs (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id       UUID,
      client_id      VARCHAR(255),
      config         JSONB,
      generated_plan TEXT,
      created_at     BIGINT NOT NULL,
      updated_at     BIGINT NOT NULL
    )
  `);
}

export default pool;
