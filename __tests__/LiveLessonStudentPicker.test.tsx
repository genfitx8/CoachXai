import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import React from 'react';
import { LiveLessonStudentPicker } from '../components/LiveLessonStudentPicker';
import {
  findNearbyLessons,
  NEARBY_LOOKAHEAD_MS,
  NEARBY_LOOKBACK_MS,
} from '../services/lessonStartSuggestionService';
import { ClientProfile, LessonReservation, ReservationStatus } from '../types';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const NOW_ISO = '2026-04-20T14:00:00'; // local time
const NOW_MS = new Date(NOW_ISO).getTime();
const MIN = 60_000;

let resSeq = 0;

/** Reservation starting `offsetMin` from NOW, running `lengthMin`. */
function makeReservation(
  offsetMin: number,
  overrides: Partial<LessonReservation> = {},
  lengthMin = 60,
): LessonReservation {
  const start = new Date(NOW_MS + offsetMin * MIN);
  const end = new Date(start.getTime() + lengthMin * MIN);
  resSeq += 1;
  return {
    id: `res-${resSeq}`,
    coachId: 'coach1',
    coachName: '박코치',
    clientId: `client-${resSeq}`,
    clientName: '김회원',
    clientPhone: '010-1111-2222',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    status: 'CONFIRMED',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

const makeClient = (name: string, phone: string): ClientProfile => ({
  name,
  phone,
  coachId: 'coach1',
});

beforeEach(() => {
  resSeq = 0;
});

// ─── findNearbyLessons ─────────────────────────────────────────────────────────

describe('findNearbyLessons', () => {
  it('returns nothing when there are no reservations', () => {
    expect(findNearbyLessons([], NOW_MS)).toEqual([]);
  });

  it('marks a reservation spanning now as 진행 중', () => {
    const res = makeReservation(-20); // started 20 min ago, 60 min long
    const [first] = findNearbyLessons([res], NOW_MS);

    expect(first.phase).toBe('IN_PROGRESS');
    expect(first.label).toBe('진행 중');
    expect(first.minutesUntilStart).toBe(-20);
  });

  it('labels upcoming lessons in minutes and hours', () => {
    const soon = makeReservation(15, { clientName: '이회원' });
    const later = makeReservation(140, { clientName: '박회원' });

    const found = findNearbyLessons([later, soon], NOW_MS);

    // Sorted by proximity even though the input order was reversed.
    expect(found.map((n) => n.reservation.clientName)).toEqual(['이회원', '박회원']);
    expect(found[0].label).toBe('15분 후 시작');
    expect(found[1].label).toBe('2시간 20분 후 시작');
  });

  it('keeps a just-ended lesson but ranks it last', () => {
    const ended = makeReservation(-75, { clientName: '이회원' }); // ended 15 min ago
    const upcoming = makeReservation(45, { clientName: '박회원' });

    const found = findNearbyLessons([ended, upcoming], NOW_MS);

    expect(found.map((n) => n.reservation.clientName)).toEqual(['박회원', '이회원']);
    expect(found[1].phase).toBe('JUST_ENDED');
    expect(found[1].label).toBe('15분 전 종료');
  });

  it('drops lessons beyond the lookahead and lookback windows', () => {
    const tooFar = makeReservation(NEARBY_LOOKAHEAD_MS / MIN + 30, { clientName: '먼회원' });
    const longGone = makeReservation(-(NEARBY_LOOKBACK_MS / MIN) - 120, { clientName: '옛회원' });

    expect(findNearbyLessons([tooFar, longGone], NOW_MS)).toEqual([]);
  });

  it('ignores reservations that are not actually booked', () => {
    const statuses: ReservationStatus[] = [
      'REQUESTED',
      'CANCELLED',
      'REJECTED',
      'BLOCKED',
      'CANCEL_REQUESTED',
    ];
    const reservations = statuses.map((status, i) =>
      makeReservation(15, { status, clientName: `회원${i}` }),
    );

    expect(findNearbyLessons(reservations, NOW_MS)).toEqual([]);
    // COACH_APPROVED still counts as booked.
    const approved = makeReservation(15, { status: 'COACH_APPROVED' });
    expect(findNearbyLessons([approved], NOW_MS)).toHaveLength(1);
  });

  it('skips reservations with no student attached (e.g. blocked slots)', () => {
    const noName = makeReservation(10, { clientName: undefined });
    expect(findNearbyLessons([noName], NOW_MS)).toEqual([]);
  });

  it('shows a student only once, keeping their closest lesson', () => {
    const near = makeReservation(20, { clientName: '김회원', clientPhone: '010-1111-2222' });
    const far = makeReservation(150, { clientName: '김회원', clientPhone: '010-1111-2222' });

    const found = findNearbyLessons([far, near], NOW_MS);

    expect(found).toHaveLength(1);
    expect(found[0].label).toBe('20분 후 시작');
  });

  it('falls back to a one-hour lesson when endTime is unusable', () => {
    const broken = makeReservation(-30, { endTime: 'not-a-date' });
    const [first] = findNearbyLessons([broken], NOW_MS);

    // Without a fallback length this would look already-finished.
    expect(first.phase).toBe('IN_PROGRESS');
  });
});

// ─── Picker UI ─────────────────────────────────────────────────────────────────

describe('LiveLessonStudentPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const clients = [
    makeClient('강민수', '010-1000-0001'),
    makeClient('김지훈', '010-2000-0002'),
    makeClient('박서연', '010-3000-0003'),
  ];

  const renderPicker = (
    props: Partial<React.ComponentProps<typeof LiveLessonStudentPicker>> = {},
  ) => {
    const onSelect = vi.fn();
    render(
      <LiveLessonStudentPicker
        clients={clients}
        reservations={[]}
        onSelect={onSelect}
        {...props}
      />,
    );
    return { onSelect };
  };

  it('lists every student when nothing is searched', () => {
    renderPicker();
    expect(screen.getAllByTestId('live-lesson-client-item')).toHaveLength(3);
  });

  it('collapses a roster that repeats the same member', () => {
    // 폴백 캐시가 서버 목록 위에 겹치거나, 사라진 상향 동기화가 앱을 켤 때마다
    // 같은 회원을 새 행으로 찍어 두면 명단이 이렇게 도착한다 — 전체 학생 433명,
    // 전부 같은 이름·같은 번호. 고르는 화면에서는 사람 수만큼만 보여야 한다.
    const flooded = [
      ...clients,
      makeClient('강민수', '010-1000-0001'),
      makeClient('강 민수', '01010000001'), // 표기만 다른 같은 사람
      makeClient('김지훈', '010-2000-0002'),
    ];
    renderPicker({ clients: flooded });

    expect(screen.getAllByTestId('live-lesson-client-item')).toHaveLength(3);
    expect(screen.getAllByText('강민수')).toHaveLength(1);
    expect(screen.getByText('3명')).toBeInTheDocument();
  });

  it('filters the roster by name', () => {
    renderPicker();
    fireEvent.change(screen.getByTestId('live-lesson-student-search'), {
      target: { value: '김지' },
    });

    const items = screen.getAllByTestId('live-lesson-client-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('김지훈');
  });

  it('filters the roster by phone number, ignoring hyphens', () => {
    renderPicker();
    fireEvent.change(screen.getByTestId('live-lesson-student-search'), {
      target: { value: '01030000003' },
    });

    const items = screen.getAllByTestId('live-lesson-client-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('박서연');
  });

  it('explains when a search matches nobody, and clears back to the full list', () => {
    renderPicker();
    fireEvent.change(screen.getByTestId('live-lesson-student-search'), {
      target: { value: '없는사람' },
    });
    expect(screen.getByTestId('live-lesson-no-search-result')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('검색어 지우기'));
    expect(screen.getAllByTestId('live-lesson-client-item')).toHaveLength(3);
  });

  it('suggests the student whose reservation is closest to now', () => {
    renderPicker({
      reservations: [
        makeReservation(90, { clientName: '박서연', clientPhone: '010-3000-0003' }),
        makeReservation(-10, { clientName: '김지훈', clientPhone: '010-2000-0002' }),
      ],
    });

    const suggestions = screen.getAllByTestId('live-lesson-nearby-item');
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toHaveTextContent('김지훈');
    expect(within(suggestions[0]).getByText('진행 중')).toBeInTheDocument();
    expect(suggestions[1]).toHaveTextContent('박서연');
    expect(within(suggestions[1]).getByText('1시간 30분 후 시작')).toBeInTheDocument();
  });

  it('starts the companion for a suggested student', () => {
    const { onSelect } = renderPicker({
      reservations: [makeReservation(-10, { clientName: '김지훈' })],
    });

    fireEvent.click(screen.getAllByTestId('live-lesson-nearby-item')[0]);
    expect(onSelect).toHaveBeenCalledWith('김지훈');
  });

  it('starts the companion for a student picked off the roster', () => {
    const { onSelect } = renderPicker();

    fireEvent.click(screen.getAllByTestId('live-lesson-client-item')[0]);
    expect(onSelect).toHaveBeenCalledWith('강민수');
  });

  it('falls back to a hint when the calendar has nothing nearby', () => {
    renderPicker({ reservations: [makeReservation(600)] });

    expect(screen.queryAllByTestId('live-lesson-nearby-item')).toHaveLength(0);
    expect(
      screen.getByText(/가까운 시간에 예약된 레슨이 없습니다/),
    ).toBeInTheDocument();
  });

  it('says so while the reservations are still loading', () => {
    renderPicker({ reservationsLoading: true });
    expect(screen.getByText(/예약 일정을 확인하는 중입니다/)).toBeInTheDocument();
  });

  it('refreshes the relative label as time passes', () => {
    renderPicker({ reservations: [makeReservation(15, { clientName: '김지훈' })] });

    expect(screen.getByText('15분 후 시작')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10 * MIN);
    });
    expect(screen.getByText('5분 후 시작')).toBeInTheDocument();
  });

  it('tells the coach to add members when the roster is empty', () => {
    renderPicker({ clients: [] });
    expect(screen.getByText('등록된 학생이 없습니다')).toBeInTheDocument();
  });
});
