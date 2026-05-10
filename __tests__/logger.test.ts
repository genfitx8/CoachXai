import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, resetLogger, setLogLevel, setLogSink } from '../utils/logger';

describe('logger', () => {
  beforeEach(() => {
    resetLogger();
    setLogLevel('debug');
  });

  afterEach(() => {
    resetLogger();
    vi.restoreAllMocks();
  });

  it('emits records with scope, level, message and details', () => {
    const sink = vi.fn();
    setLogSink(sink);

    const log = createLogger('storage');
    const err = new Error('boom');
    log.error('Failed to save lesson', err);

    expect(sink).toHaveBeenCalledTimes(1);
    const record = sink.mock.calls[0][0];
    expect(record.scope).toBe('storage');
    expect(record.level).toBe('error');
    expect(record.message).toBe('Failed to save lesson');
    expect(record.details[0]).toBe(err);
    expect(typeof record.timestamp).toBe('number');
  });

  it('respects minimum level', () => {
    const sink = vi.fn();
    setLogSink(sink);
    setLogLevel('warn');

    const log = createLogger('test');
    log.debug('skip me');
    log.info('skip me too');
    log.warn('keep');
    log.error('keep also');

    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[0][0].level).toBe('warn');
    expect(sink.mock.calls[1][0].level).toBe('error');
  });

  it('forwards extra details after the error argument', () => {
    const sink = vi.fn();
    setLogSink(sink);

    const log = createLogger('gemini');
    log.error('chat failed', new Error('x'), { requestId: 'abc' });

    const record = sink.mock.calls[0][0];
    expect(record.details).toHaveLength(2);
    expect(record.details[1]).toEqual({ requestId: 'abc' });
  });

  it('handles error() with no error argument', () => {
    const sink = vi.fn();
    setLogSink(sink);

    const log = createLogger('test');
    log.error('something happened');

    const record = sink.mock.calls[0][0];
    expect(record.details).toEqual([]);
  });
});
