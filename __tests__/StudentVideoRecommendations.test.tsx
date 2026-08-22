/**
 * 추천 영상 card: what the student actually sees.
 *
 * 1. Resolved videos render as links out to YouTube, with the reason line
 *    that says which record produced them.
 * 2. A topic the backend could not fill still offers the YouTube search —
 *    never an empty slot.
 * 3. A student with no records sees no card at all.
 * 4. Refresh bypasses the local cache.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { Homework, Lesson } from '../types';

const getVideoRecommendations = vi.fn();

vi.mock('../services/youtubeRecommendationService', async () => {
  const actual = await vi.importActual<
    typeof import('../services/youtubeRecommendationService')
  >('../services/youtubeRecommendationService');
  return {
    ...actual,
    getVideoRecommendations: (...args: unknown[]) => getVideoRecommendations(...args),
  };
});

vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'ko', setLanguage: vi.fn() }),
}));

const { StudentVideoRecommendations } = await import('../components/StudentVideoRecommendations');

const lesson: Lesson = {
  id: 'lesson-1',
  clientId: '홍길동_01011112222',
  coachId: 'coach-1',
  title: '레슨',
  date: '2026-08-20',
  createdAt: Date.parse('2026-08-20T00:00:00Z'),
  approvalStatus: 'approved',
  approvedAt: Date.parse('2026-08-20T01:00:00Z'),
  reviewSections: { nextActions: ['슬라이스 교정에 집중'] },
} as unknown as Lesson;

const homework: Homework[] = [];

const slice = {
  topicId: 'slice',
  label: '슬라이스 교정',
  blurb: '공이 오른쪽으로 휘는 아웃-인 궤도를 잡는 드릴',
  reason: '지난 레슨 다음 액션 · 슬라이스 교정에 집중',
  query: '골프 슬라이스 교정 드릴 레슨',
  searchUrl: 'https://www.youtube.com/results?search_query=%EA%B3%A8%ED%94%84',
  videos: [
    {
      videoId: 'vid1',
      title: '3분 만에 잡는 슬라이스',
      channelTitle: '골프코치TV',
      thumbnailUrl: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=vid1',
      publishedAt: '2026-01-01T00:00:00Z',
    },
  ],
};

describe('StudentVideoRecommendations', () => {
  beforeEach(() => {
    getVideoRecommendations.mockReset();
  });

  it('renders resolved videos as links to YouTube', async () => {
    getVideoRecommendations.mockResolvedValue([slice]);

    render(<StudentVideoRecommendations lessons={[lesson]} homework={homework} />);

    expect(await screen.findByText('슬라이스 교정')).toBeInTheDocument();
    expect(screen.getByText('지난 레슨 다음 액션 · 슬라이스 교정에 집중')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /3분 만에 잡는 슬라이스/ });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=vid1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('골프코치TV')).toBeInTheDocument();
  });

  it('offers a YouTube search when no video could be resolved', async () => {
    getVideoRecommendations.mockResolvedValue([{ ...slice, videos: [] }]);

    render(<StudentVideoRecommendations lessons={[lesson]} homework={homework} />);

    const search = await screen.findByRole('link', { name: 'YouTube에서 검색' });
    expect(search).toHaveAttribute('href', slice.searchUrl);
  });

  it('renders nothing for a student with no records', async () => {
    getVideoRecommendations.mockResolvedValue([]);

    const { container } = render(
      <StudentVideoRecommendations lessons={[]} homework={[]} />
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    // No records means no request at all — the card never costs API quota
    // for a student who has nothing to practise yet.
    expect(getVideoRecommendations).not.toHaveBeenCalled();
  });

  it('re-asks with force when the student taps refresh', async () => {
    getVideoRecommendations.mockResolvedValue([slice]);

    render(<StudentVideoRecommendations lessons={[lesson]} homework={homework} />);
    await screen.findByText('슬라이스 교정');

    expect(getVideoRecommendations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ force: false })
    );

    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

    await waitFor(() =>
      expect(getVideoRecommendations).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ force: true })
      )
    );
  });
});
