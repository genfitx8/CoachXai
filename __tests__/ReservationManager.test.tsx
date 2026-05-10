import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { ReservationManager } from '../components/ReservationManager';
import { reservationService } from '../services/reservationService';
import { CoachProfile, LessonReservation } from '../types';

// ─── LanguageContext mock ──────────────────────────────────────────────────────
vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'ko',
    t: (key: string) => {
      const map: Record<string, string> = {
        reservation_management: '예약 관리',
        reservation_tab_slots: '슬롯 관리',
        reservation_tab_calendar: '캘린더',
        reservation_tab_settings: '근무 시간 설정',
        reservation_count_all: '전체',
        res_status_available: '예약 가능',
        res_status_blocked: '블럭됨',
        res_status_pending: '대기중',
        res_status_confirmed: '승인됨',
        res_status_cancelled: '취소됨',
        res_status_completed: '완료됨',
        slot_time_management: '시간 슬롯 관리',
        working_schedule_settings: '근무 요일 및 시간 설정',
        working_hours_outside_hint: '설정된 근무 시간 외의 슬롯은 회원에게 노출되지 않습니다.',
        holiday_day_msg: '휴무일로 설정된 날입니다. 근무 시간 설정에서 변경할 수 있습니다.',
        closed_day_label: '휴무',
        approve_label: '승인',
        reject_label: '거부',
        release_label: '해제',
        cancel: '취소',
        register_label: '예약 등록',
        unavailable_label: '예약 불가',
        no_reservations_label: '예약이 없습니다.',
        confirm_approve_reservation: '이 예약을 승인하시겠습니까?',
        reservation_approved_msg: '예약이 승인되었습니다.',
        reservation_rejected_msg: '예약이 거부되었습니다.',
        reject_reason_prompt: '거부 사유를 입력해주세요 (선택사항):',
        confirm_cancel_reservation: '이 예약을 취소하시겠습니까?',
        reservation_cancelled_msg: '예약이 취소되었습니다.',
        working_hours_saved_msg: '근무 시간이 저장되었습니다.',
        saving_label: '저장 중...',
        save_working_hours: '근무 시간 저장',
        loading: '로딩 중...',
        slot_change_failed_msg: '슬롯 변경에 실패했습니다.',
        approve_failed_msg: '승인에 실패했습니다.',
        reject_failed_msg: '거부에 실패했습니다.',
        cancel_failed_msg: '취소에 실패했습니다.',
        save_failed_msg: '저장에 실패했습니다.',
        day_mon: '월', day_tue: '화', day_wed: '수', day_thu: '목',
        day_fri: '금', day_sat: '토', day_sun: '일',
      };
      return map[key] ?? key;
    },
    setLanguage: vi.fn(),
  }),
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/reservationService', () => ({
  reservationService: {
    getCoachReservations: vi.fn(),
    toggleHourSlot: vi.fn(),
    approveReservation: vi.fn(),
    rejectReservation: vi.fn(),
    cancelReservation: vi.fn(),
  },
}));

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn().mockReturnValue(false),
    saveCoach: vi.fn(),
    getClients: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getClients: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../services/bayReservationService', () => ({
  bayReservationService: {
    getActiveBranches: vi.fn().mockResolvedValue([]),
    getAvailableTimeSlots: vi.fn().mockResolvedValue([]),
    getAvailableBays: vi.fn().mockResolvedValue([]),
    createReservation: vi.fn(),
  },
}));

