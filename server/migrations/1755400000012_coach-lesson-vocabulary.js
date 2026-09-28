/**
 * 코치별 레슨 용어 사전.
 *
 * 레슨 필기는 음성 인식 결과를 골프 용어로 바로잡는 것이 핵심인데, 공용
 * 용어 목록만으로는 코치마다 다른 말투(자기만의 드릴 이름, 스윙 이론 용어,
 * 자주 쓰는 영어 표현)를 알 수 없다. 코치가 직접 등록한 용어와, 검토
 * 화면에서 코치가 필기를 고친 기록(잘못 들린 말 → 바른 말)을 여기에 두고
 * 전사·교정 프롬프트에 함께 싣는다.
 *
 * 형태: {"terms": ["원 플레인", ...], "corrections": [{"from": "원플레인", "to": "원 플레인"}, ...]}
 * 값의 정규화·상한은 라우트(services/lessonVocabulary.ts)가 책임진다.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE coaches
      ADD COLUMN IF NOT EXISTS lesson_vocabulary JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE coaches DROP COLUMN IF EXISTS lesson_vocabulary`);
};
