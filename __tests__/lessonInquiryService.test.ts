import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lessonInquiryService } from '../services/lessonInquiryService';
import { firebaseService } from '../services/firebase';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    saveLessonInquiry: vi.fn(),
    getLessonInquiriesByClient: vi.fn(),
    getLessonInquiriesByCoach: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_INQUIRY = {
  coachId: 'coach1',
  coachName: '김코치',
  clientId: '홍길동_010-1234-5678',
  clientName: '홍길동',
  clientPhone: '010-1234-5678',
  message: '레슨 문의드립니다.',
  preferredDate: '2026-05-01',
  preferredTime: '10:00',
};

// ─── Tests: localStorage mode ─────────────────────────────────────────────────

describe('lessonInquiryService – localStorage mode', () => {
  beforeEach(() => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    localStorage.clear();
  });

  it('creates an inquiry with a generated id and PENDING status', async () => {
    const result = await lessonInquiryService.createInquiry(BASE_INQUIRY);

    expect(result.id).toBeTruthy();
    expect(result.status).toBe('PENDING');
    expect(result.coachId).toBe('coach1');
    expect(result.clientName).toBe('홍길동');
    expect(result.createdAt).toBeGreaterThan(0);
  });

  it('persists inquiry to localStorage', async () => {
    await lessonInquiryService.createInquiry(BASE_INQUIRY);

    const raw = localStorage.getItem('swingnote_lesson_inquiries');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored).toHaveLength(1);
    expect(stored[0].coachId).toBe('coach1');
  });

  it('retrieves inquiries by clientId', async () => {
    await lessonInquiryService.createInquiry(BASE_INQUIRY);
    await lessonInquiryService.createInquiry({ ...BASE_INQUIRY, clientId: 'other_client' });

    const results = await lessonInquiryService.getInquiriesByClient('홍길동_010-1234-5678');

    expect(results).toHaveLength(1);
    expect(results[0].clientId).toBe('홍길동_010-1234-5678');
  });

  it('retrieves inquiries by coachId', async () => {
    await lessonInquiryService.createInquiry(BASE_INQUIRY);
    await lessonInquiryService.createInquiry({ ...BASE_INQUIRY, coachId: 'coach2', coachName: '이코치' });

    const results = await lessonInquiryService.getInquiriesByCoach('coach1');

    expect(results).toHaveLength(1);
    expect(results[0].coachId).toBe('coach1');
  });

  it('returns empty array when no inquiries exist', async () => {
    const results = await lessonInquiryService.getInquiriesByClient('nobody');
    expect(results).toEqual([]);
  });

  it('does not call Firebase methods in localStorage mode', async () => {
    await lessonInquiryService.createInquiry(BASE_INQUIRY);

    expect(firebaseService.saveLessonInquiry).not.toHaveBeenCalled();
  });
});

// ─── Tests: Firebase mode ─────────────────────────────────────────────────────

describe('lessonInquiryService – Firebase mode', () => {
  beforeEach(() => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
    vi.mocked(firebaseService.saveLessonInquiry).mockResolvedValue(undefined);
    vi.mocked(firebaseService.getLessonInquiriesByClient).mockResolvedValue([]);
    vi.mocked(firebaseService.getLessonInquiriesByCoach).mockResolvedValue([]);
    localStorage.clear();
  });

  it('calls firebaseService.saveLessonInquiry in Firebase mode', async () => {
    await lessonInquiryService.createInquiry(BASE_INQUIRY);

    expect(firebaseService.saveLessonInquiry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(firebaseService.saveLessonInquiry).mock.calls[0][0].status).toBe('PENDING');
  });

  it('calls firebaseService.getLessonInquiriesByClient in Firebase mode', async () => {
    await lessonInquiryService.getInquiriesByClient('홍길동_010-1234-5678');

    expect(firebaseService.getLessonInquiriesByClient).toHaveBeenCalledWith('홍길동_010-1234-5678');
  });

  it('calls firebaseService.getLessonInquiriesByCoach in Firebase mode', async () => {
    await lessonInquiryService.getInquiriesByCoach('coach1');

    expect(firebaseService.getLessonInquiriesByCoach).toHaveBeenCalledWith('coach1');
  });
});
