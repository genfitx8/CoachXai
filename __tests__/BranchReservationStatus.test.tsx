import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { BranchReservationStatus } from '../components/BranchReservationStatus';
import { bayReservationService } from '../services/bayReservationService';
import { reservationService } from '../services/reservationService';
import { Bay, BayReservation } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/bayReservationService', () => ({
  bayReservationService: {
    getBranchReservations: vi.fn(),
    getBranchBays: vi.fn(),
    approveCancellation: vi.fn(),
    rejectCancellation: vi.fn(),
  },
}));

vi.mock('../services/reservationService', () => ({
  reservationService: {
    getAdminPendingReservations: vi.fn(),
    confirmReservationByAdmin: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_BAYS: Bay[] = [
  {
    id: 'bay1',
    branchId: 'branch1',
    floor: '1',
    roomNumber: '01',
    isActive: true,
    createdAt: 1000,
  },
  {
    id: 'bay2',
    branchId: 'branch1',
    floor: '2',
    roomNumber: '05',
    isActive: true,
    createdAt: 1001,
  },
];

const MOCK_RESERVATIONS: BayReservation[] = [
  {
    id: 'res1',
    branchId: 'branch1',
    bayId: 'bay1',
    startTime: '2026-03-25T10:00:00',
    endTime: '2026-03-25T11:00:00',
    clientId: '홍길동_010-1234-5678',
    clientName: '홍길동',
    clientPhone: '010-1234-5678',
    paidPoints: 50,
    status: 'CONFIRMED',
    createdAt: 2000,
  },
  {
    id: 'res2',
    branchId: 'branch1',
    bayId: 'bay2',
    startTime: '2026-03-26T14:00:00',
    endTime: '2026-03-26T15:00:00',
    clientId: '김영희_010-9876-5432',
    clientName: '김영희',
    clientPhone: '010-9876-5432',
    paidPoints: 60,
    status: 'CANCEL_REQUESTED',
    createdAt: 3000,
    cancelRequestedAt: 4000,
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BranchReservationStatus', () => {
  beforeEach(() => {
    vi.mocked(bayReservationService.getBranchReservations).mockResolvedValue(
      MOCK_RESERVATIONS
    );
    vi.mocked(bayReservationService.getBranchBays).mockResolvedValue(MOCK_BAYS);
    vi.mocked(reservationService.getAdminPendingReservations).mockResolvedValue([]);
  });

  it('renders the reservation status section heading', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    expect(await screen.findByText('타석 예약 현황')).toBeInTheDocument();
  });

  it('displays reservation list after loading', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('김영희')).toBeInTheDocument();
  });

  it('shows bay labels for each reservation', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      // Bay labels appear in both the filter dropdown and the reservation cards
      expect(screen.getAllByText('1층 01번').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('2층 05번').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows correct status badges', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      expect(screen.getByText('예약 확정')).toBeInTheDocument();
      expect(screen.getByText('취소 요청')).toBeInTheDocument();
    });
  });

  it('shows cancel request alert when there are pending cancel requests', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      const alert = screen.getByTestId('cancel-request-alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toContain('1건이 처리를 기다리고 있습니다');
    });
  });

  it('shows approve and reject buttons for CANCEL_REQUESTED reservations', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      expect(screen.getByText('취소 승인')).toBeInTheDocument();
      expect(screen.getByText('취소 거절')).toBeInTheDocument();
    });
  });

  it('does NOT show action buttons for CONFIRMED reservations', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      // Only one approve/reject pair for res2 (CANCEL_REQUESTED)
      expect(screen.getAllByText('취소 승인')).toHaveLength(1);
    });
  });

  it('calls approveCancellation when approve button is clicked', async () => {
    vi.mocked(bayReservationService.approveCancellation).mockResolvedValue();
    render(<BranchReservationStatus branchId="branch1" />);
    const approveBtn = await screen.findByText('취소 승인');
    fireEvent.click(approveBtn);
    await waitFor(() => {
      expect(bayReservationService.approveCancellation).toHaveBeenCalledWith('res2');
    });
  });

  it('calls rejectCancellation when reject button is clicked', async () => {
    vi.mocked(bayReservationService.rejectCancellation).mockResolvedValue();
    render(<BranchReservationStatus branchId="branch1" />);
    const rejectBtn = await screen.findByText('취소 거절');
    fireEvent.click(rejectBtn);
    await waitFor(() => {
      expect(bayReservationService.rejectCancellation).toHaveBeenCalledWith('res2');
    });
  });

  it('shows empty state when no reservations exist', async () => {
    vi.mocked(bayReservationService.getBranchReservations).mockResolvedValue([]);
    render(<BranchReservationStatus branchId="branch1" />);
    expect(
      await screen.findByText('해당 기간에 예약이 없습니다.')
    ).toBeInTheDocument();
  });

  it('filters by bay when bay filter is changed', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
    });

    // Select bay1 filter — first <select> is the bay dropdown
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'bay1' } });

    // Only bay1 reservation (홍길동) should be visible; 김영희 (bay2) should not
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
      expect(screen.queryByText('김영희')).not.toBeInTheDocument();
    });
  });

  it('filters by status when status filter is changed', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
    });

    // Select CONFIRMED filter — second <select> is the status dropdown
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'CONFIRMED' } });

    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
      expect(screen.queryByText('김영희')).not.toBeInTheDocument();
    });
  });

  it('calls getBranchReservations with branchId', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      expect(bayReservationService.getBranchReservations).toHaveBeenCalledWith(
        'branch1',
        expect.any(String),
        expect.any(String)
      );
    });
  });

  it('shows total reservation count summary', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      const summary = screen.getByTestId('reservation-summary');
      expect(summary).toBeInTheDocument();
      expect(summary.textContent).toContain('2');
      expect(summary.textContent).toContain('건의 예약이 있습니다');
    });
  });

  it('renders phone number for each reservation', async () => {
    render(<BranchReservationStatus branchId="branch1" />);
    await waitFor(() => {
      expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
      expect(screen.getByText('010-9876-5432')).toBeInTheDocument();
    });
  });
});
