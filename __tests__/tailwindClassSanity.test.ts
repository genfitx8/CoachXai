/**
 * 죽은 Tailwind 클래스 감시.
 *
 * 라이트→다크 테마 코드모드가 `bg-gray-100/40` 같은 클래스 앞에 다크 토큰을
 * 붙이면서 뒤에 붙어 있던 옛 투명도를 떼지 않았다. 그 결과 `bg-white/[0.05]/40`
 * 처럼 수식자가 두 번 붙은 클래스가 69군데 남았는데, Tailwind 는 이런 클래스에
 * 대해 규칙을 아예 만들지 않는다 — 배경이 흐릿하게 칠해지는 게 아니라 **한 톨도
 * 칠해지지 않는다**. 카드도, 버튼도, hover 도 전부 투명하게 나갔다.
 *
 * `bg-base` 가 `bg-bg-base` 로만 생성되던 예전 버그(coachOverlayChrome.test.tsx)와
 * 같은 계열이다. 눈으로는 "좀 밋밋하네" 정도로만 보여서 오래 살아남는다.
 * 그래서 CSS 가 아니라 소스를 훑어 못 박는다.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__tests__', 'dist', 'dist-coach', 'dist-student',
  'native', 'public', 'evals', 'mock', 'scripts', 'docs',
]);

/** 소스 트리의 모든 .ts/.tsx — 테스트와 빌드 산출물은 뺀다. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * `bg-white/[0.04]/20`, `hover:bg-emerald-500/[0.08]/60` …
 * 색 유틸에 투명도 수식자가 두 번 붙은 형태.
 */
const DOUBLE_OPACITY =
  /\b(?:[a-z-]+:)*(?:bg|text|border|ring|from|via|to|shadow|fill|stroke|divide|outline|accent|caret|decoration|placeholder)-[a-z0-9-]+\/\[[0-9.]+\]\/(?:\[[0-9.]+\]|[0-9]+)/g;

describe('Tailwind 클래스 위생', () => {
  it('투명도 수식자가 두 번 붙은 클래스를 남기지 않는다', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const match of line.match(DOUBLE_OPACITY) ?? []) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${match}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
