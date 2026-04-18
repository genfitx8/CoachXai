import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import CalendarView from '../components/CalendarView';
import { reservationService } from '../services/reservationService';
import { CoachProfile, ClientProfile, LessonReservation } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/reservationService', () => ({
  reservationService: {
    getCoachReservations: vi.fn(),
    getAllReservations: vi.fn(),
    cancelReservation: vi.fn(),
    requestReservation: vi.fn(),
  },
}));

vi.mock('../services/realtime', () => ({
  realtimeSubscribe: vi.fn(),
  realtimeUnsubscribe: vi.fn(),
  realtimeConnect: vi.fn(),
}));

vi.mock('../services/icalService', () => ({
  icalService: {
    generateICalFile: vi.fn().mockResolvedValue('BEGIN:VCALENDAR'),
    downloadICalFile: vi.fn(),
    generateSubscriptionUrl: vi.fn().mockReturnValue('https://example.com/subscribe'),
  },
}));

// Mock FullCalendar – render a lightweight stub that exposes its event-click handler
let capturedEventClick: ((info: any) => void) | null = null;
let capturedDateClick: ((info: any) => void) | null = null;
let capturedEvents: any[] = [];

vi.mock('@fullcalendar/react', () => ({
  default: (props: any) => {
    capturedEventClick = props.eventClick;
    capturedDateClick = props.dateClick;
    capturedEvents = props.events || [];
    return (
      <div data-testid="fullcalendar">
        {(props.events || []).map((ev: any) => (
          <div
            key={ev.id}
            data-testid={`event-${ev.id}`}
            onClick={() =>
              props.eventClick &&
              props.eventClick({
                event: {
                  id: ev.id,
                  title: ev.title,
                  start: ev.start,
                  end: ev.end,
                  extendedProps: ev.extendedProps,
                  remove: vi.fn(),
                },
              })
            }
          >
            {ev.title}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));
vi.mock('@fullcalendar/core/locales/ko', () => ({ default: {} }));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COACH: CoachProfile = {
  id: 'coach1',
  name: '박코치',
  email: 'coach@example.com',
};

const CLIENT: ClientProfile = {
  name: '홍길동',
  phone: '010-1234-5678',
  designatedCoach: '박코치',
  coachId: 'coach1',
};

const makeReservation = (overrides: Partial<LessonReservation> = {}): LessonReservation => ({
  id: 'res1',
  coachId: 'coach1',
  coachName: '박코치',
  startTime: '2026-04-01T09:00:00',
  endTime: '2026-04-01T10:00:00',
  status: 'CONFIRMED',
  clientId: 'client1',
  clientName: '홍길동',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CalendarView – coach calendar click-to-cancel disabled', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedEventClick = null;
    capturedDateClick = null;
    capturedEvents = [];
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'CONFIRMED' }),
    ]);
    vi.mocked(reservationService.getAllReservations).mockResolvedValue([]);
  });

  it('does not call cancelReservation when a CONFIRMED event is clicked in coach mode', async () => {
    render(<CalendarView coachProfile={COACH} />);

    await waitFor(() => {
      expect(screen.getByTestId('event-res1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('event-res1'));

    expect(reservationService.cancelReservation).not.toHaveBeenCalled();
  });

  it('does not call cancelReservation when a PENDING event is clicked in coach mode', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'PENDING' }),
    ]);

    render(<CalendarView coachProfile={COACH} />);

    await waitFor(() => {
      expect(screen.getByTestId('event-res1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('event-res1'));

    expect(reservationService.cancelReservation).not.toHaveBeenCalled();
  });

  it('does not show a cancel confirm dialog when a reserved event is clicked in coach mode', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<CalendarView coachProfile={COACH} />);

    await waitFor(() => {
      expect(screen.getByTestId('event-res1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('event-res1'));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('reservation state is unchanged after clicking a reserved event in coach mode', async () => {
    render(<CalendarView coachProfile={COACH} />);

    await waitFor(() => {
      expect(screen.getByTestId('event-res1')).toBeInTheDocument();
    });

    // Click the event
    fireEvent.click(screen.getByTestId('event-res1'));

    // Event should still be present (not removed)
    expect(screen.getByTestId('event-res1')).toBeInTheDocument();
    expect(reservationService.cancelReservation).not.toHaveBeenCalled();
  });

  it('does not render a cancel button in the date detail panel for coach mode', async () => {
    render(<CalendarView coachProfile={COACH} />);

    await waitFor(() => {
      expect(screen.getByTestId('fullcalendar')).toBeInTheDocument();
    });

    // Trigger date click to show the detail panel
    if (capturedDateClick) {
      capturedDateClick({ dateStr: '2026-04-01' });
    }

    await waitFor(() => {
      expect(screen.getByText('일정 상세')).toBeInTheDocument();
    });

    // No cancel button should be rendered in the detail panel
    const cancelButtons = screen.queryAllByRole('button', { name: '취소' });
    expect(cancelButtons).toHaveLength(0);
  });
});

describe('CalendarView – other calendar interactions remain functional', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedEventClick = null;
    capturedDateClick = null;
    capturedEvents = [];
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([]);
    vi.mocked(reservationService.getAllReservations).mockResolvedValue([]);
  });

  it('renders the calendar without errors in coach mode', async () => {
    render(<CalendarView coachProfile={COACH} />);

    await waitFor(() => {
      expect(screen.getByTestId('fullcalendar')).toBeInTheDocument();
    });
  });

  it('calls onDateClickRegister callback when a date is clicked in coach mode', async () => {
    const onDateClickRegister = vi.fn();
    render(<CalendarView coachProfile={COACH} onDateClickRegister={onDateClickRegister} />);

    await waitFor(() => {
      expect(screen.getByTestId('fullcalendar')).toBeInTheDocument();
    });

    if (capturedDateClick) {
      capturedDateClick({ dateStr: '2026-04-01' });
    }

    expect(onDateClickRegister).toHaveBeenCalledWith('2026-04-01');
  });

  it('fetches coach reservations on mount when coachProfile is provided', async () => {
    render(<CalendarView coachProfile={COACH} />);

    await waitFor(() => {
      expect(reservationService.getCoachReservations).toHaveBeenCalledWith(
        'coach1',
        undefined,
        undefined
      );
    });
  });
});
