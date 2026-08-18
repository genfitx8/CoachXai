/**
 * Tests for tryAnswerOnDevice — the hybrid orchestrator that decides
 * whether a chat turn is served by the local model or handed to the
 * server path (null return).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODEL_URL = 'https://models.example.com/gemma3-270m-it-q8.task';

const engineMock = vi.hoisted(() => ({
  isEngineReady: vi.fn(() => true),
  initOnDeviceEngine: vi.fn(async () => true),
  generateOnDevice: vi.fn(async () => '온디바이스 응답입니다.'),
  disposeOnDeviceEngine: vi.fn(),
}));

vi.mock('../services/onDeviceLlm/onDeviceLlmService', () => engineMock);

describe('tryAnswerOnDevice', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_ON_DEVICE_MODEL_URL', MODEL_URL);
    engineMock.isEngineReady.mockReturnValue(true);
    engineMock.initOnDeviceEngine.mockResolvedValue(true);
    engineMock.generateOnDevice.mockResolvedValue('온디바이스 응답입니다.');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const load = () => import('../services/onDeviceLlm');

  it('returns null when the feature is disabled', async () => {
    vi.stubEnv('VITE_ON_DEVICE_MODEL_URL', '');
    const { tryAnswerOnDevice } = await load();
    const result = await tryAnswerOnDevice({ userMessage: '안녕하세요', language: 'ko' });
    expect(result).toBeNull();
    expect(engineMock.generateOnDevice).not.toHaveBeenCalled();
  });

  it('returns null for server-routed queries without touching the engine', async () => {
    const { tryAnswerOnDevice } = await load();
    const result = await tryAnswerOnDevice({
      userMessage: '오늘 일정 알려줘',
      language: 'ko',
    });
    expect(result).toBeNull();
    expect(engineMock.generateOnDevice).not.toHaveBeenCalled();
  });

  it('returns null when the engine cannot initialise (model not downloaded)', async () => {
    engineMock.isEngineReady.mockReturnValue(false);
    engineMock.initOnDeviceEngine.mockResolvedValue(false);
    const { tryAnswerOnDevice } = await load();
    const result = await tryAnswerOnDevice({ userMessage: '안녕하세요', language: 'ko' });
    expect(result).toBeNull();
    expect(engineMock.generateOnDevice).not.toHaveBeenCalled();
  });

  it('answers eligible queries on-device', async () => {
    const { tryAnswerOnDevice } = await load();
    const result = await tryAnswerOnDevice({ userMessage: '멀리건이 뭐야?', language: 'ko' });
    expect(result).toBe('온디바이스 응답입니다.');
    expect(engineMock.generateOnDevice).toHaveBeenCalledWith(
      '멀리건이 뭐야?',
      'ko',
      expect.objectContaining({}),
    );
  });

  it('member-name mentions bypass the local model', async () => {
    const { tryAnswerOnDevice } = await load();
    const result = await tryAnswerOnDevice({
      userMessage: '김민수 그립 어때?',
      language: 'ko',
      clientNames: ['김민수'],
    });
    expect(result).toBeNull();
    expect(engineMock.generateOnDevice).not.toHaveBeenCalled();
  });

  it('falls back to the server (null) when generation throws', async () => {
    engineMock.generateOnDevice.mockRejectedValue(new Error('engine crashed'));
    const { tryAnswerOnDevice } = await load();
    const result = await tryAnswerOnDevice({ userMessage: '안녕하세요', language: 'ko' });
    expect(result).toBeNull();
  });
});
