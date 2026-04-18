import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { CoachLessonReservationModal } from '../components/CoachLessonReservationModal';
import { reservationService } from '../services/reservationService';
import { bayReservationService } from '../services/bayReservationService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { CoachProfile, ClientProfile, Branch, Bay } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/reservationService', () => ({
  reservationService: {
    createCoachMadeLessonReservation: vi.fn(),
  },
}));

vi.mock('../services/bayReservationService', () => ({
  bayReservationService: {
    getActiveBranches: vi.fn(),
    getAvailableTimeSlots: vi.fn(),
    getAvailableBays: vi.fn(),
    createReservation: vi.fn(),
  },
}));

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    getClients: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getClients: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COACH: CoachProfile = {
  id: 'coach1',
  name: '박코치',
  email: 'coach@example.com',
};

const MEMBER_KIM: ClientProfile = {
  name: '김회원',
  phone: '010-1111-2222',
  coachId: 'coach1',
  currentPoints: 200,
};

const MEMBER_LEE: ClientProfile = {
  name: '이회원',
  phone: '010-3333-4444',
  coachId: 'coach1',
  currentPoints: 100,
};

const MEMBER_DUPLICATE: ClientProfile = {
  name: '김회원',
  phone: '010-9999-8888',
  coachId: 'coach1',
  currentPoints: 50,
};

const SAMPLE_BRANCH: Branch = {
  id: 'branch1',
  name: '강남점',
  holidays: [],
  isActive: true,
  createdAt: 1000,
  openingHours: {
    mon: { open: '09:00', close: '22:00', isClosed: false },
    tue: { open: '09:00', close: '22:00', isClosed: false },
    wed: { open: '09:00', close: '22:00', isClosed: false },
    thu: { open: '09:00', close: '22:00', isClosed: false },
    fri: { open: '09:00', close: '22:00', isClosed: false },
    sat: { open: '09:00', close: '22:00', isClosed: false },
    sun: { open: '09:00', close: '22:00', isClosed: false },
  },
};

const SAMPLE_BAY: Bay = {
  id: 'bay1',
  branchId: 'branch1',
  floor: '1',
  roomNumber: '01',
  isActive: true,
  createdAt: 1000,
};

const DEFAULT_PROPS = {
  coachProfile: COACH,
  initialDate: '2026-04-01',
  initialHour: 10,
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupStorage(clients: ClientProfile[] = [MEMBER_KIM, MEMBER_LEE]) {
  vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
  vi.mocked(storageService.getClients).mockReturnValue(clients);
}

function setupFirebase(clients: ClientProfile[] = [MEMBER_KIM, MEMBER_LEE]) {
  vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
  vi.mocked(firebaseService.getClients).mockResolvedValue(clients);
}

/**
 * After selecting a branch, the time slot grid renders.
 * Use `getAllByRole('button')` and pick the first one whose text starts
 * with the formatted hour ("10:00") and contains "pt" (price), which
 * uniquely distinguishes time-slot buttons from the hour <select> options.
 */
async function clickTimeSlotButton(startHour: number) {
  const hourLabel = `${String(startHour).padStart(2, '0')}:00`;
  await waitFor(() => {
    const allButtons = screen.getAllByRole('button');
    const slotBtn = allButtons.find((b) => {
      const txt = b.textContent ?? '';
      return txt.startsWith(hourLabel) && txt.includes('pt');
    });
    expect(slotBtn).toBeDefined();
  });
  const allButtons = screen.getAllByRole('button');
  const slotBtn = allButtons.find((b) => {
    const txt = b.textContent ?? '';
    return txt.startsWith(hourLabel) && txt.includes('pt');
  });
  if (slotBtn) fireEvent.click(slotBtn);
}

/** Select a member, open the bay section, pick a branch, time slot, and bay. */
async function setupBayFlow() {
  // Select member
  const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
  fireEvent.change(searchInput, { target: { value: '김' } });
  await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
  fireEvent.click(screen.getByText('김회원'));

  // Open bay section
  fireEvent.click(screen.getByText(/타석도 함께 예약하기/));
  await waitFor(() => expect(screen.getByText('지점 선택')).toBeInTheDocument());

  // Select branch
  const branchSelect = screen.getByDisplayValue('-- 지점 선택 --');
  fireEvent.change(branchSelect, { target: { value: 'branch1' } });

  // Click the time slot button (10:00)
  await clickTimeSlotButton(10);

  // Select bay
  await waitFor(() => expect(screen.getByText(/1층 01번/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/1층 01번/));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CoachLessonReservationModal – rendering', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupStorage();
    vi.mocked(reservationService.createCoachMadeLessonReservation).mockResolvedValue({
      id: 'res1',
      coachId: 'coach1',
      coachName: '박코치',
      startTime: '2026-04-01T10:00:00',
      endTime: '2026-04-01T11:00:00',
      status: 'CONFIRMED',
      createdByCoachId: 'coach1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('renders the modal title', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    expect(screen.getByText('회원 레슨 예약 등록')).toBeInTheDocument();
  });

  it('pre-fills the date from initialDate prop', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    const dateInput = screen.getByDisplayValue('2026-04-01');
    expect(dateInput).toBeInTheDocument();
  });

  it('pre-fills the hour from initialHour prop', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    const hourSelect = screen.getByDisplayValue(/10:00/);
    expect(hourSelect).toBeInTheDocument();
  });

  it('shows the member search input', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    expect(screen.getByPlaceholderText('이름 또는 전화번호로 검색')).toBeInTheDocument();
  });

  it('shows the save button', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    expect(screen.getByText('예약 등록')).toBeInTheDocument();
  });

  it('shows the cancel button', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    expect(screen.getByText('취소')).toBeInTheDocument();
  });
});

