/**
 * 이중 요약(3단계) — 코치 요약 · 학생 요약의 단위 테스트.
 *
 * 두 요약으로 나누는 이유는 "코치가 시킨 것"과 "학생이 답한 것"이 다음
 * 레슨에서 쓰이는 쓸모가 다르기 때문이다. 그래서 검증할 것은 문장 품질이
 * 아니라 (a) 프롬프트가 두 근거를 화자별로 갈라 요구하는가, (b) 응답이
 * 흔들려도 요약을 통째로 잃지 않는가, (c) 합본↔두 칸 변환이 왕복하는가이다.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/geminiService', () => ({
  invokeBackendAI: vi.fn(),
  getResponseText: (r: unknown) => (typeof r === 'string' ? r : null),
}));
vi.mock('../services/promptService', () => ({
  promptService: { getActiveSystemPrompt: vi.fn(async () => 'SYSTEM') },
}));
vi.mock('../services/firebase', () => ({
  firebaseService: { isInitialized: () => false },
}));

import {
  DUAL_SUMMARY_HEADINGS,
  buildDualSummaryPrompt,
  formatDualSummary,
  parseDualSummaryResponse,
  splitDualSummary,
  type LessonSegmentNote,
  type TranscriptTurn,
} from '../services/lessonAudioPipeline';

const note = (
  index: number,
  turns: TranscriptTurn[],
  metrics: string[] = []
): LessonSegmentNote => ({
  index,
  startSec: index * 10,
  durationSec: 10,
  status: 'done',
  transcript: turns.map((t) => t.text).join(' '),
  turns,
  keyPoints: [],
  drills: [],
  metrics,
  studentState: '',
});

const notes = [
  note(
    0,
    [
      { speaker: 'coach', text: '백스윙에서 체중이 오른발 안쪽에 남아야 합니다' },
      { speaker: 'student', text: '오른쪽으로 밀리는 느낌이 들어요' },
    ],
    ['드라이버 캐리 210m']
  ),
  note(1, [{ speaker: 'other', text: '옆 타석 잡담' }]),
];

describe('buildDualSummaryPrompt', () => {
  it('화자 라벨이 붙은 필기와 두 요약의 근거를 갈라 요구한다', () => {
    const prompt = buildDualSummaryPrompt(notes, '한윤슬');
    expect(prompt).toContain('코치: 백스윙에서 체중이');
    expect(prompt).toContain('학생: 오른쪽으로 밀리는 느낌이 들어요');
    expect(prompt).toContain('coachSummary');
    expect(prompt).toContain('studentSummary');
    expect(prompt).toContain('코치가 한 말만 근거로');
    expect(prompt).toContain('학생(한윤슬)이 한 말만 근거로');
    // 수치는 요약이 그대로 인용해야 하므로 프롬프트에 실린다.
    expect(prompt).toContain('드라이버 캐리 210m');
    // 옆 타석 잡담을 리포트에서 빼는 규칙이 함께 간다.
    expect(prompt).toContain('"주변" 으로 표시된 발화');
  });

  it('학생 발화가 없으면 지어내지 말라고 못 박는다', () => {
    expect(buildDualSummaryPrompt(notes, '한윤슬')).toContain(
      'studentSummary 는 빈 문자열'
    );
  });
});

describe('parseDualSummaryResponse', () => {
  it('두 요약을 각각 뽑는다', () => {
    const out = parseDualSummaryResponse(
      '{"coachSummary":"- 체중 이동 교정","studentSummary":"- 오른쪽 밀림을 호소"}'
    );
    expect(out.coach).toBe('- 체중 이동 교정');
    expect(out.student).toBe('- 오른쪽 밀림을 호소');
  });

  it('학생 발화가 없던 레슨은 학생 요약이 비어도 통과시킨다', () => {
    const out = parseDualSummaryResponse(
      '{"coachSummary":"- 체중 이동 교정","studentSummary":""}'
    );
    expect(out.coach).toBe('- 체중 이동 교정');
    expect(out.student).toBe('');
  });

  it('스키마를 못 지킨 평문 응답은 코치 요약으로 살린다', () => {
    const out = parseDualSummaryResponse('- 체중 이동 교정\n- 그립 압력');
    expect(out.coach).toBe('- 체중 이동 교정\n- 그립 압력');
    expect(out.student).toBe('');
  });
});

describe('formatDualSummary · splitDualSummary', () => {
  it('두 요약을 소제목으로 갈라 한 본문으로 합친다', () => {
    const text = formatDualSummary({ coach: '- 체중 이동', student: '- 밀림 호소' });
    expect(text).toContain(`**${DUAL_SUMMARY_HEADINGS.coach}**`);
    expect(text).toContain(`**${DUAL_SUMMARY_HEADINGS.student}**`);
    expect(splitDualSummary(text)).toEqual({
      coach: '- 체중 이동',
      student: '- 밀림 호소',
    });
  });

  it('빈 쪽은 소제목까지 통째로 뺀다', () => {
    const text = formatDualSummary({ coach: '- 체중 이동', student: '' });
    expect(text).toBe(`**${DUAL_SUMMARY_HEADINGS.coach}**\n- 체중 이동`);
    expect(formatDualSummary({ coach: '', student: '' })).toBe('');
  });

  it('소제목이 없는 구버전 단일 요약은 코치 요약으로 읽는다', () => {
    expect(splitDualSummary('- 예전 방식의 요약 한 줄')).toEqual({
      coach: '- 예전 방식의 요약 한 줄',
      student: '',
    });
    expect(splitDualSummary('   ')).toEqual({ coach: '', student: '' });
  });
});
