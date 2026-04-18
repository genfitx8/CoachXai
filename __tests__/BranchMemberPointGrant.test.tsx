import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { BranchMemberPointGrant } from '../components/BranchMemberPointGrant';
import { pointService } from '../services/pointService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { ClientProfile } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

vi.mock('../services/pointService', () => ({
  pointService: {
    grantPoints: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_CLIENTS: ClientProfile[] = [
  {
    name: '홍길동',
    phone: '010-1234-5678',
    currentPoints: 100,
  },
  {
    name: '김영희',
    phone: '010-9876-5432',
    currentPoints: 200,
  },
];

const DEFAULT_PROPS = {
  branchAdminUsername: 'admin1',
  onSuccess: vi.fn(),
  onError: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BranchMemberPointGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    vi.mocked(storageService.getClients).mockReturnValue(MOCK_CLIENTS);
  });

  // 1. Access control / rendering
  it('renders the heading for branch manager', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    expect(await screen.findByText('회원 포인트 지급')).toBeInTheDocument();
  });

  it('renders member search input', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    expect(await screen.findByPlaceholderText('이름 또는 전화번호로 검색')).toBeInTheDocument();
  });

  it('renders points input field', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    expect(await screen.findByLabelText('지급 포인트')).toBeInTheDocument();
  });

  it('renders memo input field', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    expect(await screen.findByLabelText('사유 메모')).toBeInTheDocument();
  });

  it('renders submit button', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    expect(await screen.findByText('포인트 지급')).toBeInTheDocument();
  });

  // 2. Member search / select
  it('shows matching members when searching by name', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
    });
  });

  it('shows matching members when searching by phone', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '9876' } });
    await waitFor(() => {
      expect(screen.getByText('김영희')).toBeInTheDocument();
    });
  });

  it('shows no results message when search yields nothing', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '없는회원' } });
    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
    });
  });

  it('shows selected member card after selecting a client', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    const memberBtn = await screen.findByText('홍길동');
    fireEvent.click(memberBtn);
    await waitFor(() => {
      expect(screen.getByTestId('selected-member-card')).toBeInTheDocument();
    });
  });

  it('displays current point balance in the selected member card', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));
    await waitFor(() => {
      expect(screen.getByTestId('selected-member-card').textContent).toContain('100');
    });
  });

  // 3. Invalid input validation
  it('calls onError when submitting with no member selected', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const submitBtn = await screen.findByText('포인트 지급');
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(DEFAULT_PROPS.onError).toHaveBeenCalledWith('회원을 선택해 주세요.');
    });
    expect(pointService.grantPoints).not.toHaveBeenCalled();
  });

  it('calls onError when submitting with empty points input', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    // Select a member
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));
    // Submit without entering points
    fireEvent.click(screen.getByText('포인트 지급'));
    await waitFor(() => {
      expect(DEFAULT_PROPS.onError).toHaveBeenCalledWith('지급할 포인트를 입력해 주세요.');
    });
    expect(pointService.grantPoints).not.toHaveBeenCalled();
  });

  it('calls onError when submitting with zero points', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));
    const pointsInput = screen.getByLabelText('지급 포인트');
    fireEvent.change(pointsInput, { target: { value: '0' } });
    fireEvent.click(screen.getByText('포인트 지급'));
    await waitFor(() => {
      expect(DEFAULT_PROPS.onError).toHaveBeenCalledWith(
        '포인트는 1 이상의 양수여야 합니다.'
      );
    });
    expect(pointService.grantPoints).not.toHaveBeenCalled();
  });

  it('calls onError when submitting with negative points', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));
    const pointsInput = screen.getByLabelText('지급 포인트');
    fireEvent.change(pointsInput, { target: { value: '-50' } });
    fireEvent.click(screen.getByText('포인트 지급'));
    await waitFor(() => {
      expect(DEFAULT_PROPS.onError).toHaveBeenCalledWith(
        '포인트는 1 이상의 양수여야 합니다.'
      );
    });
    expect(pointService.grantPoints).not.toHaveBeenCalled();
  });

  it('calls onError when submitting with non-numeric points', async () => {
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));
    const pointsInput = screen.getByLabelText('지급 포인트');
    fireEvent.change(pointsInput, { target: { value: 'abc' } });
    fireEvent.click(screen.getByText('포인트 지급'));
    await waitFor(() => {
      expect(DEFAULT_PROPS.onError).toHaveBeenCalled();
    });
    expect(pointService.grantPoints).not.toHaveBeenCalled();
  });

  // 4. Successful point granting
  it('calls pointService.grantPoints with correct arguments on valid submission', async () => {
    const updatedClient = { ...MOCK_CLIENTS[0], currentPoints: 600 };
    vi.mocked(pointService.grantPoints).mockResolvedValue(updatedClient);

    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));

    const pointsInput = screen.getByLabelText('지급 포인트');
    fireEvent.change(pointsInput, { target: { value: '500' } });

    fireEvent.click(screen.getByText('포인트 지급'));

    await waitFor(() => {
      expect(pointService.grantPoints).toHaveBeenCalledWith(
        MOCK_CLIENTS[0],
        500,
        'admin1',
        undefined
      );
    });
  });

  it('passes memo to pointService.grantPoints when provided', async () => {
    const updatedClient = { ...MOCK_CLIENTS[0], currentPoints: 600 };
    vi.mocked(pointService.grantPoints).mockResolvedValue(updatedClient);

    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));

    const pointsInput = screen.getByLabelText('지급 포인트');
    fireEvent.change(pointsInput, { target: { value: '500' } });

    const memoInput = screen.getByLabelText('사유 메모');
    fireEvent.change(memoInput, { target: { value: '이벤트 참여 보상' } });

    fireEvent.click(screen.getByText('포인트 지급'));

    await waitFor(() => {
      expect(pointService.grantPoints).toHaveBeenCalledWith(
        MOCK_CLIENTS[0],
        500,
        'admin1',
        '이벤트 참여 보상'
      );
    });
  });

  it('calls onSuccess with a descriptive message after granting points', async () => {
    const updatedClient = { ...MOCK_CLIENTS[0], currentPoints: 600 };
    vi.mocked(pointService.grantPoints).mockResolvedValue(updatedClient);

    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));

    fireEvent.change(screen.getByLabelText('지급 포인트'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('포인트 지급'));

    await waitFor(() => {
      expect(DEFAULT_PROPS.onSuccess).toHaveBeenCalledWith(
        expect.stringContaining('500')
      );
    });
  });

  // 5. Balance update after granting
  it('updates the displayed balance after successful grant', async () => {
    const updatedClient = { ...MOCK_CLIENTS[0], currentPoints: 600 };
    vi.mocked(pointService.grantPoints).mockResolvedValue(updatedClient);

    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));

    fireEvent.change(screen.getByLabelText('지급 포인트'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('포인트 지급'));

    await waitFor(() => {
      expect(screen.getByTestId('selected-member-card').textContent).toContain('600');
    });
  });

  // 6. Duplicate submission prevention
  it('disables submit button during submission to prevent duplicates', async () => {
    let resolveGrant!: (value: ClientProfile) => void;
    vi.mocked(pointService.grantPoints).mockReturnValue(
      new Promise<ClientProfile>((resolve) => {
        resolveGrant = resolve;
      })
    );

    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));
    fireEvent.change(screen.getByLabelText('지급 포인트'), { target: { value: '500' } });

    fireEvent.click(screen.getByText('포인트 지급'));

    // Button should show loading state and be disabled
    await waitFor(() => {
      expect(screen.getByText('처리 중...')).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: /처리 중/ });
    expect(btn).toBeDisabled();

    // Resolve the promise to clean up
    resolveGrant({ ...MOCK_CLIENTS[0], currentPoints: 600 });
  });

  // 7. Error handling
  it('calls onError when pointService.grantPoints throws', async () => {
    vi.mocked(pointService.grantPoints).mockRejectedValue(new Error('Network error'));

    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    const searchInput = await screen.findByPlaceholderText('이름 또는 전화번호로 검색');
    fireEvent.change(searchInput, { target: { value: '홍' } });
    fireEvent.click(await screen.findByText('홍길동'));
    fireEvent.change(screen.getByLabelText('지급 포인트'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('포인트 지급'));

    await waitFor(() => {
      expect(DEFAULT_PROPS.onError).toHaveBeenCalledWith(
        '포인트 지급 중 오류가 발생했습니다.'
      );
    });
  });

  // 8. Uses storage fallback when Firebase is not initialized
  it('loads clients from storageService when Firebase is not initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(false);
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(storageService.getClients).toHaveBeenCalled();
    });
    expect(firebaseService.getClients).not.toHaveBeenCalled();
  });

  // 9. Uses Firebase when initialized
  it('loads clients from firebaseService when Firebase is initialized', async () => {
    vi.mocked(firebaseService.isInitialized).mockReturnValue(true);
    vi.mocked(firebaseService.getClients).mockResolvedValue(MOCK_CLIENTS);
    render(<BranchMemberPointGrant {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(firebaseService.getClients).toHaveBeenCalled();
    });
    expect(storageService.getClients).not.toHaveBeenCalled();
  });
});
