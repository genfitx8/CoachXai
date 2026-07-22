import { Pool } from 'pg';
import { CURRICULUM_PART_DEFS } from '../seeds/curriculumParts';

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
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL,
      role       VARCHAR(20) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at BIGINT NOT NULL,
      used_at    BIGINT,
      created_at BIGINT NOT NULL
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
      media_type           VARCHAR(20),
      coach_notes          TEXT,
      ai_analysis          JSONB,
      scorecard            JSONB,
      member_body_analysis JSONB,
      assigned_homework    JSONB,
      media                JSONB,
      lesson_package_id    UUID,
      session_number       INTEGER,
      created_by           VARCHAR(20),
      record_type          VARCHAR(20),
      club                 VARCHAR(100),
      target_distance      INTEGER,
      score                INTEGER,
      scorecard_detail     JSONB,
      swing_angle          VARCHAR(20),
      additional_media     JSONB,
      thumbnail_url        TEXT,
      tags                 JSONB,
      golf_data            JSONB,
      swing_sequence       JSONB,
      share_option         VARCHAR(20),
      client_feedback      JSONB,
      feedback_status      VARCHAR(20),
      edited_video_url     TEXT,
      video_edit_metadata  JSONB,
      compare_video_url    TEXT,
      compare_video_metadata JSONB,
      created_at           BIGINT NOT NULL,
      updated_at           BIGINT NOT NULL
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_lessons_client_phone ON lessons (client_phone)`
  );

  // Add columns to existing lessons tables that were created before these fields existed
  const lessonAlters = [
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS media_type VARCHAR(20)",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS created_by VARCHAR(20)",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS record_type VARCHAR(20)",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS club VARCHAR(100)",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS target_distance INTEGER",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS score INTEGER",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS scorecard_detail JSONB",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS swing_angle VARCHAR(20)",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS additional_media JSONB",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS thumbnail_url TEXT",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS tags JSONB",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS golf_data JSONB",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS swing_sequence JSONB",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS share_option VARCHAR(20)",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS client_feedback JSONB",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS feedback_status VARCHAR(20)",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS edited_video_url TEXT",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_edit_metadata JSONB",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS compare_video_url TEXT",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS compare_video_metadata JSONB",
  ];
  for (const sql of lessonAlters) {
    await pool.query(sql);
  }

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

  // ── Curriculum system ────────────────────────────────────────────────────

  await pool.query(`
    CREATE TABLE IF NOT EXISTS curriculums (
      id              VARCHAR(255) PRIMARY KEY,
      title           VARCHAR(500) NOT NULL,
      description     TEXT,
      coach_id        UUID,
      created_at      BIGINT NOT NULL,
      updated_at      BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS curriculum_parts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      curriculum_id   VARCHAR(255) NOT NULL REFERENCES curriculums(id) ON DELETE CASCADE,
      part_key        VARCHAR(50) NOT NULL,
      part_order      INTEGER NOT NULL DEFAULT 1,
      title           VARCHAR(500) NOT NULL,
      content         TEXT,
      key_points      JSONB DEFAULT '[]',
      created_at      BIGINT NOT NULL,
      updated_at      BIGINT NOT NULL,
      UNIQUE(curriculum_id, part_key)
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_curriculum_parts_curriculum_id ON curriculum_parts (curriculum_id)`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_curriculums (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id     VARCHAR(255) NOT NULL,
      curriculum_id  VARCHAR(255) NOT NULL REFERENCES curriculums(id) ON DELETE CASCADE,
      coach_id       UUID,
      assigned_at    BIGINT NOT NULL,
      created_at     BIGINT NOT NULL,
      UNIQUE(student_id, curriculum_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_part_progress (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id        VARCHAR(255) NOT NULL,
      curriculum_id     VARCHAR(255) NOT NULL,
      part_progress     JSONB DEFAULT '{}',
      overall_progress  INTEGER DEFAULT 0,
      completed_at      BIGINT,
      assigned_at       BIGINT NOT NULL,
      updated_at        BIGINT NOT NULL,
      UNIQUE(student_id, curriculum_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS part_lesson_records (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      part_id          UUID NOT NULL,
      curriculum_id    VARCHAR(255) NOT NULL,
      student_id       VARCHAR(255) NOT NULL,
      student_name     VARCHAR(255),
      coach_id         UUID NOT NULL,
      lesson_date      VARCHAR(20),
      text_memo        TEXT,
      media_files      JSONB DEFAULT '[]',
      checklist        JSONB DEFAULT '[]',
      linked_lesson_id UUID,
      coach_feedback   TEXT,
      created_at       BIGINT NOT NULL,
      updated_at       BIGINT NOT NULL
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_part_lesson_records_part ON part_lesson_records (part_id, student_id)`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS curriculum_part_templates (
      part_key    VARCHAR(50) PRIMARY KEY,
      part_order  INTEGER NOT NULL,
      title       VARCHAR(500) NOT NULL,
      content     TEXT,
      key_points  JSONB DEFAULT '[]',
      updated_at  BIGINT NOT NULL
    )
  `);

  // Seed the admin-editable templates from the built-in defaults once.
  // ON CONFLICT DO NOTHING preserves any admin edits across restarts/redeploys.
  const now = Date.now();
  for (const def of CURRICULUM_PART_DEFS) {
    await pool.query(
      `INSERT INTO curriculum_part_templates (part_key, part_order, title, content, key_points, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (part_key) DO NOTHING`,
      [def.partKey, def.partOrder, def.title, def.content, JSON.stringify(def.keyPoints), now]
    );
  }
}

export default pool;
