import type { Lesson, ClientProfile } from '../types';

export const normalizePhone = (phone: string | null | undefined): string =>
  (phone ?? '').replace(/[^0-9]/g, '');

export const normalizeName = (name: string | null | undefined): string =>
  (name ?? '').replace(/\s+/g, '').trim();

// Match a lesson against a client profile in a way that tolerates
// whitespace / non-breaking-space differences in the stored name and
// prefers the phone number (which is more stable than a display name
// that may have been edited after lessons were recorded).
export const lessonBelongsToClient = (
  lesson: Pick<Lesson, 'clientName' | 'clientPhone'>,
  client: Pick<ClientProfile, 'name' | 'phone'>
): boolean => {
  const clientPhone = normalizePhone(client.phone);
  const lessonPhone = normalizePhone(lesson.clientPhone);
  if (clientPhone && lessonPhone && clientPhone === lessonPhone) return true;
  return normalizeName(lesson.clientName) === normalizeName(client.name);
};
