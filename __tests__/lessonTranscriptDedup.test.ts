/**
 * trimTranscriptOverlap — 레슨 필기 겹침 제거의 단위 테스트.
 *
 * 실제 장애 사례(2026-08): 인접 세그먼트 오디오가 같은 발화를 반복 포함해
 * 필기가 "드라이버" → "드라이버 슬라이스를" → "드라이버 슬라이스를
 * 교정하는" 처럼 누적 반복됐다. 이 함수는 그 겹침을 텍스트 차원에서
 * 잘라내되, 정상 필기를 오려내지 않아야 한다.
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

import { trimTranscriptOverlap } from '../services/lessonAudioPipeline';

describe('trimTranscriptOverlap', () => {
  it('누적형 겹침 체인에서 새로 들린 말만 남긴다 (실제 장애 패턴)', () => {
    const chain = [
      '드라이버',
      '드라이버 슬라이스를',
      '드라이버 슬라이스를 교정하는',
      '드라이버 슬라이스를 교정하는 레슨 좀 할 건데요',
    ];
    expect(trimTranscriptOverlap(chain[0], chain[1])).toBe('슬라이스를');
    expect(trimTranscriptOverlap(chain[1], chain[2])).toBe('교정하는');
    expect(trimTranscriptOverlap(chain[2], chain[3])).toBe('레슨 좀 할 건데요');
  });

  it('직전 전사와 완전히 같으면 빈 필기로 만든다', () => {
    expect(trimTranscriptOverlap('드라이버 슬라이스를', '드라이버 슬라이스를')).toBe('');
  });

  it('직전 전사에 통째로 포함되면 빈 필기로 만든다', () => {
    expect(
      trimTranscriptOverlap('오늘은 드라이버 슬라이스를 교정합니다', '드라이버 슬라이스를')
    ).toBe('');
  });

  it('꼬리-머리 겹침은 단어 경계에서 잘라낸다', () => {
    expect(
      trimTranscriptOverlap('오늘은 드라이버 슬라이스를', '슬라이스를 교정하는 레슨')
    ).toBe('교정하는 레슨');
  });

  it('단어 경계가 아니면 자르지 않는다 — 정상 발화 보존', () => {
    // "드라이버" + "드라이버는…" 은 겹침이 아니라 연속 발화일 수 있다.
    expect(
      trimTranscriptOverlap('오늘 연습은 드라이버', '드라이버는 이렇게 잡으세요')
    ).toBe('드라이버는 이렇게 잡으세요');
  });

  it('4자 미만의 짧은 일치는 무시한다', () => {
    expect(trimTranscriptOverlap('이제 스윙', '스윙 해보세요')).toBe('스윙 해보세요');
  });

  it('겹침이 없으면 그대로 둔다', () => {
    expect(trimTranscriptOverlap('그립을 이렇게 잡고', '어깨 회전을 더 크게')).toBe(
      '어깨 회전을 더 크게'
    );
  });

  it('빈 입력을 안전하게 처리한다', () => {
    expect(trimTranscriptOverlap('', '드라이버 연습')).toBe('드라이버 연습');
    expect(trimTranscriptOverlap('드라이버 연습', '')).toBe('');
  });

  it('공백 차이는 정규화해 비교한다', () => {
    expect(
      trimTranscriptOverlap('드라이버  슬라이스를', '드라이버 슬라이스를   교정')
    ).toBe('교정');
  });
});
