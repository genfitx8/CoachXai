import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { ClientReservation } from '../components/ClientReservation';
import { reservationService } from '../services/reservationService';
import { ClientProfile, LessonReservation } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/reservationService', () => ({
  reservationService: {
    getAvailableSlots: vi.fn(),
    getAvailableWorkingHourSlots: vi.fn(),
    getClientReservations: vi.fn(),
    requestReservation: vi.fn(),
    requestReservationWithTime: vi.fn(),
    cancelReservation: vi.fn(),
  },
  VIRTUAL_SLOT_ID_PREFIX: 'virtual_',
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_CLIENT: ClientProfile = {
  name: '홍길동',
  phone: '010-1234-5678',
  designatedCoach: '김코치',
  coachId: 'coach1',
};

const makeSlot = (id: string, hour: number): LessonReservation => ({
  id,
  coachId: 'coach1',
  coachName: '김코치',
  startTime: `2026-04-10T${String(hour).padStart(2, '0')}:00:00`,
  endTime: `2026-04-10T${String(hour + 1).padStart(2, '0')}:00:00`,
  status: 'AVAILABLE',
  createdAt: 1000,
  updatedAt: 1000,
});

const SLOT_A = makeSlot('slot-a', 10);
const SLOT_B = makeSlot('slot-b', 14);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openReservationForm() {
  fireEvent.click(screen.getByText('예약 신청하기'));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClientReservation – date-based time slot selection', () => {
  beforeEach(() => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots).mockResolvedValue([]);
    vi.mocked(reservationService.getAvailableSlots).mockResolvedValue([]);
    vi.mocked(reservationService.getClientReservations).mockResolvedValue([]);
  });

  it('renders the reservation form after clicking 예약 신청하기', async () => {
    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();
    expect(await screen.findByText('레슨 예약 신청')).toBeInTheDocument();
  });

  it('loads available slots for the selected date when date changes', async () => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots).mockResolvedValue([SLOT_A, SLOT_B]);

    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();

    const dateInput = screen.getByLabelText('날짜');
    fireEvent.change(dateInput, { target: { value: '2026-04-10' } });

    await waitFor(() => {
      expect(reservationService.getAvailableWorkingHourSlots).toHaveBeenCalledWith(
        'coach1',
        '2026-04-10'
      );
    });
  });

  it('renders available time-slot boxes after a date is selected', async () => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots).mockResolvedValue([SLOT_A, SLOT_B]);

    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();

    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-04-10' } });

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
      expect(screen.getByTestId('time-slot-slot-a')).toBeInTheDocument();
      expect(screen.getByTestId('time-slot-slot-b')).toBeInTheDocument();
    });
  });

  it('shows an empty-state message when no slots are available for the selected date', async () => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots).mockResolvedValue([]);

    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();

    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-04-10' } });

    await waitFor(() => {
      expect(
        screen.getByText(/선택한 날짜에 예약 가능한 시간대가 없습니다/)
      ).toBeInTheDocument();
    });
  });

  it('highlights a time slot box when clicked (selected state)', async () => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots).mockResolvedValue([SLOT_A, SLOT_B]);

    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();

    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-04-10' } });

    const slotButton = await screen.findByTestId('time-slot-slot-a');
    fireEvent.click(slotButton);

    expect(slotButton.className).toContain('bg-blue-500');
  });

  it('deselects a slot when clicked a second time', async () => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots).mockResolvedValue([SLOT_A]);

    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();

    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-04-10' } });

    const slotButton = await screen.findByTestId('time-slot-slot-a');
    fireEvent.click(slotButton); // select
    fireEvent.click(slotButton); // deselect

    expect(slotButton.className).not.toContain('bg-blue-500');
  });

  it('pre-fills start and end time inputs when a slot is selected', async () => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots).mockResolvedValue([SLOT_A]);

    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();

    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-04-10' } });

    const slotButton = await screen.findByTestId('time-slot-slot-a');
    fireEvent.click(slotButton);

    const startInput = screen.getByLabelText('시작 시간') as HTMLInputElement;
    const endInput = screen.getByLabelText('종료 시간') as HTMLInputElement;

    expect(startInput.value).toBe('10:00');
    expect(endInput.value).toBe('11:00');
  });

  it('calls requestReservation (with slot ID) when a pre-set slot is selected and form is submitted', async () => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots).mockResolvedValue([SLOT_A]);
    vi.mocked(reservationService.requestReservation).mockResolvedValue({
      ...SLOT_A,
      status: 'PENDING',
    });

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();

    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-04-10' } });

    const slotButton = await screen.findByTestId('time-slot-slot-a');
    fireEvent.click(slotButton);

    fireEvent.click(screen.getByText('예약 요청'));

    await waitFor(() => {
      expect(reservationService.requestReservation).toHaveBeenCalledWith(
        'slot-a',
        '홍길동_010-1234-5678',
        '홍길동',
        '010-1234-5678',
        undefined
      );
    });

    alertMock.mockRestore();
  });

  it('refreshes slot list when date is changed to a different date', async () => {
    vi.mocked(reservationService.getAvailableWorkingHourSlots)
      .mockResolvedValueOnce([SLOT_A]) // first date selection
      .mockResolvedValueOnce([]);      // second date selection (no slots)

    render(<ClientReservation clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    openReservationForm();

    const dateInput = screen.getByLabelText('날짜');

    fireEvent.change(dateInput, { target: { value: '2026-04-10' } });
    await screen.findByTestId('time-slot-grid');

    fireEvent.change(dateInput, { target: { value: '2026-04-11' } });
    await waitFor(() => {
      expect(
        screen.queryByTestId('time-slot-grid')
      ).not.toBeInTheDocument();
    });
  });
});
