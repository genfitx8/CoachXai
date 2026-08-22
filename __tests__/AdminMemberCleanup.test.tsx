import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { AdminMemberCleanup } from '../components/AdminMemberCleanup';
import { apiService, type ClientDuplicateReport } from '../services/apiService';

/**
 * 관리자 콘솔의 중복 · 유령 회원 정리 화면.
 *
 * 코치 목록에서 접혀 보이지 않게 된 잔재 행을 실제로 지우는 유일한 통로라,
 * 두 가지가 어긋나면 안 된다 — 지울 수 없는 행에는 정리 버튼이 없어야 하고,
 * 되돌릴 수 없는 삭제는 확인 없이 실행되면 안 된다.
 */

vi.mock('../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiService')>();
  return {
    ...actual,
    apiService: {
      ...actual.apiService,
      getClientDuplicates: vi.fn(),
      cleanupClientDuplicates: vi.fn(),
    },
  };
});

const report: ClientDuplicateReport = {
  totalClients: 436,
  phantomTotal: 433,
  removableTotal: 432,
  groups: [
    {
      identityKey: '01012345678|김회원',
      name: '김회원',
      phone: '010-1234-5678',
      removableCount: 2,
      members: [
        {
          id: 'signed-up',
          name: '김회원',
          phone: '010-1234-5678',
          email: 'kim@test.com',
          coachId: 'coach1',
          designatedCoach: '테스트코치',
          signedUp: true,
          referenceCount: 12,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_100_000,
          keep: true,
          removable: false,
          blockedReason: '이 사람을 대표할 행',
        },
        {
          id: 'phantom-1',
          name: '김회원',
          phone: '01012345678',
          email: null,
          coachId: 'coach1',
          designatedCoach: '테스트코치',
          signedUp: false,
          referenceCount: 0,
          createdAt: 1_700_000_200_000,
          updatedAt: 1_700_000_200_000,
          keep: false,
          removable: true,
          blockedReason: null,
        },
        {
          id: 'phantom-2',
          name: '김 회원',
          phone: '010-1234-5678',
          email: null,
          coachId: 'coach1',
          designatedCoach: '테스트코치',
          signedUp: false,
          referenceCount: 0,
          createdAt: 1_700_000_300_000,
          updatedAt: 1_700_000_300_000,
          keep: false,
          removable: true,
          blockedReason: null,
        },
      ],
    },
    {
      identityKey: '01022223333|박회원',
      name: '박회원',
      phone: '010-2222-3333',
      removableCount: 0,
      members: [
        {
          id: 'anchored',
          name: '박회원',
          phone: '010-2222-3333',
          email: null,
          coachId: 'coach1',
          designatedCoach: '테스트코치',
          signedUp: false,
          referenceCount: 3,
          createdAt: 1_700_000_400_000,
          updatedAt: 1_700_000_400_000,
          keep: true,
          removable: false,
          blockedReason: '이 사람을 대표할 행',
        },
        {
          id: 'anchored-2',
          name: '박회원',
          phone: '010-2222-3333',
          email: null,
          coachId: 'coach1',
          designatedCoach: '테스트코치',
          signedUp: false,
          referenceCount: 2,
          createdAt: 1_700_000_500_000,
          updatedAt: 1_700_000_500_000,
          keep: false,
          removable: false,
          blockedReason: '연결된 데이터 2건',
        },
      ],
    },
  ],
};

describe('AdminMemberCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.getClientDuplicates).mockResolvedValue(report);
    vi.mocked(apiService.cleanupClientDuplicates).mockResolvedValue({
      deleted: 2,
      deletedIds: ['phantom-1', 'phantom-2'],
      skipped: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows how many rows the table holds and how many can go', async () => {
    render(<AdminMemberCleanup />);

    expect(await screen.findByText('436')).toBeInTheDocument();
    expect(screen.getByText('433')).toBeInTheDocument();
    expect(screen.getByTestId('cleanup-removable-total')).toHaveTextContent('432');
  });

  it('offers no cleanup button for a group whose rows all carry data', async () => {
    render(<AdminMemberCleanup />);

    const parkRow = await screen.findByText('박회원');
    fireEvent.click(parkRow.closest('button') as HTMLElement);

    expect(screen.getByText('연결된 데이터 2건')).toBeInTheDocument();
    expect(screen.queryByText(/박회원님의 잔재/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /이 회원의 잔재 .*줄 정리/ })
    ).not.toBeInTheDocument();
  });

  it('asks before deleting and sends only the removable rows', async () => {
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);
    render(<AdminMemberCleanup />);

    const kimRow = await screen.findByText('김회원');
    fireEvent.click(kimRow.closest('button') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /이 회원의 잔재 2줄 정리/ }));

    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(apiService.cleanupClientDuplicates).toHaveBeenCalledWith({
        ids: ['phantom-1', 'phantom-2'],
      })
    );
    // 지워진 뒤에는 보고서를 다시 읽어 화면을 최신 상태로 되돌린다.
    await waitFor(() => expect(apiService.getClientDuplicates).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('2줄을 정리했습니다.')).toBeInTheDocument();
  });

  it('deletes nothing when the confirmation is declined', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    render(<AdminMemberCleanup />);

    fireEvent.click(await screen.findByTestId('cleanup-all'));

    expect(apiService.cleanupClientDuplicates).not.toHaveBeenCalled();
  });

  it('reports rows the server refused to delete', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.mocked(apiService.cleanupClientDuplicates).mockResolvedValue({
      deleted: 1,
      deletedIds: ['phantom-1'],
      skipped: [{ id: 'phantom-2', name: '김 회원', reason: '로그인 계정이 있는 회원' }],
    });
    render(<AdminMemberCleanup />);

    fireEvent.click(await screen.findByTestId('cleanup-all'));

    expect(await screen.findByText('1줄을 정리했습니다.')).toBeInTheDocument();
    expect(
      screen.getByText(/건너뜀 — 김 회원: 로그인 계정이 있는 회원/)
    ).toBeInTheDocument();
  });

  it('surfaces a failed report load instead of showing an empty table', async () => {
    vi.mocked(apiService.getClientDuplicates).mockRejectedValue(new Error('HTTP 403'));
    render(<AdminMemberCleanup />);

    expect(await screen.findByText('HTTP 403')).toBeInTheDocument();
  });

  it('says so plainly when there is nothing to clean', async () => {
    vi.mocked(apiService.getClientDuplicates).mockResolvedValue({
      totalClients: 12,
      phantomTotal: 0,
      removableTotal: 0,
      groups: [],
    });
    render(<AdminMemberCleanup />);

    expect(await screen.findByText('정리할 회원 행이 없습니다')).toBeInTheDocument();
    expect(screen.queryByTestId('cleanup-all')).not.toBeInTheDocument();
  });

  it('marks the row that will be kept', async () => {
    render(<AdminMemberCleanup />);

    const kimRow = await screen.findByText('김회원');
    fireEvent.click(kimRow.closest('button') as HTMLElement);

    const rows = screen.getAllByTestId('cleanup-member-row');
    expect(within(rows[0]).getByText('남김')).toBeInTheDocument();
    expect(within(rows[1]).getByText('정리 대상')).toBeInTheDocument();
  });
});
