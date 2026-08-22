import type { Lesson, ClientProfile } from '../types';

/**
 * Does this lesson belong to the signed-in coach's own teaching history?
 *
 * Attribution on the record wins: the current owner (`coachId`) and the coach
 * who created it (`originalCoachId`) — exactly the set GET /api/lessons sends
 * a coach.
 *
 * Only a record with no coach attribution at all falls back to "whose member
 * is this now". That fallback exists for legacy rows written before lessons
 * were stamped with a coach; a record that names a *different* coach is never
 * adopted through it. Adopting one was how another account's records — a
 * device-local cache from a previous sign-in, a member who moved between
 * coaches — could show up in 전체 레슨기록 as lessons this coach never saved.
 */
export const lessonBelongsToCoach = (
  lesson: Pick<Lesson, 'coachId' | 'originalCoachId' | 'clientName' | 'clientPhone'>,
  coachId: string,
  clients: Pick<ClientProfile, 'name' | 'phone' | 'coachId'>[]
): boolean => {
  if (!coachId) return false;
  if (lesson.coachId === coachId) return true;
  if (lesson.originalCoachId === coachId) return true;
  if (lesson.coachId || lesson.originalCoachId) return false;

  const client = clients.find(
    (c) => c.name === lesson.clientName && c.phone === lesson.clientPhone
  );
  return !!client && !!client.coachId && client.coachId === coachId;
};
