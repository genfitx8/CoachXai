/**
 * 화자 역할 라벨링(1단계)의 단위 테스트.
 *
 * 이 단계는 성문 대조가 아니라 **역할 추론**이다 — 검증할 것은 "코치
 * 목소리를 맞혔는가"가 아니라, 라벨이 붙었을 때 파이프라인이 그 라벨을
 * 잃지 않고 끝까지(전사 → 문단 → 요약 프롬프트) 나르는가, 그리고 라벨이
 * 없거나 깨졌을 때 기존 필기 경로가 그대로 살아남는가이다.
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
  buildMergePrompt,
  buildSpeakerLabelPrompt,
  buildTranscribePrompt,
  buildTranscriptText,
  groupTranscriptParagraphs,
  joinTranscriptTurns,
  labelTranscriptSpeakers,
  normalizeSpeakerRole,
  parseSpeakerLabelResponse,
  parseTranscriptResponse,
  parseTranscriptTurns,
  trimTurnsOverlap,
  type LessonSegmentNote,
  type TranscriptTurn,
} from '../services/lessonAudioPipeline';

const turn = (speaker: TranscriptTurn['speaker'], text: string): TranscriptTurn => ({
  speaker,
  text,
});

describe('normalizeSpeakerRole', () => {
  it('알려진 역할을 그대로 통과시킨다', () => {
    expect(normalizeSpeakerRole('coach')).toBe('coach');
    expect(normalizeSpeakerRole('STUDENT')).toBe('student');
    expect(normalizeSpeakerRole(' other ')).toBe('other');
  });

  it('한국어 라벨과 동의어를 흡수한다', () => {
    expect(normalizeSpeakerRole('코치')).toBe('coach');
    expect(normalizeSpeakerRole('회원')).toBe('student');
    expect(normalizeSpeakerRole('주변')).toBe('other');
  });

  it('모르는 값은 지어내지 않고 unknown 으로 떨어뜨린다', () => {
    expect(normalizeSpeakerRole('화자A')).toBe('unknown');
    expect(normalizeSpeakerRole(undefined)).toBe('unknown');
    expect(normalizeSpeakerRole(3)).toBe('unknown');
  });
});

describe('parseTranscriptTurns', () => {
  it('turns 응답을 역할별 발화로 읽는다', () => {
    expect(
      parseTranscriptTurns(
        '{"turns":[{"speaker":"coach","text":"어깨를 더 돌리세요"},{"speaker":"student","text":"이렇게요?"}]}'
      )
    ).toEqual([turn('coach', '어깨를 더 돌리세요'), turn('student', '이렇게요?')]);
  });

  it('제3자 발화도 버리지 않고 other 로 남긴다', () => {
    // 지우면 코치가 "무엇이 걸러졌는지" 확인할 수 없다 — 표시만 하고
    // 요약 프롬프트에서 배제한다.
    const turns = parseTranscriptTurns(
      '{"turns":[{"speaker":"other","text":"야 여기 자리 있어?"}]}'
    );
    expect(turns).toEqual([turn('other', '야 여기 자리 있어?')]);
  });

  it('구버전 {"text"} 응답은 화자 미상 발화 하나로 받는다', () => {
    expect(parseTranscriptTurns('{"text":"백스윙에서 힘 빼세요."}')).toEqual([
      turn('unknown', '백스윙에서 힘 빼세요.'),
    ]);
  });

  it('평문 응답도 필기로 살린다 — 라벨 실패가 필기 유실이 되면 안 된다', () => {
    expect(parseTranscriptTurns('그립을 짧게 잡아볼게요.')).toEqual([
      turn('unknown', '그립을 짧게 잡아볼게요.'),
    ]);
  });

  it('무음 구간은 빈 목록이다', () => {
    expect(parseTranscriptTurns('{"turns":[]}')).toEqual([]);
    expect(parseTranscriptTurns('{"text":""}')).toEqual([]);
    expect(parseTranscriptTurns('(대화 없음)')).toEqual([]);
  });

  it('speaker 가 빠지거나 이상해도 텍스트는 살린다', () => {
    expect(parseTranscriptTurns('{"turns":[{"speaker":"화자B","text":"네"}]}')).toEqual([
      turn('unknown', '네'),
    ]);
  });

  it('parseTranscriptResponse 는 turns 를 한 줄 전사로 잇는다', () => {
    expect(
      parseTranscriptResponse(
        '{"turns":[{"speaker":"coach","text":"어깨를 더 돌리세요"},{"speaker":"student","text":"네"}]}'
      )
    ).toBe('어깨를 더 돌리세요 네');
  });
});

describe('trimTurnsOverlap', () => {
  it('머리에 겹친 발화만 잘라내고 뒤 발화는 그대로 둔다', () => {
    const next = [
      turn('coach', '어깨를 더 돌리세요'),
      turn('student', '이렇게요?'),
    ];
    expect(trimTurnsOverlap('오늘은 어깨를 더 돌리세요', next)).toEqual([
      turn('student', '이렇게요?'),
    ]);
  });

  it('겹치지 않으면 손대지 않는다', () => {
    const next = [turn('coach', '체중을 앞발로')];
    expect(trimTurnsOverlap('어깨를 더 돌리세요', next)).toEqual(next);
  });

  it('직전 구간이 없으면 그대로 통과시킨다', () => {
    const next = [turn('coach', '시작할게요')];
    expect(trimTurnsOverlap('', next)).toEqual(next);
  });

  it('꼬리-머리 부분 겹침은 겹친 머리만 잘라낸다', () => {
    expect(
      trimTurnsOverlap('오늘은 드라이버 슬라이스를', [
        turn('coach', '슬라이스를 교정하는 레슨입니다'),
        turn('student', '네'),
      ])
    ).toEqual([turn('coach', '교정하는 레슨입니다'), turn('student', '네')]);
  });

  it('joinTranscriptTurns 는 잘라낸 결과와 전사를 일치시킨다', () => {
    const turns = trimTurnsOverlap('어깨를 더 돌리세요', [
      turn('coach', '어깨를 더 돌리세요'),
      turn('student', '이렇게요?'),
    ]);
    expect(joinTranscriptTurns(turns)).toBe('이렇게요?');
  });
});

describe('groupTranscriptParagraphs (화자 전환)', () => {
  const note = (index: number, atSec: number, turns: TranscriptTurn[]) => ({
    index,
    startSec: atSec,
    transcript: joinTranscriptTurns(turns),
    turns,
  });

  it('한 노트 안에서 화자가 바뀌면 문단을 끊는다', () => {
    const paragraphs = groupTranscriptParagraphs([
      note(0, 0, [turn('coach', '어깨를 더 돌리세요'), turn('student', '이렇게요?')]),
    ]);
    expect(paragraphs.map((p) => p.speaker)).toEqual(['coach', 'student']);
    expect(paragraphs.map((p) => p.key)).toEqual(['0:0', '0:1']);
  });

  it('같은 화자가 이어지면 시간 간격 안에서는 한 문단으로 흐른다', () => {
    const paragraphs = groupTranscriptParagraphs([
      note(0, 0, [turn('coach', '어깨를')]),
      note(1, 5, [turn('coach', '더 돌리세요')]),
    ]);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].segments.map((s) => s.text)).toEqual(['어깨를', '더 돌리세요']);
  });

  it('같은 화자여도 시간이 크게 벌어지면 문단을 끊는다', () => {
    const paragraphs = groupTranscriptParagraphs([
      note(0, 0, [turn('coach', '어깨를 더 돌리세요')]),
      note(1, 60, [turn('coach', '이번엔 7번 아이언')]),
    ]);
    expect(paragraphs).toHaveLength(2);
  });

  it('라벨이 없는 노트는 예전처럼 화자 미상으로 묶인다', () => {
    const paragraphs = groupTranscriptParagraphs([
      { index: 0, startSec: 0, transcript: '어깨를 더 돌리세요' },
    ]);
    expect(paragraphs[0].speaker).toBe('unknown');
    expect(paragraphs[0].segments[0].key).toBe('0:0');
  });
});

describe('buildTranscriptText (화자 표기)', () => {
  it('판정된 화자에만 라벨을 붙인다', () => {
    const text = buildTranscriptText([
      {
        index: 0,
        startSec: 0,
        transcript: '어깨를 더 돌리세요 이렇게요?',
        turns: [turn('coach', '어깨를 더 돌리세요'), turn('student', '이렇게요?')],
      },
    ]);
    expect(text).toBe('코치: 어깨를 더 돌리세요\n학생: 이렇게요?');
  });

  it('라벨이 없으면 예전 그대로 라벨 없이 적는다', () => {
    expect(
      buildTranscriptText([{ index: 0, startSec: 0, transcript: '어깨를 더 돌리세요' }])
    ).toBe('어깨를 더 돌리세요');
  });

  it('주변 발화는 "주변" 으로 표기해 무엇이 걸러질지 보이게 한다', () => {
    const text = buildTranscriptText([
      {
        index: 0,
        startSec: 0,
        transcript: '야 자리 있어?',
        turns: [turn('other', '야 자리 있어?')],
      },
    ]);
    expect(text).toBe('주변: 야 자리 있어?');
  });
});

describe('buildTranscribePrompt (화자 분리 지시)', () => {
  it('세 역할과 turns 형식을 지시한다', () => {
    const prompt = buildTranscribePrompt({
      studentName: '한윤슬',
      index: 0,
      startSec: 0,
      durationSec: 10,
      previousKeyPoints: [],
    });
    expect(prompt).toContain('"coach"');
    expect(prompt).toContain('"student"');
    expect(prompt).toContain('"other"');
    expect(prompt).toContain('한윤슬');
    expect(prompt).toContain('요약하지 마세요');
  });

  it('직전 발화가 있으면 화자 판단 참고용으로만 싣는다', () => {
    const prompt = buildTranscribePrompt({
      studentName: '한윤슬',
      index: 1,
      startSec: 10,
      durationSec: 10,
      previousKeyPoints: [],
      previousTurns: [turn('coach', '어깨를 더 돌리세요')],
    });
    expect(prompt).toContain('코치: 어깨를 더 돌리세요');
    expect(prompt).toContain('다시 적지 마세요');
  });

  it('첫 구간에는 직전 발화 블록이 없다', () => {
    const prompt = buildTranscribePrompt({
      studentName: '한윤슬',
      index: 0,
      startSec: 0,
      durationSec: 10,
      previousKeyPoints: [],
    });
    expect(prompt).not.toContain('직전 구간의 마지막 발화');
  });
});

describe('parseSpeakerLabelResponse', () => {
  it('줄 번호 → 역할 맵으로 읽는다', () => {
    const map = parseSpeakerLabelResponse(
      '{"labels":[{"i":0,"speaker":"coach"},{"i":1,"speaker":"student"}]}'
    );
    expect(map.get(0)).toBe('coach');
    expect(map.get(1)).toBe('student');
  });

  it('판정 못 한 줄(unknown)은 기록하지 않는다', () => {
    const map = parseSpeakerLabelResponse('{"labels":[{"i":0,"speaker":"???"}]}');
    expect(map.has(0)).toBe(false);
  });

  it('깨진 응답은 빈 맵 — 필기는 라벨 없이 살아남는다', () => {
    expect(parseSpeakerLabelResponse('그냥 텍스트').size).toBe(0);
    expect(parseSpeakerLabelResponse('{"labels": 그러니까}').size).toBe(0);
  });
});

describe('labelTranscriptSpeakers', () => {
  const speechNote = (index: number, text: string): LessonSegmentNote => ({
    index,
    startSec: index * 5,
    durationSec: 0,
    status: 'done',
    transcript: text,
    keyPoints: [],
    drills: [],
    metrics: [],
    studentState: '',
  });

  it('라벨 없는 필기에 역할을 배정한다', async () => {
    const labeler = vi.fn(
      async () => '{"labels":[{"i":0,"speaker":"coach"},{"i":1,"speaker":"student"}]}'
    );
    const out = await labelTranscriptSpeakers(
      [speechNote(0, '어깨를 더 돌리세요'), speechNote(1, '이렇게요?')],
      '한윤슬',
      labeler
    );
    expect(out[0].turns).toEqual([turn('coach', '어깨를 더 돌리세요')]);
    expect(out[1].turns).toEqual([turn('student', '이렇게요?')]);
    // 전사 텍스트는 건드리지 않는다.
    expect(out[0].transcript).toBe('어깨를 더 돌리세요');
  });

  it('이미 라벨이 있는 노트(오디오 전사 경로)는 건드리지 않는다', async () => {
    const audioNote: LessonSegmentNote = {
      ...speechNote(0, '어깨를 더 돌리세요'),
      turns: [turn('coach', '어깨를 더 돌리세요')],
    };
    const labeler = vi.fn(async () => '{"labels":[{"i":0,"speaker":"student"}]}');
    const out = await labelTranscriptSpeakers([audioNote], '한윤슬', labeler);
    expect(labeler).not.toHaveBeenCalled();
    expect(out[0].turns).toEqual([turn('coach', '어깨를 더 돌리세요')]);
  });

  it('호출이 실패해도 원본 노트를 그대로 돌려준다', async () => {
    const notes = [speechNote(0, '어깨를 더 돌리세요')];
    const out = await labelTranscriptSpeakers(notes, '한윤슬', async () => {
      throw new Error('network');
    });
    expect(out).toBe(notes);
  });

  it('라벨을 못 받은 줄은 라벨 없이 남는다', async () => {
    const out = await labelTranscriptSpeakers(
      [speechNote(0, '어깨를 더 돌리세요'), speechNote(1, '음…')],
      '한윤슬',
      async () => '{"labels":[{"i":0,"speaker":"coach"}]}'
    );
    expect(out[0].turns).toHaveLength(1);
    expect(out[1].turns).toBeUndefined();
  });

  it('빈 필기만 있으면 호출조차 하지 않는다', async () => {
    const labeler = vi.fn(async () => '{"labels":[]}');
    const notes = [speechNote(0, '   ')];
    expect(await labelTranscriptSpeakers(notes, '한윤슬', labeler)).toBe(notes);
    expect(labeler).not.toHaveBeenCalled();
  });
});

describe('buildSpeakerLabelPrompt', () => {
  it('줄 번호를 붙여 싣고 라벨만 요구한다', () => {
    const prompt = buildSpeakerLabelPrompt(
      [
        { index: 3, text: '어깨를 더 돌리세요' },
        { index: 4, text: '이렇게요?' },
      ],
      '한윤슬'
    );
    expect(prompt).toContain('3. 어깨를 더 돌리세요');
    expect(prompt).toContain('4. 이렇게요?');
    expect(prompt).toContain('한윤슬');
    expect(prompt).toContain('라벨만 반환합니다');
  });

  it('직전 묶음 문맥이 있으면 참고용으로만 싣는다', () => {
    const prompt = buildSpeakerLabelPrompt(
      [{ index: 5, text: '네' }],
      '한윤슬',
      [turn('coach', '어깨를 더 돌리세요')]
    );
    expect(prompt).toContain('다시 라벨링하지 마세요');
    expect(prompt).toContain('코치: 어깨를 더 돌리세요');
  });
});

describe('buildMergePrompt (화자 기반 요약 규칙)', () => {
  const labeledNote = (index: number, turns: TranscriptTurn[]): LessonSegmentNote => ({
    index,
    startSec: index * 10,
    durationSec: 10,
    status: 'done',
    transcript: joinTranscriptTurns(turns),
    turns,
    keyPoints: [],
    drills: [],
    metrics: [],
    studentState: '',
  });

  it('발화를 화자 라벨과 함께 펼친다', () => {
    const prompt = buildMergePrompt(
      [labeledNote(0, [turn('coach', '어깨를 더 돌리세요'), turn('student', '이렇게요?')])],
      ''
    );
    expect(prompt).toContain('코치: 어깨를 더 돌리세요');
    expect(prompt).toContain('학생: 이렇게요?');
  });

  it('코치 발화만 지시 근거로 쓰고 주변 발화는 배제하라고 지시한다', () => {
    const prompt = buildMergePrompt([labeledNote(0, [turn('coach', '어깨')])], '');
    expect(prompt).toContain('코치 발화에서만');
    expect(prompt).toContain('반영하지 마세요');
    // 라벨이 틀릴 수 있다는 사실을 모델에게 숨기지 않는다.
    expect(prompt).toContain('틀릴 수 있습니다');
  });

  it('라벨이 없는 노트는 예전 한 줄 형식을 유지한다', () => {
    const plain: LessonSegmentNote = {
      ...labeledNote(0, []),
      transcript: '어깨를 더 돌리세요',
      turns: undefined,
    };
    const prompt = buildMergePrompt([plain], '');
    expect(prompt).toContain('[0:00–0:10] 어깨를 더 돌리세요');
  });
});

describe('필기 보존 (라벨이 깨져도 글자를 잃지 않는다)', () => {
  it('turns 가 전부 공백이면 전사를 화자 미상으로 그린다', () => {
    const paragraphs = groupTranscriptParagraphs([
      {
        index: 0,
        startSec: 0,
        transcript: '어깨를 더 돌리세요',
        turns: [turn('coach', '   ')],
      },
    ]);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].speaker).toBe('unknown');
    expect(paragraphs[0].segments[0].text).toBe('어깨를 더 돌리세요');
  });
});
