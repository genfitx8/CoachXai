/**
 * Regression: the swing-analysis member picker must search the signed-in
 * coach's own members only.
 *
 * `/api/clients` is scoped to the token owner for coach sessions but returns
 * the whole member table for an admin session, and the picker used to render
 * that roster verbatim — so searching for a member listed everyone in the
 * academy. Scoping by `coachId` (the same filter CoachClientManager,
 * NewLessonForm and App.coachOwnClients already apply) is the fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SwingVideoAnalysis } from '../components/posture/SwingVideoAnalysis';
import type { ClientProfile } from '../types';

vi.mock('../services/swingAnalysisService', () => ({
  swingAnalysisService: { analyzeVideo: vi.fn(), rebuildAnalysis: vi.fn() },
}));
vi.mock('../services/faultDetectionService', () => ({ detectFaults: vi.fn(() => []) }));
vi.mock('../services/aiCoachingSummaryService', () => ({
  generateSwingCoachingReport: vi.fn(),
}));
vi.mock('../services/apiService', () => ({
  apiService: { saveLesson: vi.fn(), isAvailable: () => false, getToken: () => null },
}));

const MY_COACH_ID = 'coach-mine';

const CLIENTS = [
  { id: 'c1', name: '김내회원', phone: '01011112222', coachId: MY_COACH_ID },
  { id: 'c2', name: '이내회원', phone: '01033334444', coachId: MY_COACH_ID },
  { id: 'c3', name: '박남의회원', phone: '01055556666', coachId: 'coach-other' },
  { id: 'c4', name: '최무소속회원', phone: '01077778888' },
] as ClientProfile[];

const searchBox = () => screen.getByPlaceholderText('회원 이름 또는 전화번호 검색');

describe('SwingVideoAnalysis member picker scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only the signed-in coach's members, not the whole roster", () => {
    render(<SwingVideoAnalysis clients={CLIENTS} coachId={MY_COACH_ID} />);

    expect(screen.getByText('김내회원')).toBeInTheDocument();
    expect(screen.getByText('이내회원')).toBeInTheDocument();
    expect(screen.queryByText('박남의회원')).not.toBeInTheDocument();
    expect(screen.queryByText('최무소속회원')).not.toBeInTheDocument();
  });

  it("does not surface another coach's member when searching by name", () => {
    render(<SwingVideoAnalysis clients={CLIENTS} coachId={MY_COACH_ID} />);

    fireEvent.change(searchBox(), { target: { value: '회원' } });

    expect(screen.getByText('김내회원')).toBeInTheDocument();
    expect(screen.queryByText('박남의회원')).not.toBeInTheDocument();
  });

  it("does not surface another coach's member when searching by phone", () => {
    render(<SwingVideoAnalysis clients={CLIENTS} coachId={MY_COACH_ID} />);

    fireEvent.change(searchBox(), { target: { value: '0105555' } });

    expect(screen.queryByText('박남의회원')).not.toBeInTheDocument();
    expect(screen.getByText('검색 결과 없음')).toBeInTheDocument();
  });

  it('falls back to the server-scoped roster when the coach id is unknown', () => {
    // Without a coachId we cannot prove ownership client-side; the server has
    // already scoped /api/clients for coach sessions, so pass through rather
    // than blanking the picker.
    render(<SwingVideoAnalysis clients={CLIENTS} />);

    expect(screen.getByText('김내회원')).toBeInTheDocument();
    expect(screen.getByText('박남의회원')).toBeInTheDocument();
  });
});