// ── Member search ─────────────────────────────────────────────────────────────

describe('CoachLessonReservationModal – member search', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupStorage();
    vi.mocked(reservationService.createCoachMadeLessonReservation).mockResolvedValue({
      id: 'res1',
      coachId: 'coach1',
      coachName: '박코치',
      startTime: '2026-04-01T10:00:00',
      endTime: '2026-04-01T11:00:00',
      status: 'CONFIRMED',
      createdByCoachId: 'coach1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('shows search results when a name is typed', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });

    await waitFor(() => {
      expect(screen.getByText('김회원')).toBeInTheDocument();
    });
  });

  it('shows phone number alongside name in search results', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });

    await waitFor(() => {
      expect(screen.getByText('010-1111-2222')).toBeInTheDocument();
    });
  });

  it('selecting a member from results shows the member card', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김회원' } });

    await waitFor(() => {
      expect(screen.getByText('김회원')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('김회원'));

    await waitFor(() => {
      // Selected member card should appear; the search input should disappear
      expect(screen.queryByPlaceholderText('이름 또는 전화번호로 검색')).not.toBeInTheDocument();
      // The selected member name should still be visible in the card
      expect(screen.getByText('010-1111-2222')).toBeInTheDocument();
    });
  });

  it('shows "검색 결과가 없습니다" when no match is found', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '없는회원' } });

    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
    });
  });

  it('can deselect a member by clicking the X on the member card', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });

    await waitFor(() => {
      expect(screen.getByText('김회원')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('김회원'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('이름 또는 전화번호로 검색')).not.toBeInTheDocument();
    });

    // Click the deselect button
    fireEvent.click(screen.getByLabelText('회원 선택 취소'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('이름 또는 전화번호로 검색')).toBeInTheDocument();
    });
  });

  it('shows both entries when duplicate names exist (distinguishable by phone)', async () => {
    setupStorage([MEMBER_KIM, MEMBER_DUPLICATE]);
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김회원' } });

    await waitFor(() => {
      expect(screen.getByText('010-1111-2222')).toBeInTheDocument();
      expect(screen.getByText('010-9999-8888')).toBeInTheDocument();
    });
  });

  it('also searches by phone number', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '010-3333' } });

    await waitFor(() => {
      expect(screen.getByText('이회원')).toBeInTheDocument();
    });
  });

  it('loads clients from Firebase when initialized', async () => {
    setupFirebase([MEMBER_KIM]);
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });

    await waitFor(() => {
      expect(screen.getByText('김회원')).toBeInTheDocument();
    });
    expect(firebaseService.getClients).toHaveBeenCalled();
  });
});

// ── Reservation creation ──────────────────────────────────────────────────────

