/**
 * 레슨 필기 정확도 평가 — 실제 레슨 녹음으로 파이프라인 단계별 정확도를 잰다.
 *
 * 실행
 *   GEMINI_API_KEY=... npm run eval:transcription
 *   GEMINI_API_KEY=... EVAL_CASE=lesson01 npm run eval:transcription   # 한 케이스만
 *
 * 케이스 준비 — evals/transcription/cases/<이름>/
 *   audio.(webm|m4a|mp4|mp3|wav|ogg)  레슨 녹음 3~10분 발췌(20MB 이하)
 *   reference.txt                      사람이 손으로 받아 적은 정답 필기
 *   meta.json (선택)                   {"studentName", "durationSec", "vocabulary", "extraTerms"}
 * cases/ 는 커밋되지 않는다(.gitignore) — 회원 녹음은 개인정보다.
 *
 * 단계(앞 단계 결과 위에 다음 단계를 쌓는다)
 *   1. 정밀 전사          lesson_audio_precise_transcribe
 *   2. + 오디오 대조 교정  lesson_audio_term_verify
 *   3. + 최종 텍스트 교정  lesson_transcript_final_repair
 * 각 단계에서 CER(문자 오류율, 낮을수록 좋음)과 골프 용어 재현율(높을수록
 * 좋음)을 잰다. meta.vocabulary 가 있으면 코치 사전을 켠 채로 돈다.
 *
 * 모델은 서버와 같은 라우팅(server/src/services/modelRouter)을 쓰므로,
 * `MODEL_ROUTING_OVERRIDES='{"lesson_audio_term_verify":"gemini-3.6-flash"}'`
 * 처럼 바꿔 모델별 정확도·비용을 비교할 수 있다.
 *
 * 결과는 evals/runs/<시각>-transcription.md 에 저장된다(역시 커밋 안 됨).
 */
import { describe, it, vi } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

vi.mock('../../services/promptService', () => ({
  promptService: { getActiveSystemPrompt: vi.fn(async () => '') },
}));
vi.mock('../../services/firebase', () => ({
  firebaseService: { isInitialized: () => false },
}));
vi.mock('../../services/geminiService', () => ({
  // 서버 게이트웨이를 거치지 않고 Gemini 를 직접 부른다 — 요청 모양은
  // server/src/services/geminiApiRuntime.ts 와 같다.
  invokeBackendAI: async (feature: string, payload: Record<string, unknown>) => {
    const { callGeminiForFeature } = await import('./geminiDirect');
    return callGeminiForFeature(feature, payload);
  },
  getResponseText: (r: unknown) => (typeof r === 'string' ? r : null),
}));

import {
  GOLF_TERM_HINTS,
  buildTranscriptText,
  defaultSliceVerifier,
  finalTranscriptRepairer,
  preciseTranscribeNotes,
  repairTranscriptTerms,
  setActiveLessonVocabulary,
  type LessonSegmentNote,
} from '../../services/lessonAudioPipeline';
import { EMPTY_LESSON_VOCABULARY, normalizeLessonVocabulary } from '../../services/lessonVocabulary';
import { characterErrorRate, extractTermList, termRecall } from '../../services/transcriptMetrics';
import { getLastError, getUsage, resetUsage } from './geminiDirect';

const CASES_DIR = resolve(__dirname, 'cases');
const RUNS_DIR = resolve(__dirname, '..', 'runs');
const AUDIO_MIME: Record<string, string> = {
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

interface CaseMeta {
  studentName?: string;
  durationSec?: number;
  vocabulary?: unknown;
  extraTerms?: string[];
}

interface EvalCase {
  name: string;
  audioPath: string;
  mimeType: string;
  reference: string;
  meta: CaseMeta;
}

const loadCases = (): EvalCase[] => {
  if (!existsSync(CASES_DIR)) return [];
  const only = process.env.EVAL_CASE?.trim();
  const out: EvalCase[] = [];
  for (const name of readdirSync(CASES_DIR).sort()) {
    const dir = join(CASES_DIR, name);
    if (!statSync(dir).isDirectory() || (only && name !== only)) continue;
    const audio = readdirSync(dir).find((f) => f.startsWith('audio.') && AUDIO_MIME[extname(f)]);
    const refPath = join(dir, 'reference.txt');
    if (!audio || !existsSync(refPath)) continue;
    const metaPath = join(dir, 'meta.json');
    out.push({
      name,
      audioPath: join(dir, audio),
      mimeType: AUDIO_MIME[extname(audio)],
      reference: readFileSync(refPath, 'utf8'),
      meta: existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, 'utf8')) as CaseMeta) : {},
    });
  }
  return out;
};

