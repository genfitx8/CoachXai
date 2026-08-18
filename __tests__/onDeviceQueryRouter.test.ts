/**
 * Tests for the on-device query router — the rule set that decides which
 * chat queries a tiny local model may answer and which must go to the
 * server AI. The router must be conservative: anything touching app data
 * or a member name routes server-side.
 */
import { describe, expect, it } from 'vitest';
import { routeChatQuery } from '../services/onDeviceLlm/queryRouter';

describe('routeChatQuery', () => {
  describe('routes to the server', () => {
    it('long queries', () => {
      const long = '슬라이스 '.repeat(40);
      expect(routeChatQuery(long)).toEqual({ target: 'server', reason: 'long_query' });
    });

    it('queries mentioning a registered member name', () => {
      const decision = routeChatQuery('김민수 스윙 어때?', { clientNames: ['김민수', '박지영'] });
      expect(decision).toEqual({ target: 'server', reason: 'member_reference' });
    });

    it('does not treat 1-char names as member references', () => {
      // A single-character "name" would match almost any Korean sentence.
      const decision = routeChatQuery('그립 잡는 법 알려줘', { clientNames: ['김'] });
      expect(decision.reason).not.toBe('member_reference');
    });

    it('schedule questions (app data)', () => {
      expect(routeChatQuery('오늘 일정 알려줘').target).toBe('server');
      expect(routeChatQuery("Today's schedule?").target).toBe('server');
    });

    it('summary / insight / curriculum requests (app data)', () => {
      expect(routeChatQuery('이번 주 레슨 요약해줘').target).toBe('server');
      expect(routeChatQuery('코칭 인사이트 보여줘').target).toBe('server');
      expect(routeChatQuery('커리큘럼 만들어줘').target).toBe('server');
    });

    it('member / student keywords (app data)', () => {
      expect(routeChatQuery('주의 학생 있어?').target).toBe('server');
      expect(routeChatQuery('Which members need attention?').target).toBe('server');
    });

    it('ambiguous non-golf queries default to the server', () => {
      expect(routeChatQuery('저녁 메뉴 추천해줘')).toEqual({
        target: 'server',
        reason: 'default_server',
      });
    });

    it('greetings that also reference app data go to the server', () => {
      expect(routeChatQuery('안녕! 오늘 일정 알려줘').target).toBe('server');
    });
  });

  describe('routes on-device', () => {
    it('greetings', () => {
      expect(routeChatQuery('안녕하세요!')).toEqual({ target: 'on-device', reason: 'greeting' });
      expect(routeChatQuery('Hello there')).toEqual({ target: 'on-device', reason: 'greeting' });
      expect(routeChatQuery('ありがとう')).toEqual({ target: 'on-device', reason: 'greeting' });
    });

    it('golf glossary questions', () => {
      expect(routeChatQuery('멀리건이 뭐야?')).toEqual({ target: 'on-device', reason: 'glossary' });
      expect(routeChatQuery('What is a handicap?')).toEqual({
        target: 'on-device',
        reason: 'glossary',
      });
    });

    it('short generic golf questions', () => {
      expect(routeChatQuery('슬라이스 어떻게 고쳐?')).toEqual({
        target: 'on-device',
        reason: 'general_golf',
      });
      expect(routeChatQuery('How do I fix my hook?')).toEqual({
        target: 'on-device',
        reason: 'general_golf',
      });
    });
  });
});
