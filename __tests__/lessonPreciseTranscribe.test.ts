/**
 * 정밀 전사 패스 — 레슨 기록의 정확도를 결정하는 두 번째 받아쓰기.
 *
 * 실시간 필기는 짧은 구간을 따로따로 전사해 빠른 대신 경계에서 문장이
 * 잘리고 앞뒤 맥락이 없다. 검토 단계에서는 기다릴 여유가 있으므로 같은
 * 녹음을 5분짜리 조각으로 다시 들려 준다. 이 테스트가 지키는 계약:
 *  - 조각은 **그 자체로 디코딩되는** 파일이어야 한다(런 헤더로 시작).
 *  - 일부 조각이 실패해도 그 구간 실시간 필기를 잃지 않는다.
 *  - 전부 실패하면 null — 호출부가 실시간 필기를 그대로 쓴다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  LessonAudioSession,
  applyTurnFixes,
  bigramContainment,
  buildAudioTermVerifyPrompt,
  mergeSliceBoundary,
  buildPreciseTranscribePrompt,
  preciseTranscribeNotes,
  type LessonSegmentNote,
  type TranscriptionSlice,
} from '../services/lessonAudioPipeline';

const HEADER = [1, 2, 3];
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];

class FakeMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: ((e?: unknown) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private n = 0;
  constructor(public stream: unknown, public opts: unknown) {}
  private emit() {
    const bytes =
      this.n === 0
        ? new Uint8Array([...HEADER, ...CLUSTER, 0])
        : new Uint8Array([...CLUSTER, this.n]);
    this.n += 1;
    this.ondataavailable?.({ data: new Blob([bytes]) });
  }
  start(timeslice?: number) {
    this.state = 'recording';
    if (timeslice) this.timer = setInterval(() => this.emit(), timeslice);
  }
  stop() {
    if (this.state === 'inactive') return;
    if (this.timer) clearInterval(this.timer);
    this.state = 'inactive';
    this.onstop?.();
  }
  pause() {
    this.state = 'paused';
    if (this.timer) clearInterval(this.timer);
  }
  resume() {
    this.state = 'recording';
  }
}

const bytesOf = async (blob: Blob) => [...new Uint8Array(await blob.arrayBuffer())];

const note = (index: number, startSec: number, transcript: string): LessonSegmentNote => ({
  index,
  startSec,
  durationSec: 10,
  status: 'done',
  transcript,
  keyPoints: [],
  drills: [],
  metrics: [],
  studentState: '',
});

describe('getTranscriptionSlices', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('조각마다 런 헤더를 붙여 그 자체로 디코딩되게 만든다', async () => {
    const session = new LessonAudioSession({
      studentName: '테스트',
      segmentTargetSec: 10,
      analyzer: async (_b, _m, ctx) => note(ctx.index, ctx.startSec, `전사 ${ctx.index}`),
      rollingSummarizer: async () => '- 요약',
    });
    await session.start({} as MediaStream);
    for (let i = 0; i < 45; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);

    // 10초 청크 4개를 20초(=2청크)짜리 조각으로 나눈다.
    const slices = await session.getTranscriptionSlices(20, 0);
    expect(slices.length).toBeGreaterThanOrEqual(2);

    // 런의 첫 조각은 헤더를 이미 품고 있다 — 덧붙이면 헤더가 두 번 온다.
    expect(await bytesOf(slices[0].blob)).toEqual([
      ...HEADER, ...CLUSTER, 0, ...CLUSTER, 1,
    ]);
    // 이후 조각은 헤더가 앞에 붙어 독립 디코딩이 된다.
    expect(await bytesOf(slices[1].blob)).toEqual([
      ...HEADER, ...CLUSTER, 2, ...CLUSTER, 3,
    ]);
    expect(slices[1].startSec).toBe(20);

    await session.discard();
  });

  it('뒤 조각 앞에 앞 조각 꼬리를 겹쳐 붙여 경계 문장을 온전히 듣게 한다', async () => {
    const session = new LessonAudioSession({
      studentName: '테스트',
      segmentTargetSec: 10,
      analyzer: async (_b, _m, ctx) => note(ctx.index, ctx.startSec, `전사 ${ctx.index}`),
      rollingSummarizer: async () => '- 요약',
    });
    await session.start({} as MediaStream);
    for (let i = 0; i < 45; i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);

    // 20초 조각 + 10초 겹침 → 뒤 조각은 앞 조각 마지막 청크(1)부터 시작한다.
    const slices = await session.getTranscriptionSlices(20, 10);
    expect(slices[0].leadSec).toBeUndefined();
    expect(await bytesOf(slices[1].blob)).toEqual([
      ...HEADER, ...CLUSTER, 1, ...CLUSTER, 2, ...CLUSTER, 3,
    ]);
    // 책임 구간은 그대로다 — 겹침은 leadSec 으로만 표시된다.
    expect(slices[1].startSec).toBe(20);
    expect(slices[1].leadSec).toBe(10);

    await session.discard();
  });
});

describe('preciseTranscribeNotes', () => {
  const slices: TranscriptionSlice[] = [
    { blob: new Blob(['a']), startSec: 0, durationSec: 300 },
    { blob: new Blob(['b']), startSec: 300, durationSec: 300 },
  ];
  const liveNotes = [
    note(0, 10, '실시간 앞구간'),
    note(1, 310, '실시간 뒷구간'),
  ];

  it('정밀 전사 결과로 필기를 다시 만들고 화자를 함께 싣는다', async () => {
    const out = await preciseTranscribeNotes(
      slices,
      liveNotes,
      '김회원',
      'audio/webm',
      async (slice) => [
        { speaker: 'coach', text: `코치 ${slice.startSec}` },
        { speaker: 'student', text: `학생 ${slice.startSec}` },
      ]
    );

    expect(out).not.toBeNull();
    expect(out!.map((n) => n.index)).toEqual([0, 1]);
    expect(out!.map((n) => n.startSec)).toEqual([0, 300]);
    expect(out![0].transcript).toContain('코치 0');
    expect(out![0].turns?.map((t) => t.speaker)).toEqual(['coach', 'student']);
  });

  it('실패한 조각의 구간은 실시간 필기를 그대로 남긴다', async () => {
    const out = await preciseTranscribeNotes(
      slices,
      liveNotes,
      '김회원',
      'audio/webm',
      async (slice) => {
        if (slice.startSec === 0) throw new Error('전사 실패');
        return [{ speaker: 'coach', text: '뒷구간 정밀' }];
      }
    );

    expect(out!.map((n) => n.transcript)).toEqual(['실시간 앞구간', '뒷구간 정밀']);
  });

  it('전부 실패하면 null — 호출부가 실시간 필기를 그대로 쓴다', async () => {
    const out = await preciseTranscribeNotes(
      slices,
      liveNotes,
      '김회원',
      'audio/webm',
      async () => {
        throw new Error('전사 실패');
      }
    );
    expect(out).toBeNull();
  });
});

describe('buildPreciseTranscribePrompt', () => {
  it('골프 코칭 어휘와 구간·학생 이름을 프롬프트에 싣는다', () => {
    const prompt = buildPreciseTranscribePrompt({
      studentName: '김회원',
      startSec: 0,
      durationSec: 300,
    });
    expect(prompt).toContain('김회원');
    expect(prompt).toContain('0:00–5:00');
    expect(prompt).toContain('얼리 익스텐션'); // 코칭 어휘 힌트
    expect(prompt).toContain('지어내지 마세요');
  });
});

describe('오디오 대조 교정 (두 번째 듣기)', () => {
  const slices: TranscriptionSlice[] = [
    { blob: new Blob(['a']), startSec: 0, durationSec: 300 },
    { blob: new Blob(['b']), startSec: 300, durationSec: 300 },
  ];
  const liveNotes = [note(0, 10, '실시간 앞구간'), note(1, 310, '실시간 뒷구간')];

  it('초안을 같은 오디오와 대조해 잘못 들은 골프 용어를 고친다', async () => {
    const verifier = vi.fn(async () => new Map([[1, '페이스가 열려서 섕크가 났어요']]));
    const out = await preciseTranscribeNotes(
      slices.slice(0, 1),
      liveNotes,
      '김회원',
      'audio/webm',
      async () => [
        { speaker: 'coach', text: '페이서가 열려서 생크가 났어요' },
        { speaker: 'student', text: '네' },
      ],
      { verifier }
    );
    expect(verifier).toHaveBeenCalledTimes(1);
    expect(out![0].turns?.map((t) => t.text)).toEqual(['페이스가 열려서 섕크가 났어요', '네']);
    // transcript 는 turns 를 이어 붙인 결과여야 한다.
    expect(out![0].transcript).toContain('페이스가 열려서 섕크가 났어요');
    // 화자는 교정이 건드리지 않는다.
    expect(out![0].turns?.map((t) => t.speaker)).toEqual(['coach', 'student']);
  });

  it('대조 교정이 실패하면 그 조각은 전사 초안을 쓴다', async () => {
    const out = await preciseTranscribeNotes(
      slices.slice(0, 1),
      liveNotes,
      '김회원',
      'audio/webm',
      async () => [{ speaker: 'coach', text: '다운 불로로 치세요' }],
      {
        verifier: async () => {
          throw new Error('대조 실패');
        },
      }
    );
    expect(out![0].transcript).toContain('다운 불로로 치세요');
  });

  it('창작으로 번진 교정은 버린다', () => {
    const turns = [{ speaker: 'coach' as const, text: '체중 이동을 먼저 하고 골반을 돌리세요' }];
    const out = applyTurnFixes(
      turns,
      new Map([[1, '오늘 레슨은 여기까지 하고 다음 주에는 드라이버 연습을 해 봅시다']])
    );
    expect(out[0].text).toBe('체중 이동을 먼저 하고 골반을 돌리세요');
  });

  it('시간이 다 되면 끝난 조각만 정밀본으로 쓰고 나머지는 실시간 필기로 메운다', async () => {
    let calls = 0;
    const out = await preciseTranscribeNotes(
      slices,
      liveNotes,
      '김회원',
      'audio/webm',
      async (slice) => {
        calls += 1;
        if (slice.startSec === 0) return [{ speaker: 'coach', text: '앞구간 정밀' }];
        // 뒷조각은 멎어 버린 호출 — 마감이 지나도 끝나지 않는다.
        return new Promise(() => {});
      },
      { deadlineAt: Date.now() + 30, concurrency: 2 }
    );
    expect(calls).toBe(2);
    expect(out).toHaveLength(2);
    expect(out![0].transcript).toContain('앞구간 정밀');
    expect(out![1].transcript).toBe('실시간 뒷구간');
  });

  it('대조 프롬프트는 초안 줄 번호·코칭 어휘·오인식 예시·확인 원칙을 싣는다', () => {
    const prompt = buildAudioTermVerifyPrompt(
      [
        { speaker: 'coach', text: '페이서가 열렸어요' },
        { speaker: 'student', text: '네' },
      ],
      { studentName: '김회원', startSec: 300, durationSec: 300 }
    );
    expect(prompt).toContain('김회원');
    expect(prompt).toContain('5:00–10:00');
    expect(prompt).toContain('1. 페이서가 열렸어요');
    expect(prompt).toContain('2. 네');
    expect(prompt).toContain('얼리 익스텐션');
    expect(prompt).toContain('다운블로');
    expect(prompt).toContain('실제로 그렇게 들리는 경우에만');
  });
});

describe('조각 경계 병합 (겹침 꼬리 정리)', () => {
  const c = (text: string) => ({ speaker: 'coach' as const, text });
  const st = (text: string) => ({ speaker: 'student' as const, text });

  it('앞 조각의 잘린 문장은 걷어 내고 뒤 조각의 온전한 문장을 남긴다', () => {
    const { prev, next } = mergeSliceBoundary(
      [c('어드레스에서 무게는 발 앞쪽에 두세요'), st('네'), c('백스윙 탑에서 왼팔을 쭉')],
      [c('백스윙 탑에서 왼팔을 쭉 펴고 코킹을 유지하세요'), st('이렇게요?'), c('네 좋아요')]
    );
    expect(prev.map((t) => t.text)).toEqual(['어드레스에서 무게는 발 앞쪽에 두세요', '네']);
    expect(next.map((t) => t.text)).toEqual([
      '백스윙 탑에서 왼팔을 쭉 펴고 코킹을 유지하세요',
      '이렇게요?',
      '네 좋아요',
    ]);
  });

  it('뒤 조각이 다시 적은 앞 조각의 온전한 발화는 뒤 조각 쪽에서 지운다', () => {
    const { prev, next } = mergeSliceBoundary(
      [c('체중 이동을 먼저 하고 골반을 돌리세요'), st('네 알겠습니다')],
      [
        st('알겠습니다'),
        c('자 이제 드라이버로 바꿔서 쳐 볼게요'),
      ]
    );
    // 앞 조각의 "네 알겠습니다"는 뒤 조각 머리의 "알겠습니다"보다 길어
    // 온전한 쪽이다 — 그대로 남고, 뒤 조각 머리의 반쪽이 지워진다.
    expect(prev.map((t) => t.text)).toEqual(['체중 이동을 먼저 하고 골반을 돌리세요', '네 알겠습니다']);
    expect(next.map((t) => t.text)).toEqual(['자 이제 드라이버로 바꿔서 쳐 볼게요']);
  });

  it('겹치지 않는 대화는 건드리지 않는다', () => {
    const prevTurns = [c('그립을 조금 더 스트롱하게 잡아 보세요'), st('네')];
    const nextTurns = [c('이번에는 하프 스윙으로 스무 개 쳐 봅시다'), st('알겠습니다')];
    const { prev, next } = mergeSliceBoundary(prevTurns, nextTurns);
    expect(prev).toEqual(prevTurns);
    expect(next).toEqual(nextTurns);
  });

  it('짧은 맞장구는 완전히 같은 발화가 있을 때만 중복으로 본다', () => {
    const { prev } = mergeSliceBoundary(
      [c('헤드업 하지 마세요'), st('네')],
      [c('네 번째 공은 페이드로 쳐 보세요')]
    );
    expect(prev.map((t) => t.text)).toEqual(['헤드업 하지 마세요', '네']);
  });

  it('bigramContainment 는 잘린 반쪽이 온전한 문장에 담겼는지 본다', () => {
    expect(bigramContainment('왼팔을 쭉', '백스윙 탑에서 왼팔을 쭉 펴고')).toBe(1);
    expect(bigramContainment('드라이버로 바꿔요', '백스윙 탑에서 왼팔을 쭉 펴고')).toBe(0);
  });

  it('preciseTranscribeNotes 는 겹친 경계를 정리해 한 번만 남긴다', async () => {
    const out = await preciseTranscribeNotes(
      [
        { blob: new Blob(['a']), startSec: 0, durationSec: 300 },
        { blob: new Blob(['b']), startSec: 300, durationSec: 300, leadSec: 16 },
      ],
      [],
      '김회원',
      'audio/webm',
      async (slice) =>
        slice.startSec === 0
          ? [c('그립을 스트롱하게 잡고'), c('테이크어웨이는 낮고 길게')]
          : [c('테이크어웨이는 낮고 길게 가져가세요'), st('네')]
    );
    const all = out!.flatMap((n) => n.turns ?? []).map((t) => t.text);
    expect(all).toEqual(['그립을 스트롱하게 잡고', '테이크어웨이는 낮고 길게 가져가세요', '네']);
  });

  it('앞 조각이 실패하면 실시간 필기와 겹치는 뒤 조각 머리를 지운다', async () => {
    const out = await preciseTranscribeNotes(
      [
        { blob: new Blob(['a']), startSec: 0, durationSec: 300 },
        { blob: new Blob(['b']), startSec: 300, durationSec: 300, leadSec: 16 },
      ],
      [note(0, 290, '다운스윙에서 하체를 먼저 리드하세요')],
      '김회원',
      'audio/webm',
      async (slice) => {
        if (slice.startSec === 0) throw new Error('전사 실패');
        return [c('다운스윙에서 하체를 먼저 리드하세요'), c('이제 7번 아이언으로 쳐 볼게요')];
      }
    );
    expect(out!.map((n) => n.transcript)).toEqual([
      '다운스윙에서 하체를 먼저 리드하세요',
      expect.stringContaining('이제 7번 아이언으로 쳐 볼게요'),
    ]);
    expect(out![1].transcript).not.toContain('하체를 먼저');
  });

  it('겹침 꼬리가 있으면 프롬프트가 실제 오디오 구간과 겹침 안내를 싣는다', () => {
    const prompt = buildPreciseTranscribePrompt({
      studentName: '김회원',
      startSec: 300,
      durationSec: 300,
      leadSec: 16,
    });
    expect(prompt).toContain('4:44–10:00');
    expect(prompt).toContain('16초');
  });
});
