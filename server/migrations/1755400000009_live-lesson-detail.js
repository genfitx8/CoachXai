/**
 * 레슨 동반(LIVE_LESSON) 기록 분리.
 *
 * 레슨 중 동반(3c)에서 캡처한 음성/사진/영상은 이제 일반 레슨 기록이
 * 아니라 record_type = 'LIVE_LESSON' 인 별도 카테고리로 저장된다. 그
 * 카테고리는 저장 형태가 다르다: 음성이 ~10초 단위로 받아 적힌 필기
 * (레슨 내용 텍스트)와 요약본이 미디어와 함께 남아야 한다. 이 컬럼이
 * 그 텍스트 구조(transcript / summary / keyPoints / drills)를 담는다.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(
    'ALTER TABLE lessons ADD COLUMN IF NOT EXISTS live_lesson_detail JSONB'
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('ALTER TABLE lessons DROP COLUMN IF EXISTS live_lesson_detail');
};
