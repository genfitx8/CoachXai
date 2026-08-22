/**
 * Which lessons belong in a coach's 전체 레슨기록. The list used to adopt any
 * record whose member is currently assigned to the coach — so a record another
 * coach saved (or one left over in the device cache from a previous sign-in)
 * showed up as if this coach had written it.
 */
import { describe, it, expect } from 'vitest';
import { lessonBelongsToCoach } from '../utils/lessonOwnership';

const COACH = 'coach-a';
const OTHER = 'coach-b';

const lesson = (over: Record<string, unknown> = {}) =>
  ({
    coachId: COACH,
    clientName: '홍길동',
    clientPhone: '010-1111-2222',
    ...over,
  }) as Parameters<typeof lessonBelongsToCoach>[0];

const myMember = [{ name: '홍길동', phone: '010-1111-2222', coachId: COACH }];

describe('lessonBelongsToCoach', () => {
  it('includes records assigned to the coach', () => {
    expect(lessonBelongsToCoach(lesson(), COACH, myMember)).toBe(true);
  });

  it('includes records the coach created but no longer owns', () => {
    expect(
      lessonBelongsToCoach(
        lesson({ coachId: OTHER, originalCoachId: COACH }),
        COACH,
        myMember
      )
    ).toBe(true);
  });

  it("excludes another coach's record even for the coach's own member", () => {
    expect(
      lessonBelongsToCoach(
        lesson({ coachId: OTHER, originalCoachId: OTHER }),
        COACH,
        myMember
      )
    ).toBe(false);
  });

  it('still adopts unattributed legacy records of the coach’s member', () => {
    expect(
      lessonBelongsToCoach(
        lesson({ coachId: undefined, originalCoachId: undefined }),
        COACH,
        myMember
      )
    ).toBe(true);
  });

  it('leaves unattributed records of somebody else’s member out', () => {
    const otherMember = [{ name: '홍길동', phone: '010-1111-2222', coachId: OTHER }];
    expect(
      lessonBelongsToCoach(
        lesson({ coachId: undefined, originalCoachId: undefined }),
        COACH,
        otherMember
      )
    ).toBe(false);
  });

  it('shows nothing when the coach id is missing', () => {
    expect(lessonBelongsToCoach(lesson({ coachId: undefined }), '', myMember)).toBe(false);
  });
});
