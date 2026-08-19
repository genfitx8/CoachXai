/**
 * 자유 텍스트 PII 스크럽 (docs/DATA_ARCHITECTURE.md §6.3).
 *
 * 추출 시점이 아니라 **저장 시점**에 건다. 원문이 DB에 들어가기 전에
 * 지워야 유출 표면이 줄고, 나중에 데이터셋을 뽑을 때 다시 훑을 일이 없다.
 *
 * 스윙 데이터(118m, 74 mph, 15.6°)를 망가뜨리지 않는 선에서 보수적으로
 * 동작한다 — 확실한 식별자 형태만 치환하고, 애매한 숫자는 건드리지 않는다.
 * LLM 검수 단계는 추출 파이프라인 쪽 몫으로 남긴다.
 */

const RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // 주민등록번호 — 전화번호 규칙보다 먼저 걸러야 한다.
  { pattern: /\b\d{6}[-\s]?[1-4]\d{6}\b/g, replacement: '[RRN]' },
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, replacement: '[EMAIL]' },
  // 휴대폰 (010-1234-5678 / +82 10 1234 5678 / 01012345678).
  // 앞뒤 자릿수 경계를 막아, 긴 숫자열 한복판을 잘라내지 않게 한다.
  {
    pattern: /(?<![0-9])(?:\+?82[-\s.]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(?![0-9])/g,
    replacement: '[PHONE]',
  },
  // 지역번호 유선 (02-123-4567 / 031-1234-5678)
  { pattern: /\b0\d{1,2}[-\s.]\d{3,4}[-\s.]\d{4}\b/g, replacement: '[PHONE]' },
];

/** 원문에서 확실한 개인 식별자를 치환한다. 입력이 없으면 그대로 반환. */
export function scrubPii(text: string | null | undefined): string | null {
  if (!text) return null;
  let out = text;
  for (const { pattern, replacement } of RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