describe('CoachLessonReservationModal – reservation creation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupStorage();
    vi.mocked(reservationService.createCoachMadeLessonReservation).mockResolvedValue({
      id: 'res1',
      coachId: 'coach1',
      coachName: '박코치',
      startTime: '2026-04-01T10:00:00',
      endTime: '2026-04-01T11:00:00',
      status: 'CONFIRMED',
      createdByCoachId: 'coach1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('save button is disabled when no member is selected', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const saveButton = screen.getByText('예약 등록');
    expect(saveButton).toBeDisabled();
    expect(reservationService.createCoachMadeLessonReservation).not.toHaveBeenCalled();
  });

  it('calls createCoachMadeLessonReservation with correct args after member selection', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    // Select a member
    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));

    // Submit
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(reservationService.createCoachMadeLessonReservation).toHaveBeenCalledWith(
        'coach1',       // coachId
        '박코치',       // coachName
        '김회원_010-1111-2222', // clientId
        '김회원',       // clientName
        '010-1111-2222',// clientPhone
        '2026-04-01T10:00:00', // startTime
        '2026-04-01T11:00:00', // endTime
        undefined       // notes (empty)
      );
    });
  });

  it('passes notes to createCoachMadeLessonReservation when provided', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    // Select a member
    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));

    // Enter notes
    const notesTextarea = screen.getByPlaceholderText('레슨 내용이나 요청사항을 입력하세요');
    fireEvent.change(notesTextarea, { target: { value: '드라이버 교정' } });

    // Submit
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(reservationService.createCoachMadeLessonReservation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        '드라이버 교정'
      );
    });
  });

  it('shows success message after reservation is created', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(screen.getByText(/레슨 예약이 완료되었습니다/)).toBeInTheDocument();
    });
  });

  it('calls onSaved and onClose when the success confirm button is clicked', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <CoachLessonReservationModal
        {...DEFAULT_PROPS}
        onSaved={onSaved}
        onClose={onClose}
      />
    );

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() =>
      expect(screen.getByText(/레슨 예약이 완료되었습니다/)).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText('확인'));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error message when reservation creation fails (conflict)', async () => {
    vi.mocked(reservationService.createCoachMadeLessonReservation).mockRejectedValue(
      new Error('선택하신 시간은 이미 다른 예약이 있습니다.')
    );

    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(
        screen.getByText('선택하신 시간은 이미 다른 예약이 있습니다.')
      ).toBeInTheDocument();
    });
  });

  it('shows error message when a blocked slot is chosen', async () => {
    vi.mocked(reservationService.createCoachMadeLessonReservation).mockRejectedValue(
      new Error('선택하신 시간은 예약이 불가능합니다. (사유: 블럭된 시간)')
    );

    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(
        screen.getByText(/선택하신 시간은 예약이 불가능합니다/)
      ).toBeInTheDocument();
    });
  });

  it('calls onClose when the cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} onClose={onClose} />);

    fireEvent.click(screen.getByText('취소'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the reservation is saved as CONFIRMED (coach-made) with createdByCoachId', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() =>
      expect(reservationService.createCoachMadeLessonReservation).toHaveBeenCalled()
    );

    // Verify the returned reservation would have the right metadata
    // (service tested separately; here we verify that the coach ID is passed)
    const [coachId] = vi.mocked(
      reservationService.createCoachMadeLessonReservation
    ).mock.calls[0];
    expect(coachId).toBe('coach1');
  });
});

// ── Optional bay reservation ──────────────────────────────────────────────────