interface StageScore {
  stage: string;
  cer: number;
  termRecall: number;
  termsFound: number;
  termsExpected: number;
  missed: string;
  text: string;
  seconds: number;
}

const score = (
  stage: string,
  reference: string,
  notes: LessonSegmentNote[],
  terms: string[],
  seconds: number
): StageScore => {
  const text = buildTranscriptText(notes);
  const recall = termRecall(reference, text, terms);
  return {
    stage,
    cer: characterErrorRate(reference, text),
    termRecall: recall.recall,
    termsFound: recall.found,
    termsExpected: recall.expected,
    missed: recall.missed.map((m) => `${m.term}(${m.found}/${m.expected})`).join(', '),
    text,
    seconds,
  };
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const timed = async <T,>(work: () => Promise<T>): Promise<[T, number]> => {
  const t0 = Date.now();
  const out = await work();
  return [out, (Date.now() - t0) / 1000];
};

const runCase = async (c: EvalCase): Promise<StageScore[]> => {
  const bytes = readFileSync(c.audioPath);
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`${c.name}: 오디오가 20MB 를 넘습니다 — 3~10분 발췌로 잘라 주세요.`);
  }
  const studentName = c.meta.studentName ?? '회원';
  const vocabulary = c.meta.vocabulary
    ? normalizeLessonVocabulary(c.meta.vocabulary)
    : EMPTY_LESSON_VOCABULARY;
  setActiveLessonVocabulary(vocabulary);
  const terms = [
    ...extractTermList(GOLF_TERM_HINTS),
    ...vocabulary.terms,
    ...(c.meta.extraTerms ?? []),
  ];
  const slice = {
    blob: new Blob([bytes], { type: c.mimeType }),
    startSec: 0,
    durationSec: c.meta.durationSec ?? 300,
  };

  const scores: StageScore[] = [];

  // 1. 정밀 전사만
  const [draft, t1] = await timed(() =>
    preciseTranscribeNotes([slice], [], studentName, c.mimeType)
  );
  if (!draft) {
    const cause = getLastError();
    throw new Error(
      `${c.name}: 정밀 전사 실패 — ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  scores.push(score('1. 정밀 전사', c.reference, draft, terms, t1));

  // 2. + 오디오 대조 교정 (같은 초안에서 출발하도록 전사 결과를 재사용한다)
  const draftTurns = draft.flatMap((n) => n.turns ?? []);
  const [verified, t2] = await timed(() =>
    preciseTranscribeNotes([slice], [], studentName, c.mimeType, async () => draftTurns, {
      verifier: defaultSliceVerifier,
    })
  );
  const afterVerify = verified ?? draft;
  scores.push(score('2. + 오디오 대조', c.reference, afterVerify, terms, t2));

  // 3. + 최종 텍스트 교정
  const [repaired, t3] = await timed(() =>
    repairTranscriptTerms(afterVerify, studentName, finalTranscriptRepairer, { concurrency: 3 })
  );
  scores.push(score('3. + 최종 교정', c.reference, repaired, terms, t3));

  setActiveLessonVocabulary(EMPTY_LESSON_VOCABULARY);
  return scores;
};

const renderReport = (
  results: Array<{ c: EvalCase; scores: StageScore[] | Error }>
): { summary: string; full: string } => {
  const lines: string[] = [
    `# 레슨 필기 정확도 평가 — ${new Date().toISOString()}`,
    '',
    'CER 은 낮을수록, 용어 재현율은 높을수록 좋다. 각 단계는 앞 단계 결과 위에 쌓인다.',
    '',
    '## 요약',
    '',
    '| 케이스 | 단계 | CER | 골프 용어 재현율 | 소요 |',
    '|---|---|---|---|---|',
  ];
  const totals = new Map<string, { cer: number; found: number; expected: number; n: number }>();
  for (const { c, scores } of results) {
    if (scores instanceof Error) {
      lines.push(`| ${c.name} | 실패 | ${scores.message.replace(/[\s|]+/g, ' ').slice(0, 240)} | | |`);
      continue;
    }
    for (const s of scores) {
      lines.push(
        `| ${c.name} | ${s.stage} | ${pct(s.cer)} | ${pct(s.termRecall)} (${s.termsFound}/${s.termsExpected}) | ${s.seconds.toFixed(0)}s |`
      );
      const t = totals.get(s.stage) ?? { cer: 0, found: 0, expected: 0, n: 0 };
      t.cer += s.cer;
      t.found += s.termsFound;
      t.expected += s.termsExpected;
      t.n += 1;
      totals.set(s.stage, t);
    }
  }
  if (totals.size) {
    lines.push('', '## 전체 평균', '', '| 단계 | 평균 CER | 골프 용어 재현율(합산) |', '|---|---|---|');
    for (const [stage, t] of totals) {
      lines.push(
        `| ${stage} | ${pct(t.cer / t.n)} | ${pct(t.expected ? t.found / t.expected : 1)} (${t.found}/${t.expected}) |`
      );
    }
  }
  const usage = getUsage();
  if (usage.some((u) => u.errors > 0)) {
    lines.push(
      '',
      '> ⚠️ 실패한 호출이 있습니다. 파이프라인은 실패한 단계를 건너뛰고 앞 단계 결과를 쓰므로,',
      '> 해당 단계의 점수는 "개선 없음"이 아니라 "측정 안 됨"일 수 있습니다.'
    );
  }
  lines.push('', '## 호출량', '', '| 경로 | 모델 | 성공 호출 | 실패 호출 | 입력 토큰 | 출력 토큰 |', '|---|---|---|---|---|---|');
  for (const u of usage) {
    lines.push(
      `| ${u.feature} | ${u.model} | ${u.calls} | ${u.errors} | ${u.inputTokens} | ${u.outputTokens} |`
    );
  }
  const summary = lines.join('\n');
  for (const { c, scores } of results) {
    if (scores instanceof Error) continue;
    lines.push('', `## ${c.name}`, '');
    for (const s of scores) {
      lines.push(`### ${s.stage}`, '', `놓친 용어: ${s.missed || '없음'}`, '', '```', s.text, '```', '');
    }
  }
  return { summary, full: lines.join('\n') };
};

const cases = loadCases();
const apiKey = process.env.GEMINI_API_KEY?.trim();

describe('레슨 필기 정확도', () => {
  if (!apiKey || cases.length === 0) {
    it.skip(
      !apiKey
        ? 'GEMINI_API_KEY 가 없어 건너뜀'
        : '케이스가 없어 건너뜀 — evals/transcription/cases/<이름>/ 에 audio.* 와 reference.txt 를 넣으세요',
      () => {}
    );
    return;
  }

  it(`${cases.length}개 케이스를 단계별로 채점한다`, async () => {
    resetUsage();
    const results: Array<{ c: EvalCase; scores: StageScore[] | Error }> = [];
    for (const c of cases) {
      try {
        results.push({ c, scores: await runCase(c) });
      } catch (err) {
        results.push({ c, scores: err instanceof Error ? err : new Error(String(err)) });
      }
    }
    const { summary, full } = renderReport(results);
    mkdirSync(RUNS_DIR, { recursive: true });
    const file = join(RUNS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-transcription.md`);
    writeFileSync(file, full);
    process.stdout.write(`\n${summary}\n\n전체 결과(필기 원문 포함): ${file}\n`);
  });
});
