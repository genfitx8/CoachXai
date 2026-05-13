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
}

export default pool;