describe('CoachLessonReservationModal – optional bay reservation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupStorage();
    vi.mocked(reservationService.createCoachMadeLessonReservation).mockResolvedValue({
      id: 'res1',
      coachId: 'coach1',
      coachName: '박코치',
      startTime: '2026-04-01T10:00:00',
      endTime: '2026-04-01T11:00:00',
      status: 'CONFIRMED',
      createdByCoachId: 'coach1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    vi.mocked(bayReservationService.getActiveBranches).mockResolvedValue([SAMPLE_BRANCH]);
    vi.mocked(bayReservationService.getAvailableTimeSlots).mockResolvedValue([
      { startHour: 10, startTime: '2026-04-01T10:00:00', endTime: '2026-04-01T11:00:00', pricePoints: 50 },
    ]);
    vi.mocked(bayReservationService.getAvailableBays).mockResolvedValue([
      { bay: SAMPLE_BAY, pricePoints: 50 },
    ]);
    vi.mocked(bayReservationService.createReservation).mockResolvedValue({
      reservation: {
        id: 'branch1_bay1_20260401_10',
        branchId: 'branch1',
        bayId: 'bay1',
        startTime: '2026-04-01T10:00:00',
        endTime: '2026-04-01T11:00:00',
        clientId: '김회원_010-1111-2222',
        clientName: '김회원',
        clientPhone: '010-1111-2222',
        paidPoints: 50,
        status: 'CONFIRMED',
        createdAt: Date.now(),
      },
      updatedClient: { ...MEMBER_KIM, currentPoints: 150 },
    });
  });

  it('does not show bay section by default', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    expect(screen.queryByText('지점 선택')).not.toBeInTheDocument();
  });

  it('shows bay section when "타석도 함께 예약하기" is clicked', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    fireEvent.click(screen.getByText(/타석도 함께 예약하기/));

    await waitFor(() => {
      expect(screen.getByText('지점 선택')).toBeInTheDocument();
    });
  });

  it('loads branches when bay section is opened', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText(/타석도 함께 예약하기/));

    await waitFor(() => {
      expect(bayReservationService.getActiveBranches).toHaveBeenCalled();
    });
  });

  it('creates both lesson and bay reservation on save', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    await setupBayFlow();

    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(reservationService.createCoachMadeLessonReservation).toHaveBeenCalled();
      expect(bayReservationService.createReservation).toHaveBeenCalledWith({
        branch: SAMPLE_BRANCH,
        bay: SAMPLE_BAY,
        date: '2026-04-01',
        startHour: 10,
        client: MEMBER_KIM,
      });
    });
  });

  it('shows combined success message after both are saved', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    await setupBayFlow();

    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(screen.getByText(/타석 예약도 함께 완료되었습니다/)).toBeInTheDocument();
    });
  });

  it('still shows lesson success when bay reservation fails', async () => {
    vi.mocked(bayReservationService.createReservation).mockRejectedValue(
      new Error('포인트가 부족합니다.')
    );

    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);
    await setupBayFlow();

    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(screen.getByText(/레슨 예약이 완료되었습니다/)).toBeInTheDocument();
      expect(screen.getByText(/타석 예약 실패/)).toBeInTheDocument();
      expect(screen.getByText(/포인트가 부족합니다/)).toBeInTheDocument();
    });
  });

  it('lesson is still saved when bay is not selected', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    // Select member
    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));

    // Open bay section but do NOT select a bay
    fireEvent.click(screen.getByText(/타석도 함께 예약하기/));

    // Submit without selecting bay
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => {
      expect(reservationService.createCoachMadeLessonReservation).toHaveBeenCalled();
      expect(bayReservationService.createReservation).not.toHaveBeenCalled();
    });
  });
});

// ── Authorization guard ───────────────────────────────────────────────────────

describe('CoachLessonReservationModal – authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupStorage();
    vi.mocked(reservationService.createCoachMadeLessonReservation).mockResolvedValue({
      id: 'res1',
      coachId: 'coach1',
      coachName: '박코치',
      startTime: '2026-04-01T10:00:00',
      endTime: '2026-04-01T11:00:00',
      status: 'CONFIRMED',
      createdByCoachId: 'coach1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('only loads clients belonging to this coach (or unassigned clients)', async () => {
    const otherCoachMember: ClientProfile = {
      name: '다른코치회원',
      phone: '010-0000-1111',
      coachId: 'other-coach',  // belongs to a different coach
    };
    setupStorage([MEMBER_KIM, otherCoachMember]);

    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '다른코치' } });

    await waitFor(() => {
      // The other-coach member should not appear in search results
      expect(screen.queryByText('다른코치회원')).not.toBeInTheDocument();
    });
  });

  it('reservation is attributed to the current coach (createdByCoachId)', async () => {
    render(<CoachLessonReservationModal {...DEFAULT_PROPS} />);

    const searchInput = screen.getByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '김' } });
    await waitFor(() => expect(screen.getByText('김회원')).toBeInTheDocument());
    fireEvent.click(screen.getByText('김회원'));
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() =>
      expect(reservationService.createCoachMadeLessonReservation).toHaveBeenCalled()
    );

    // First arg is coachId — must match the signed-in coach
    const [coachId] = vi.mocked(
      reservationService.createCoachMadeLessonReservation
    ).mock.calls[0];
    expect(coachId).toBe(COACH.id);
  });
});
