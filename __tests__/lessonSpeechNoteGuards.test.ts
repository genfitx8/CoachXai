/**
 * LessonAudioSession.addSpeechNote — 필기에 "하지 않은 대화"가 들어오는
 * 경로의 마지막 방어선.
 *
 * 실제 증상(모바일 브라우저): 코치가 하지 않은 말이 받아쓰기에 나타난다.
 * 인식기 쪽 원인(결과 재전달·정지 후 늦은 결과)을 막더라도, 인식을
 * 되살리는 경로가 여러 갈래(백그라운드 복귀, 검토에서 복귀)라 세션
 * 자체가 다음 두 가지를 지켜야 한다.
 *  - 일시정지(검토 단계 포함) 중에 들어온 발화는 받아 적지 않는다.
 *  - 최근에 적은 것과 똑같은 줄이 다시 오면 인식기의 재전달로 보고 버린다.
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

import { LessonAudioSession } from '../services/lessonAudioPipeline';

const transcripts = (session: LessonAudioSession): string[] =>
  session.getNotes().map((n) => n.transcript);

describe('addSpeechNote — 하지 않은 대화 차단', () => {
  let session: LessonAudioSession;

  beforeEach(async () => {
    vi.useFakeTimers();
    session = new LessonAudioSession({ studentName: '테스트' });
    // notes-only(speech) 모드 — 마이크는 인식기가 전담한다.
    await session.start(null);
  });
  afterEach(async () => {
    await session.discard();
    vi.useRealTimers();
  });

  it('일시정지 중 들린 말은 필기에 넣지 않는다', () => {
    session.addSpeechNote('어깨를 조금만 더 돌려보세요');
    session.pause();
    session.addSpeechNote('다음 손님 몇 시에 오시죠');
    expect(transcripts(session)).toEqual(['어깨를 조금만 더 돌려보세요']);

    // 재개하면 다시 받아 적는다 — 차단이 아니라 유예다.
    session.resume();
    session.addSpeechNote('체중은 왼발에 두시고요');
    expect(transcripts(session)).toEqual([
      '어깨를 조금만 더 돌려보세요',
      '체중은 왼발에 두시고요',
    ]);
  });

  it('몇 줄 건너 다시 온 같은 발화는 재전달로 보고 버린다', () => {
    const first = '어깨를 조금만 더 돌려보세요';
    session.addSpeechNote(first);
    session.addSpeechNote('체중은 왼발에 두시고요');
    session.addSpeechNote('그대로 스윙 한 번 해볼게요');
    // 인식기가 첫 줄을 다시 흘려보낸다 — 직전 한 줄 비교로는 못 잡는다.
    session.addSpeechNote(first);

    expect(transcripts(session)).toEqual([
      first,
      '체중은 왼발에 두시고요',
      '그대로 스윙 한 번 해볼게요',
    ]);
  });

  it('시간이 지난 뒤 다시 한 코칭 멘트는 지우지 않는다', () => {
    const line = '체중은 왼발에 두시고요';
    session.addSpeechNote(line);
    session.addSpeechNote('그대로 스윙 한 번 해볼게요');
    // 코칭 멘트는 레슨 내내 반복되는 게 정상이다 — 재전달과 달리 시간이 뜬다.
    vi.advanceTimersByTime(10_000);
    session.addSpeechNote(line);

    expect(transcripts(session)).toEqual([
      line,
      '그대로 스윙 한 번 해볼게요',
      line,
    ]);
  });

  it('짧은 맞장구는 반복돼도 지우지 않는다', () => {
    session.addSpeechNote('네');
    session.addSpeechNote('이렇게요?');
    session.addSpeechNote('네');
    expect(transcripts(session)).toEqual(['네', '이렇게요?', '네']);
  });
});
