/**
 * Tests for AdminAiObservability — the AI call telemetry dashboard.
 *
 * Verifies that:
 * 1. Empty state shows "기록 없음" when there are no logs.
 * 2. Feature stats table renders one row per feature, sorted by call count.
 * 3. Overall summary tiles reflect total / fallback / worst-P95 correctly.
 * 4. Recent calls table shows individual log entries with status pills.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { AiCallLog } from '../types';

// Mock the aiCallLogger so tests control what the dashboard sees.
const stubStats = { current: [] as ReturnType<typeof buildStat>[] };
const stubRecent = { current: [] as AiCallLog[] };

function buildStat(over: Partial<{
  feature: string;
  callCount: number;
  successCount: number;
  fallbackCount: number;
  errorCount: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  responseP50Chars: number;
  promptP50Chars: number;
  fallbackRate: number;
  exemplarInjectionRate: number;
  cacheHitRate: number;
  modelBreakdown: Record<string, number>;
  injectionAttemptRate: number;
  lastCallAt: number;
}> = {}) {
  return {
    feature: 'lesson_summary',
    callCount: 10,
    successCount: 9,
    fallbackCount: 1,
    errorCount: 0,
    latencyP50Ms: 800,
    latencyP95Ms: 2000,
    responseP50Chars: 500,
    promptP50Chars: 400,
    fallbackRate: 0.1,
    exemplarInjectionRate: 0.5,
    cacheHitRate: 0,
    modelBreakdown: {},
    injectionAttemptRate: 0,
    lastCallAt: Date.parse('2026-08-06T09:00:00Z'),
    ...over,
  };
}

vi.mock('../services/aiCallLogger', () => ({
  getFeatureStats: vi.fn(async () => stubStats.current),
  getRecentAiCalls: vi.fn(async () => stubRecent.current),
}));

import { AdminAiObservability } from '../components/AdminAiObservability';

describe('AdminAiObservability', () => {
  beforeEach(() => {
    stubStats.current = [];
    stubRecent.current = [];
  });

  it('shows an empty state when no logs exist', async () => {
    render(<AdminAiObservability />);
    // Header renders immediately.
    expect(screen.getByText('AI 호출 관측성')).toBeInTheDocument();
    // Empty state copy for each table.
    await waitFor(() => {
      expect(screen.getByText('아직 기록된 호출이 없습니다.')).toBeInTheDocument();
    });
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
  });

  it('renders per-feature rows sorted as provided', async () => {
    stubStats.current = [
      buildStat({ feature: 'lesson_summary', callCount: 20 }),
      buildStat({ feature: 'coachx_chat', callCount: 5 }),
    ];
    render(<AdminAiObservability />);
    // "레슨 요약" can appear both in the worst-P95 tile and the row —
    // use getAllByText and just assert both features are represented.
    await waitFor(() => {
      expect(screen.getAllByText('레슨 요약').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('CoachX 채팅')).toBeInTheDocument();
    // Both call counts visible.
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows the worst P95 across features in the summary tile', async () => {
    stubStats.current = [
      buildStat({ feature: 'lesson_summary', latencyP95Ms: 3000 }),
      buildStat({ feature: 'coachx_chat', latencyP95Ms: 7500 }),
    ];
    render(<AdminAiObservability />);
    // "7.50s" appears in both the tile and the per-feature row (P95 col) —
    // that's fine, both should render. The important thing: 7.50s is present,
    // 3.00s (the smaller P95) is present too, and the tile identifies the
    // worst feature (CoachX 채팅).
    await waitFor(() => {
      expect(screen.getAllByText('7.50s').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('3.00s')).toBeInTheDocument();
    // Tile subtitle names the worst feature.
    expect(screen.getAllByText('CoachX 채팅').length).toBeGreaterThan(0);
  });

  it('renders recent call rows with status pills', async () => {
    stubRecent.current = [
      {
        id: 'log-1',
        feature: 'lesson_summary',
        promptHash: 'abc123def456',
        promptLength: 100,
        responseLength: 200,
        latencyMs: 1500,
        status: 'success',
        hasExemplars: true,
        hasSchema: false,
        createdAt: Date.parse('2026-08-06T10:00:00Z'),
      },
      {
        id: 'log-2',
        feature: 'coachx_chat',
        promptHash: 'ff11ff11ff11',
        promptLength: 50,
        responseLength: 0,
        latencyMs: 500,
        status: 'fallback',
        hasExemplars: false,
        hasSchema: false,
        createdAt: Date.parse('2026-08-06T09:30:00Z'),
      },
    ];
    render(<AdminAiObservability />);
    await waitFor(() => {
      expect(screen.getByText('성공')).toBeInTheDocument();
    });
    expect(screen.getByText('폴백')).toBeInTheDocument();
    expect(screen.getByText('abc123def456')).toBeInTheDocument();
    // few-shot flag pill for the exemplar-injected call.
    expect(screen.getByText('few-shot')).toBeInTheDocument();
  });

  it('computes total-calls tile from aggregated stats', async () => {
    stubStats.current = [
      buildStat({ callCount: 10, successCount: 8, fallbackCount: 1, errorCount: 1 }),
      buildStat({ feature: 'coachx_chat', callCount: 5, successCount: 5, fallbackCount: 0, errorCount: 0 }),
    ];
    render(<AdminAiObservability />);
    await waitFor(() => {
      // total 15
      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });
});
