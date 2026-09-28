/**
 * 코치별 레슨 용어 사전.
 *
 * 지키는 계약:
 *  - 저장·프롬프트에 실리는 값은 언제나 정규화된다(줄바꿈·인용 기호 제거, 상한).
 *  - 검토 화면 수정에서 배우는 것은 **발음이 닮은 짧은 교체**뿐이다. 문장을
 *    새로 쓰거나 내용을 바꾼 편집을 배우면 다음 레슨의 멀쩡한 말이 망가진다.
 *  - 사전은 전사·대조·교정 프롬프트에 실린다.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';

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
  EMPTY_LESSON_VOCABULARY,
  MAX_VOCAB_TERMS,
  buildVocabularyPromptBlock,
  learnCorrectionsFromEdit,
  mergeCorrections,
  normalizeLessonVocabulary,
  parseTermsInput,
  pronunciationSimilarity,
} from '../services/lessonVocabulary';
import { normalizeLessonVocabulary as normalizeOnServer } from '../server/src/services/lessonVocabulary';
import {
  buildAudioTermVerifyPrompt,
  buildPreciseTranscribePrompt,
  buildTranscriptRepairPrompt,
  setActiveLessonVocabulary,
} from '../services/lessonAudioPipeline';

describe('normalizeLessonVocabulary', () => {
  it.each([
    ['client', normalizeLessonVocabulary],
    ['server', normalizeOnServer],
  ])('%s: 줄바꿈·인용 기호를 지우고 중복·빈 값·과도한 길이를 걸러 낸다', (_name, normalize) => {
    const out = normalize({
      terms: ['원 플레인', '원 플레인', '', '수건\n드릴', '"스택"', 'x'.repeat(41), 3],
      corrections: [
        { from: '원플레인', to: '원 플레인' },
        { from: '같음', to: '같음' },
        { from: '생크', to: '쌩크' },
        { from: '생크', to: '섕크' }, // 뒤의 것(최근 교정)이 이긴다
        { from: '', to: '무엇' },
        'garbage',
      ],
    });
    expect(out.terms).toEqual(['원 플레인', '수건 드릴', '스택']);
    expect(out.corrections).toEqual([
      { from: '원플레인', to: '원 플레인' },
      { from: '생크', to: '섕크' },
    ]);
  });

  it('용어 개수 상한을 지킨다', () => {
    const terms = Array.from({ length: MAX_VOCAB_TERMS + 20 }, (_, i) => `용어${i}`);
    expect(normalizeLessonVocabulary({ terms }).terms).toHaveLength(MAX_VOCAB_TERMS);
  });

  it('어떤 입력이 와도 빈 사전으로 떨어진다', () => {
    expect(normalizeLessonVocabulary(null)).toEqual(EMPTY_LESSON_VOCABULARY);
    expect(normalizeOnServer('문자열')).toEqual(EMPTY_LESSON_VOCABULARY);
  });
});

describe('parseTermsInput', () => {
  it('쉼표·줄바꿈으로 나눈다', () => {
    expect(parseTermsInput('원 플레인, 스택 앤 틸트\n수건 드릴,,')).toEqual([
      '원 플레인',
      '스택 앤 틸트',
      '수건 드릴',
    ]);
  });
});

describe('pronunciationSimilarity', () => {
  it('모음·받침 하나만 다른 오인식을 닮았다고 본다(자모 단위)', () => {
    expect(pronunciationSimilarity('생크', '섕크')).toBeGreaterThanOrEqual(0.75);
    expect(pronunciationSimilarity('페이서', '페이스')).toBeGreaterThanOrEqual(0.75);
    expect(pronunciationSimilarity('다운 불로', '다운블로')).toBeGreaterThanOrEqual(0.75);
  });
  it('뜻이 바뀐 말은 닮지 않았다고 본다 — 순서가 뒤집힌 용어 포함', () => {
    expect(pronunciationSimilarity('백스윙', '다운스윙')).toBeLessThan(0.75);
    expect(pronunciationSimilarity('왼팔을', '오른팔을')).toBeLessThan(0.75);
    expect(pronunciationSimilarity('인투아웃', '아웃투인')).toBeLessThan(0.75);
  });
});

describe('learnCorrectionsFromEdit', () => {
  it('발음이 닮은 짧은 교체를 배우고, 조사는 떼어 낸다', () => {
    const original = [
      '코치: 페이서가 열려서 공이 오른쪽으로 가요.',
      '학생: 네',
      '코치: 다운 불로로 눌러 치세요. 생크 조심하시고요.',
    ].join('\n');
    const edited = [
      '코치: 페이스가 열려서 공이 오른쪽으로 가요.',
      '학생: 네',
      '코치: 다운블로로 눌러 치세요. 섕크 조심하시고요.',
    ].join('\n');
    const learned = learnCorrectionsFromEdit(original, edited);
    expect(learned).toEqual(
      expect.arrayContaining([
        { from: '페이서', to: '페이스' },
        { from: '다운 불로', to: '다운블로' },
        { from: '생크', to: '섕크' },
      ])
    );
    expect(learned).toHaveLength(3);
  });

  it('내용을 바꾸거나 문장을 새로 쓴 편집은 배우지 않는다', () => {
    const original = '코치: 왼팔을 펴고 백스윙하세요.\n코치: 오늘은 여기까지 할게요.';
    const edited =
      '코치: 오른팔을 접고 백스윙하세요.\n코치: 다음 주에는 드라이버 위주로 연습하고 퍼팅도 조금 보겠습니다.';
    expect(learnCorrectionsFromEdit(original, edited)).toEqual([]);
  });

  it('띄어쓰기만 고친 편집과 화자 표기 변경은 배우지 않는다', () => {
    const original = '코치: 테이크 어웨이를 낮게 가져가세요.\n학생: 이렇게요?';
    const edited = '코치: 테이크어웨이를 낮게 가져가세요.\n코치: 이렇게요?';
    expect(learnCorrectionsFromEdit(original, edited)).toEqual([]);
  });

  it('줄이 추가·삭제돼도 나머지 줄의 교체를 찾는다', () => {
    const original = '코치: 어드레스 잡아 볼게요.\n코치: 얼리 익스텐선이 나와요.';
    const edited =
      '코치: 어드레스 잡아 볼게요.\n학생: (연습 스윙)\n코치: 얼리 익스텐션이 나와요.';
    // 추가된 줄과 바뀐 줄이 한 덩어리로 묶여도 짝을 잃지 않아야 한다.
    expect(learnCorrectionsFromEdit(original, edited)).toEqual([
      { from: '익스텐선', to: '익스텐션' },
    ]);
  });

  it('바뀐 게 없으면 빈 배열', () => {
    expect(learnCorrectionsFromEdit('코치: 좋아요', '코치: 좋아요')).toEqual([]);
  });
});

describe('mergeCorrections', () => {
  it('같은 from 은 최근 짝으로 바꾸고 용어는 그대로 둔다', () => {
    const merged = mergeCorrections(
      { terms: ['원 플레인'], corrections: [{ from: '생크', to: '쌩크' }] },
      [{ from: '생크', to: '섕크' }]
    );
    expect(merged).toEqual({
      terms: ['원 플레인'],
      corrections: [{ from: '생크', to: '섕크' }],
    });
  });
});

describe('buildVocabularyPromptBlock', () => {
  const vocab = {
    terms: ['원 플레인', '수건 드릴'],
    corrections: [{ from: '원플레인', to: '원 플레인' }],
  };

  it('빈 사전이면 아무것도 붙이지 않는다', () => {
    expect(buildVocabularyPromptBlock(EMPTY_LESSON_VOCABULARY, 'audio')).toBe('');
  });

  it('audio/text 모드는 용어와 교정 짝을, terms 모드는 용어만 싣는다', () => {
    const audio = buildVocabularyPromptBlock(vocab, 'audio');
    expect(audio).toContain('원 플레인, 수건 드릴');
    expect(audio).toContain('"원플레인" → "원 플레인"');
    expect(audio).toContain('들리는');
    expect(buildVocabularyPromptBlock(vocab, 'text')).toContain('적힌 곳은');
    const terms = buildVocabularyPromptBlock(vocab, 'terms');
    expect(terms).toContain('수건 드릴');
    expect(terms).not.toContain('→');
  });
});

describe('파이프라인 프롬프트에 코치 사전이 실린다', () => {
  afterEach(() => setActiveLessonVocabulary(EMPTY_LESSON_VOCABULARY));

  it('정밀 전사·오디오 대조·텍스트 교정 모두 사전을 싣는다', () => {
    setActiveLessonVocabulary({
      terms: ['수건 드릴'],
      corrections: [{ from: '수권 드릴', to: '수건 드릴' }],
    });
    const precise = buildPreciseTranscribePrompt({
      studentName: '김회원',
      startSec: 0,
      durationSec: 300,
    });
    const verify = buildAudioTermVerifyPrompt([{ speaker: 'coach', text: '수권 드릴 해요' }], {
      studentName: '김회원',
      startSec: 0,
      durationSec: 300,
    });
    const repair = buildTranscriptRepairPrompt([{ id: 1, text: '수권 드릴 해요' }], '김회원');
    for (const prompt of [precise, verify, repair]) {
      expect(prompt).toContain('수건 드릴');
      expect(prompt).toContain('"수권 드릴" → "수건 드릴"');
    }
  });

  it('사전이 비어 있으면 프롬프트에 사전 블록이 없다', () => {
    const prompt = buildPreciseTranscribePrompt({
      studentName: '김회원',
      startSec: 0,
      durationSec: 300,
    });
    expect(prompt).not.toContain('이 코치가 등록한 전용 용어');
  });
});
