/**
 * 회원가입 이메일 인증 (docs/DATA_ARCHITECTURE.md §8.3).
 *
 * 가입 폼에 적힌 이메일이 실제로 그 사람 것인지 확인하지 않은 채 계정이
 * 만들어지고 있었다. 오타난 주소로 가입하면 비밀번호 재설정 메일이 영영
 * 닿지 않고(=계정 복구 불가), 남의 주소로도 가입이 된다.
 *
 * 그래서 가입 전에 6자리 코드를 메일로 보내고, 그 코드를 확인한 뒤에만
 * 계정을 만든다. 코드 원문은 저장하지 않는다 — password_reset_tokens와
 * 같은 방식으로 SHA-256 해시만 남긴다.
 *
 * 행은 소모(consumed_at)될 뿐 삭제되지 않는다. 한 번 인증에 쓴 코드로
 * 두 번 가입하는 것을 막으려면 "이미 썼다"는 사실 자체가 남아야 한다.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       VARCHAR(255) NOT NULL,   -- 항상 소문자로 정규화해서 저장
      role        VARCHAR(20)  NOT NULL,   -- coach | client
      code_hash   VARCHAR(255) NOT NULL,   -- SHA-256(6자리 코드)
      attempts    INTEGER      NOT NULL DEFAULT 0,
      expires_at  BIGINT       NOT NULL,
      verified_at BIGINT,                  -- 코드 확인 성공 시각
      consumed_at BIGINT,                  -- 가입에 사용됐거나 무효화된 시각
      created_at  BIGINT       NOT NULL
    )
  `);

  // 인증 요청/확인/가입 세 경로 모두 "이 이메일+역할의 아직 안 쓴 최신 행"을
  // 찾는다. 부분 인덱스로 소모된 과거 행은 아예 건너뛴다.
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_email_verifications_pending
      ON email_verifications (email, role, created_at DESC)
      WHERE consumed_at IS NULL
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS email_verifications`);
};
