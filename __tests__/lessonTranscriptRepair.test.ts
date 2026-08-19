/**
 * 코칭 언어 교정(1단계)의 단위 테스트.
 *
 * 이 단계의 계약은 하나다: **발음이 비슷한 오인식 단어만 고친다.** 그래서
 * 검증할 것도 "얼마나 잘 고쳤나"(모델 품질)가 아니라, 파이프라인이
 * (a) 교정본을 제자리에 되돌리는가, (b) 교정을 빙자한 창작·요약을 걸러
 * 내는가, (c) 교정이 실패해도 필기 원문이 살아남는가이다.
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
  buildTranscriptRepairPrompt,
  isAcceptableRepair,
  parseTranscriptRepairResponse,
  repairTranscriptTerms,
  type LessonSegmentNote,
  type TranscriptTurn,
} from '../services/lessonAudioPipeline';

const note = (
  index: number,
  transcript: string,
  turns?: TranscriptTurn[]
): LessonSegmentNote => ({
  index,
  startSec: index * 10,
  durationSec: 10,
  status: 'done',
  transcript,
  ...(turns ? { turns } : {}),
  keyPoints: [],
  drills: [],
  metrics: [],
  studentState: '',
});

describe('buildTranscriptRepairPrompt', () => {
  it('줄 번호와 코칭 어휘, 교정 계약을 함께 싣는다', () => {
    const prompt = buildTranscriptRepairPrompt(
      [
        { id: 1, text: '페이서가 열려서 슬라이드가 났어요' },
        { id: 2, text: '얼리 익스텐선 나오네요' },
      ],
      '한윤슬'
    );
    expect(prompt).toContain('1. 페이서가 열려서 슬라이드가 났어요');
    expect(prompt).toContain('2. 얼리 익스텐선 나오네요');
    expect(prompt).toContain('한윤슬');
    // 어휘 힌트 없이는 무엇으로 되돌릴지 기준이 없다.
    expect(prompt).toContain('얼리 익스텐션');
    // 교정이 창작이 되지 않도록 하는 계약이 프롬프트에 남아 있어야 한다.
    expect(prompt).toContain('고친 줄만');
    expect(prompt).toContain('요약하거나');
  });

  it('직전 묶음의 문맥을 참고용으로만 붙인다', () => {
    const prompt = buildTranscriptRepairPrompt([{ id: 9, text: '지금 좋아요' }], '한윤슬', [
      '체중 이동이 늦습니다',
    ]);
    expect(prompt).toContain('체중 이동이 늦습니다');
    expect(prompt).toContain('다시 고치지 마세요');
  });
});

describe('parseTranscriptRepairResponse', () => {
  it('fixes 배열을 줄 번호 맵으로 정규화한다', () => {
    const map = parseTranscriptRepairResponse(
      '```json\n{"fixes":[{"i":1,"text":"페이스가 열려서 슬라이스가 났어요"},{"i":"2","text":"얼리 익스텐션 나오네요"}]}\n```'
    );
    expect(map.get(1)).toBe('페이스가 열려서 슬라이스가 났어요');
    expect(map.get(2)).toBe('얼리 익스텐션 나오네요');
  });

  it('깨진 응답은 교정 없음으로 떨어뜨린다', () => {
    expect(parseTranscriptRepairResponse('그냥 평문').size).toBe(0);
    expect(parseTranscriptRepairResponse('{"fixes": "없음"}').size).toBe(0);
    expect(parseTranscriptRepairResponse('{"fixes":[{"i":1,"text":"   "}]}').size).toBe(0);
  });
});

describe('isAcceptableRepair', () => {
  it('길이가 비슷한 용어 치환만 받아들인다', () => {
    expect(isAcceptableRepair('페이서가 열렸어요', '페이스가 열렸어요')).toBe(true);
  });

  it('설명을 덧붙이거나 요약한 응답은 교정이 아니라 창작으로 본다', () => {
    const original = '페이서가 열렸어요';
    expect(
      isAcceptableRepair(
        original,
        '페이스가 열렸어요. 페이스가 열린다는 것은 임팩트 순간 클럽 페이스가 목표선보다 오른쪽을 향한다는 뜻입니다.'
      )
    ).toBe(false);
    expect(isAcceptableRepair('페이서가 열려서 볼이 오른쪽으로 크게 휘었어요', '슬라이스')).toBe(
      false
    );
  });

  it('바뀐 것이 없거나 빈 응답은 무시한다', () => {
    expect(isAcceptableRepair('그립 압력', '그립 압력')).toBe(false);
    expect(isAcceptableRepair('그립 압력', '   ')).toBe(false);
  });
});

describe('repairTranscriptTerms', () => {
  it('교정본을 노트 제자리에 되돌리고 원본은 건드리지 않는다', async () => {
    const notes = [note(0, '페이서가 열려서 슬라이드가 났어요'), note(1, '네 알겠습니다')];
    const repairer = vi.fn(async () =>
      JSON.stringify({ fixes: [{ i: 1, text: '페이스가 열려서 슬라이스가 났어요' }] })
    );

    const out = await repairTranscriptTerms(notes, '한윤슬', repairer);

    expect(out[0].transcript).toBe('페이스가 열려서 슬라이스가 났어요');
    expect(out[1].transcript).toBe('네 알겠습니다');
    // 원본 배열은 그대로 — 호출부가 실패 시 되돌릴 수 있어야 한다.
    expect(notes[0].transcript).toBe('페이서가 열려서 슬라이드가 났어요');
  });

  it('화자 라벨이 붙은 노트는 발화 단위로 고치고 전사를 다시 잇는다', async () => {
    const notes = [
      note(0, '체중 이돈이 늦어요 네 알겠습니다', [
        { speaker: 'coach', text: '체중 이돈이 늦어요' },
        { speaker: 'student', text: '네 알겠습니다' },
      ]),
    ];
    const repairer = vi.fn(async () =>
      JSON.stringify({ fixes: [{ i: 1, text: '체중 이동이 늦어요' }] })
    );

    const out = await repairTranscriptTerms(notes, '한윤슬', repairer);

    expect(out[0].turns?.[0].text).toBe('체중 이동이 늦어요');
    expect(out[0].turns?.[1].text).toBe('네 알겠습니다');
    // transcript 는 언제나 turns 를 이어 붙인 결과라는 불변식.
    expect(out[0].transcript).toBe('체중 이동이 늦어요 네 알겠습니다');
    expect(out[0].turns?.[0].speaker).toBe('coach');
  });

  it('창작으로 판정된 교정본은 버리고 원문을 지킨다', async () => {
    const notes = [note(0, '그립이 강해요')];
    const repairer = vi.fn(async () =>
      JSON.stringify({
        fixes: [
          {
            i: 1,
            text: '그립이 강해요. 스트롱 그립은 손등이 위를 향하는 형태로, 훅이 나기 쉬우니 조금 위크하게 잡아 보겠습니다.',
          },
        ],
      })
    );

    const out = await repairTranscriptTerms(notes, '한윤슬', repairer);
    expect(out[0].transcript).toBe('그립이 강해요');
  });

  it('교정 호출이 실패해도 필기를 그대로 돌려준다', async () => {
    const notes = [note(0, '페이서가 열렸어요')];
    const repairer = vi.fn(async () => {
      throw new Error('network');
    });
    const out = await repairTranscriptTerms(notes, '한윤슬', repairer);
    expect(out).toBe(notes);
  });

  it('빈 필기에는 호출조차 하지 않는다', async () => {
    const repairer = vi.fn(async () => '{"fixes":[]}');
    const notes = [note(0, '   ')];
    expect(await repairTranscriptTerms(notes, '한윤슬', repairer)).toBe(notes);
    expect(repairer).not.toHaveBeenCalled();
  });

  it('시간이 다 되면 새 묶음을 열지 않고 지금까지의 교정을 반영한다', async () => {
    // 배치 크기(120줄)를 넘겨 묶음이 두 번 돌게 만든다.
    const notes = Array.from({ length: 130 }, (_, i) => note(i, `페이서 ${i}`));
    let calls = 0;
    const repairer = vi.fn(async () => {
      calls += 1;
      // 첫 묶음이 끝난 시점에 이미 시간이 지난 상황을 만든다.
      vi.setSystemTime(Date.now() + 60_000);
      return JSON.stringify({ fixes: [{ i: 1, text: '페이스 0' }] });
    });

    vi.useFakeTimers();
    try {
      const out = await repairTranscriptTerms(notes, '한윤슬', repairer, {
        deadlineAt: Date.now() + 10_000,
      });
      expect(calls).toBe(1);
      // 첫 묶음에서 받은 교정은 살아남는다.
      expect(out[0].transcript).toBe('페이스 0');
      expect(out[125].transcript).toBe('페이서 125');
    } finally {
      vi.useRealTimers();
    }
  });

  it('이 묶음에 없는 줄 번호는 무시한다', async () => {
    const notes = [note(0, '체중 이동이 늦어요')];
    const repairer = vi.fn(async () =>
      JSON.stringify({ fixes: [{ i: 99, text: '엉뚱한 줄 교정' }] })
    );
    const out = await repairTranscriptTerms(notes, '한윤슬', repairer);
    expect(out[0].transcript).toBe('체중 이동이 늦어요');
  });
});