vi.mock('../components/CalendarView', () => ({
  default: () => <div data-testid="calendar-view" />,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// 2026-04-01 is a Wednesday (wed)
const TEST_DATE = '2026-04-01';

const COACH: CoachProfile = {
  id: 'coach1',
  name: '박코치',
  email: 'coach@example.com',
  workingSchedule: {
    wed: { open: '09:00', close: '12:00', isClosed: false },
  },
};

const makeReservation = (overrides: Partial<LessonReservation> = {}): LessonReservation => ({
  id: 'res1',
  coachId: 'coach1',
  coachName: '박코치',
  startTime: `${TEST_DATE}T09:00:00`,
  endTime: `${TEST_DATE}T10:00:00`,
  status: 'AVAILABLE',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReservationManager – slot click interactions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([]);
    vi.mocked(reservationService.toggleHourSlot).mockResolvedValue({ action: 'blocked' });
  });

  // ── Slot rendering ──────────────────────────────────────────────────────────

  it('renders hour slot buttons for all working hours', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    // Working hours 09:00–12:00 → slots at 09, 10, 11
    await waitFor(() => {
      expect(screen.getByTestId('slot-9')).toBeInTheDocument();
      expect(screen.getByTestId('slot-10')).toBeInTheDocument();
      expect(screen.getByTestId('slot-11')).toBeInTheDocument();
    });
  });

  it('does not render slots outside working hours', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    await waitFor(() => {
      expect(screen.getByTestId('slot-9')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('slot-8')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slot-12')).not.toBeInTheDocument();
  });

  // ── Available → opens reservation modal ────────────────────────────────────

  it('clicking an available slot opens the reservation creation modal', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    fireEvent.click(slotButton);

    // Modal should appear with the reservation form title
    await waitFor(() => {
      expect(screen.getByText('회원 레슨 예약 등록')).toBeInTheDocument();
    });

    // toggleHourSlot should NOT be called when clicking an available slot
    expect(reservationService.toggleHourSlot).not.toHaveBeenCalled();
  });

  it('clicking an available slot does not call toggleHourSlot', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    fireEvent.click(slotButton);

    expect(reservationService.toggleHourSlot).not.toHaveBeenCalled();
  });

  it('clicking the block button on an available slot calls toggleHourSlot', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const blockButton = await screen.findByTestId('block-slot-9');
    fireEvent.click(blockButton);

    await waitFor(() => {
      expect(reservationService.toggleHourSlot).toHaveBeenCalledWith(
        'coach1',
        '박코치',
        TEST_DATE,
        9
      );
    });
  });

  it('available slot has emerald (green) visual styling', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    expect(slotButton.className).toContain('emerald');
  });

  // ── Blocked → Available ─────────────────────────────────────────────────────

  it('clicking a blocked slot calls toggleHourSlot to unblock it', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ id: 'block1', status: 'BLOCKED' }),
    ]);
    vi.mocked(reservationService.toggleHourSlot).mockResolvedValue({ action: 'available' });

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    fireEvent.click(slotButton);

    await waitFor(() => {
      expect(reservationService.toggleHourSlot).toHaveBeenCalledWith(
        'coach1',
        '박코치',
        TEST_DATE,
        9
      );
    });
  });

  it('blocked slot has red visual styling', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'BLOCKED' }),
    ]);

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    expect(slotButton.className).toContain('bg-red');
  });

  // ── Booked slots are protected ──────────────────────────────────────────────

  it('PENDING slot button is disabled', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'PENDING', clientId: 'client1', clientName: '김회원' }),
    ]);

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    expect(slotButton).toBeDisabled();
  });

  it('CONFIRMED slot button is disabled', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'CONFIRMED', clientId: 'client1', clientName: '김회원' }),
    ]);

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    expect(slotButton).toBeDisabled();
  });

  it('clicking a PENDING slot does not call toggleHourSlot', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'PENDING', clientId: 'client1', clientName: '김회원' }),
    ]);

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    fireEvent.click(slotButton);

    expect(reservationService.toggleHourSlot).not.toHaveBeenCalled();
  });

  it('clicking a CONFIRMED slot does not call toggleHourSlot', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'CONFIRMED', clientId: 'client1', clientName: '김회원' }),
    ]);

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    fireEvent.click(slotButton);

    expect(reservationService.toggleHourSlot).not.toHaveBeenCalled();
  });

  // ── State persistence / refresh ─────────────────────────────────────────────

  it('refreshes reservations after the block button is clicked', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const blockButton = await screen.findByTestId('block-slot-9');
    fireEvent.click(blockButton);

    await waitFor(() => {
      // Called once on mount + once after successful toggle
      expect(reservationService.getCoachReservations).toHaveBeenCalledTimes(2);
    });
  });

  it('does not refresh reservations when toggleHourSlot throws via block button', async () => {
    vi.mocked(reservationService.toggleHourSlot).mockRejectedValue(
      new Error('이미 예약된 시간대는 변경할 수 없습니다.')
    );
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    // Wait for initial load
    await screen.findByTestId('block-slot-9');

    const callCountAfterMount = vi.mocked(reservationService.getCoachReservations).mock.calls.length;

    const blockButton = screen.getByTestId('block-slot-9');
    fireEvent.click(blockButton);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalled();
    });

    // No additional refresh on error
    expect(vi.mocked(reservationService.getCoachReservations).mock.calls.length).toBe(
      callCountAfterMount
    );

    alertMock.mockRestore();
  });

  // ── Closed day ──────────────────────────────────────────────────────────────

  it('shows a closed-day message for a non-working day', async () => {
    const coachClosedWed: CoachProfile = {
      ...COACH,
      workingSchedule: {
        wed: { open: '09:00', close: '18:00', isClosed: true },
      },
    };

    render(
      <ReservationManager coachProfile={coachClosedWed} onBack={vi.fn()} initialDate={TEST_DATE} />
    );

    await waitFor(() => {
      expect(screen.getByText(/휴무일/)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('slot-9')).not.toBeInTheDocument();
  });

  // ── PENDING slot visual ─────────────────────────────────────────────────────

  it('PENDING slot has yellow visual styling', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'PENDING', clientId: 'client1', clientName: '김회원' }),
    ]);

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    expect(slotButton.className).toContain('bg-amber-500');
  });

  // ── CONFIRMED slot visual ───────────────────────────────────────────────────

  it('CONFIRMED slot has green visual styling', async () => {
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([
      makeReservation({ status: 'CONFIRMED', clientId: 'client1', clientName: '김회원' }),
    ]);

    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);

    const slotButton = await screen.findByTestId('slot-9');
    expect(slotButton.className).toContain('bg-emerald-500');
  });
});

// ─── New: Calendar tab in ReservationManager ──────────────────────────────────

describe('ReservationManager – calendar tab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(reservationService.getCoachReservations).mockResolvedValue([]);
    vi.mocked(reservationService.toggleHourSlot).mockResolvedValue({ action: 'blocked' });
  });

  it('shows a "캘린더" tab button', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-calendar')).toBeInTheDocument();
    });
  });

  it('does NOT show the calendar view on initial render (default tab is SLOTS)', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);
    await waitFor(() => {
      expect(screen.getByTestId('slot-9')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('reservation-calendar-view')).toBeNull();
  });

  it('shows the calendar view after clicking the "캘린더" tab', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-calendar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-calendar'));
    await waitFor(() => {
      expect(screen.getByTestId('reservation-calendar-view')).toBeInTheDocument();
      expect(screen.getByTestId('calendar-view')).toBeInTheDocument();
    });
  });

  it('hides slot grid when calendar tab is active', async () => {
    render(<ReservationManager coachProfile={COACH} onBack={vi.fn()} initialDate={TEST_DATE} />);
    await waitFor(() => expect(screen.getByTestId('tab-calendar')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('tab-calendar'));
    await waitFor(() => {
      expect(screen.getByTestId('reservation-calendar-view')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('slot-9')).toBeNull();
  });
});
