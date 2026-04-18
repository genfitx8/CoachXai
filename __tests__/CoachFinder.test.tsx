import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { CoachFinder } from '../components/CoachFinder';
import { coachFinderService } from '../services/coachFinderService';
import { ClientProfile, CoachFinderResult } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/coachFinderService', () => ({
  coachFinderService: {
    searchByRegion: vi.fn(),
    searchNearby: vi.fn(),
  },
  getCurrentPosition: vi.fn(),
}));

vi.mock('../services/lessonInquiryService', () => ({
  lessonInquiryService: {
    createInquiry: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_CLIENT: ClientProfile = {
  name: '홍길동',
  phone: '010-1234-5678',
  coachId: 'coach1',
};

const makeCoach = (overrides: Partial<CoachFinderResult> = {}): CoachFinderResult => ({
  id: 'coach1',
  name: '김테스트',
  email: 'test@coach.com',
  region: '서울 강남구',
  introduction: '안녕하세요 코치입니다.',
  isLessonAvailable: true,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CoachFinder', () => {
  beforeEach(() => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([]);
    vi.mocked(coachFinderService.searchNearby).mockResolvedValue([]);
  });

  it('renders the coach finder header', async () => {
    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    expect(screen.getByText('코치 찾기')).toBeInTheDocument();
  });

  it('renders mode selector with 지역 선택 and 현재 위치', async () => {
    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);
    expect(screen.getByText('지역 선택')).toBeInTheDocument();
    expect(screen.getByText('현재 위치')).toBeInTheDocument();
  });

  it('shows empty state when no coaches found', async () => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([]);

    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
    });
  });

  it('displays coach cards when coaches are returned', async () => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([makeCoach()]);

    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('김테스트')).toBeInTheDocument();
    });
    // Region text appears in coach card (and possibly quick-picks), use getAllByText
    const regionMatches = screen.getAllByText('서울 강남구');
    expect(regionMatches.length).toBeGreaterThan(0);
  });

  it('shows lesson available badge for available coach', async () => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([makeCoach({ isLessonAvailable: true })]);

    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('레슨 가능')).toBeInTheDocument();
    });
  });

  it('shows lesson unavailable badge for unavailable coach', async () => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([makeCoach({ isLessonAvailable: false })]);

    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);

    await waitFor(() => {
      // "레슨 불가" appears in the badge and in the CTA - check at least one exists
      const badges = screen.getAllByText('레슨 불가');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('shows count of coaches found', async () => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([
      makeCoach({ id: 'c1', name: '코치A' }),
      makeCoach({ id: 'c2', name: '코치B' }),
    ]);

    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('2명의 코치를 찾았습니다')).toBeInTheDocument();
    });
  });

  it('calls searchByRegion with the entered term on submit', async () => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([]);

    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);

    const input = screen.getByPlaceholderText('지역명 입력 (예: 강남, 수원)');
    fireEvent.change(input, { target: { value: '강남' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(coachFinderService.searchByRegion).toHaveBeenCalledWith('강남');
    });
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={onBack} />);

    fireEvent.click(screen.getByLabelText('뒤로 가기'));
    expect(onBack).toHaveBeenCalled();
  });

  it('expands coach detail when expand button is clicked', async () => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([makeCoach()]);

    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('김테스트')).toBeInTheDocument();
    });

    // Click expand
    fireEvent.click(screen.getByLabelText('더 보기'));

    expect(screen.getByText('안녕하세요 코치입니다.')).toBeInTheDocument();
    expect(screen.getByText('레슨 문의하기')).toBeInTheDocument();
  });

  it('opens inquiry modal when inquiry button is clicked', async () => {
    vi.mocked(coachFinderService.searchByRegion).mockResolvedValue([makeCoach()]);

    render(<CoachFinder clientProfile={MOCK_CLIENT} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('김테스트')).toBeInTheDocument();
    });

    // Click the inline "레슨 문의" CTA in the collapsed card (first match)
    const inquiryBtns = screen.getAllByText('레슨 문의');
    fireEvent.click(inquiryBtns[0]);

    // Inquiry modal should appear with coach-specific subtitle
    expect(screen.getByText('김테스트 코치님께 문의')).toBeInTheDocument();
  });
});
