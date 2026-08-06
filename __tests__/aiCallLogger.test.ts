/**
 * Tests for the aiCallLogger observability layer.
 *
 * Covers:
 * 1. hashPrompt — deterministic, PII-safe short hash
 * 2. recordAiCall — writes via storage in local mode, never throws
 * 3. aggregateFeatureStats — P50/P95, fallback rate, exemplar rate
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCallLog } from '../types';

// storage/firebase are dynamic-imported by aiCallLogger so we mock them
// before importing the SUT.
vi.mock('../services/storage', () => ({
  storageService: {
    saveAiCallLog: vi.fn(),
    getAiCallLogs: vi.fn(() => []),
  },
}));

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(() => false),
    saveAiCallLog: vi.fn(() => Promise.resolve()),
    getAiCallLogs: vi.fn(() => Promise.resolve([])),
  },
}));

import {
  aggregateFeatureStats,
  hashPrompt,
  recordAiCall,
} from '../services/aiCallLogger';
import { storageService } from '../services/storage';
import { firebaseService } from '../services/firebase';

const HASH_LENGTH = 12;

describe('hashPrompt', () => {
  it('returns a 12-char hex string', async () => {
    const h = await hashPrompt('hello world');
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic for the same input', async () => {
    const a = await hashPrompt('the quick brown fox');
    const b = await hashPrompt('the quick brown fox');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await hashPrompt('prompt A');
    const b = await hashPrompt('prompt B');
    expect(a).not.toBe(b);
  });

  it('never returns the raw prompt (PII safety)', async () => {
    const raw = 'user@example.com asked about their swing';
    const h = await hashPrompt(raw);
    expect(h).not.toContain('user@example.com');
    expect(h.length).toBe(HASH_LENGTH);
  });

  it('handles empty string without throwing', async () => {
    const h = await hashPrompt('');
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('recordAiCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a log entry via storageService in local mode', async () => {
    await recordAiCall({
      feature: 'lesson_summary',
      coachId: 'coach-1',
      prompt: 'analyse this swing',
      responseText: 'the swing shows early extension',
      latencyMs: 1234,
      status: 'success',
      hasExemplars: true,
      hasSchema: false,
    });

    expect(storageService.saveAiCallLog).toHaveBeenCalledTimes(1);
    const entry = (storageService.saveAiCallLog as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as AiCallLog;
    expect(entry.feature).toBe('lesson_summary');
    expect(entry.coachId).toBe('coach-1');
    expect(entry.promptHash).toMatch(/^[0-9a-f]{12}$/);
    expect(entry.promptLength).toBe('analyse this swing'.length);
    expect(entry.responseLength).toBe('the swing shows early extension'.length);
    expect(entry.latencyMs).toBe(1234);
    expect(entry.status).toBe('success');
    expect(entry.hasExemplars).toBe(true);
    expect(entry.hasSchema).toBe(false);
    expect(entry.id).toBeTruthy();
    expect(typeof entry.createdAt).toBe('number');
  });

  it('truncates long errorMessage to 200 chars', async () => {
    const longError = 'x'.repeat(500);
    await recordAiCall({
      feature: 'coachx_chat',
      prompt: 'p',
      responseText: '',
      latencyMs: 10,
      status: 'error',
      errorMessage: longError,
    });

    const entry = (storageService.saveAiCallLog as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as AiCallLog;
    expect(entry.errorMessage?.length).toBe(200);
  });

  it('clamps negative latency to zero', async () => {
    await recordAiCall({
      feature: 'coachx_chat',
      prompt: 'p',
      responseText: '',
      latencyMs: -50,
      status: 'success',
    });

    const entry = (storageService.saveAiCallLog as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as AiCallLog;
    expect(entry.latencyMs).toBe(0);
  });

  it('never throws when storage fails', async () => {
    (storageService.saveAiCallLog as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });

    await expect(
      recordAiCall({
        feature: 'coachx_chat',
        prompt: 'p',
        responseText: '',
        latencyMs: 100,
        status: 'success',
      })
    ).resolves.toBeUndefined();
  });

  it('uses firebase when initialized (fire-and-forget)', async () => {
    (firebaseService.isInitialized as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

    await recordAiCall({
      feature: 'coachx_chat',
      prompt: 'p',
      responseText: 'r',
      latencyMs: 100,
      status: 'success',
    });

    expect(firebaseService.saveAiCallLog).toHaveBeenCalledTimes(1);
    expect(storageService.saveAiCallLog).not.toHaveBeenCalled();
  });
});

describe('aggregateFeatureStats', () => {
  const makeLog = (over: Partial<AiCallLog> = {}): AiCallLog => ({
    id: Math.random().toString(36).slice(2),
    feature: 'lesson_summary',
    promptHash: 'abcdef123456',
    promptLength: 100,
    responseLength: 200,
    latencyMs: 500,
    status: 'success',
    hasExemplars: false,
    hasSchema: false,
    createdAt: Date.now(),
    ...over,
  });

  it('returns empty array for empty input', () => {
    expect(aggregateFeatureStats([])).toEqual([]);
  });

  it('groups logs by feature and counts calls', () => {
    const logs = [
      makeLog({ feature: 'a' }),
      makeLog({ feature: 'a' }),
      makeLog({ feature: 'b' }),
    ];
    const stats = aggregateFeatureStats(logs);
    expect(stats).toHaveLength(2);
    // Sorted by callCount desc — 'a' (2 calls) first.
    expect(stats[0].feature).toBe('a');
    expect(stats[0].callCount).toBe(2);
    expect(stats[1].feature).toBe('b');
    expect(stats[1].callCount).toBe(1);
  });

  it('computes success / fallback / error counts + fallback rate', () => {
    const logs = [
      makeLog({ status: 'success' }),
      makeLog({ status: 'success' }),
      makeLog({ status: 'fallback' }),
      makeLog({ status: 'error' }),
    ];
    const [stat] = aggregateFeatureStats(logs);
    expect(stat.successCount).toBe(2);
    expect(stat.fallbackCount).toBe(1);
    expect(stat.errorCount).toBe(1);
    expect(stat.fallbackRate).toBeCloseTo(0.25);
  });

  it('computes P50 and P95 latency', () => {
    const logs = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((ms) =>
      makeLog({ latencyMs: ms })
    );
    const [stat] = aggregateFeatureStats(logs);
    // With 10 values, P50 idx = ceil(0.5*10)-1 = 4 → 500
    expect(stat.latencyP50Ms).toBe(500);
    // P95 idx = ceil(0.95*10)-1 = 9 → 1000
    expect(stat.latencyP95Ms).toBe(1000);
  });

  it('computes exemplar injection rate', () => {
    const logs = [
      makeLog({ hasExemplars: true }),
      makeLog({ hasExemplars: true }),
      makeLog({ hasExemplars: false }),
      makeLog({ hasExemplars: false }),
    ];
    const [stat] = aggregateFeatureStats(logs);
    expect(stat.exemplarInjectionRate).toBeCloseTo(0.5);
  });

  it('reports the most recent createdAt as lastCallAt', () => {
    const logs = [
      makeLog({ createdAt: 1000 }),
      makeLog({ createdAt: 3000 }),
      makeLog({ createdAt: 2000 }),
    ];
    const [stat] = aggregateFeatureStats(logs);
    expect(stat.lastCallAt).toBe(3000);
  });
});
