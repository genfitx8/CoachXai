/**
 * 검토 섹션(LessonReviewSections) → 학습쌍용 평문.
 *
 * "AI 초안 vs 코치 최종본"(docs/DATA_ARCHITECTURE.md §6.1)을 비교하고
 * 저장할 때 쓰는 표준 직렬화다. 클라이언트(LessonReviewScreen)도 같은
 * 형식을 쓰므로, 두 경로에서 나온 학습쌍이 한 데이터셋에서 섞여도 된다.
 *
 * 자유 메모(freeMemo)는 뺀다 — AI가 쓴 적 없는 코치 개인 메모라
 * 비교에 넣으면 없던 차이를 만들어낸다.
 */
export function reviewSectionsToText(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  const blocks: string[] = [];
  if (typeof s.todayCovered === 'string' && s.todayCovered.trim()) {
    blocks.push(`[오늘 다룬 것]\n${s.todayCovered.trim()}`);
  }
  if (typeof s.feedback === 'string' && s.feedback.trim()) {
    blocks.push(`[피드백]\n${s.feedback.trim()}`);
  }
  const actions = Array.isArray(s.nextActions)
    ? s.nextActions.filter(
        (a): a is string => typeof a === 'string' && a.trim().length > 0
      )
    : [];
  if (actions.length > 0) {
    blocks.push(`[다음 액션]\n${actions.map((a) => `- ${a.trim()}`).join('\n')}`);
  }
  return blocks.length > 0 ? blocks.join('\n\n') : null;
}
