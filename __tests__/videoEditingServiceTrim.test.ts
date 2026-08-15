/**
 * Tests for videoEditingService.trimVideo.
 *
 * Regressions covered:
 * 1. Trimming re-encodes with input seeking (`-ss` before `-i`) instead of
 *    output seeking with `-c copy`, which cut on keyframe boundaries and
 *    produced empty / frozen clips.
 * 2. A zero-length (or reversed) selection is rejected with a readable message
 *    instead of handing ffmpeg a `-t 0` command that yields an empty file.
 * 3. The progress listener is removed after each run, so repeated trims don't
 *    stack callbacks.
 * 4. An empty ffmpeg output or a non-zero exit code surfaces as an error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ffmpegMock = {
  load: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  exec: vi.fn().mockResolvedValue(0),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@ffmpeg/ffmpeg', () => ({
  // Must be constructible (`new FFmpeg()`), so not an arrow function.
  FFmpeg: function FFmpeg() {
    return ffmpegMock;
  },
}));

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(async () => new Uint8Array([0])),
  toBlobURL: vi.fn(async () => 'blob:core'),
}));

const { videoEditingService, MIN_TRIM_DURATION } = await import(
  '../services/videoEditingService'
);

const makeVideo = (name = 'swing.mp4', type = 'video/mp4') =>
  new File([new Uint8Array([0, 1, 2])], name, { type });

describe('videoEditingService.trimVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ffmpegMock.exec.mockResolvedValue(0);
    ffmpegMock.readFile.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
  });

  it('seeks on the input and re-encodes so the cut is frame-accurate', async () => {
    await videoEditingService.trimVideo(makeVideo(), 1.5, 4);

    const args: string[] = ffmpegMock.exec.mock.calls[0][0];
    const ssIndex = args.indexOf('-ss');
    const inputIndex = args.indexOf('-i');

    expect(ssIndex).toBeGreaterThanOrEqual(0);
    // -ss must come *before* -i: output seeking with a copy codec was the bug.
    expect(ssIndex).toBeLessThan(inputIndex);
    expect(args[ssIndex + 1]).toBe('1.500');
    expect(args[args.indexOf('-t') + 1]).toBe('2.500');
    expect(args).toContain('libx264');
    expect(args).not.toContain('copy');
  });

  it('keeps the source container extension so .mov files still demux', async () => {
    await videoEditingService.trimVideo(makeVideo('swing.mov', 'video/quicktime'), 0, 2);

    const writtenName = ffmpegMock.writeFile.mock.calls[0][0];
    expect(writtenName).toBe('trim_input.mov');
    const args: string[] = ffmpegMock.exec.mock.calls[0][0];
    expect(args[args.indexOf('-i') + 1]).toBe('trim_input.mov');
  });

  it('rejects a selection shorter than the minimum without invoking ffmpeg', async () => {
    await expect(videoEditingService.trimVideo(makeVideo(), 3, 3)).rejects.toThrow(
      /너무 짧습니다/
    );
    await expect(videoEditingService.trimVideo(makeVideo(), 5, 2)).rejects.toThrow(
      /너무 짧습니다/
    );
    await expect(
      videoEditingService.trimVideo(makeVideo(), 0, MIN_TRIM_DURATION / 2)
    ).rejects.toThrow(/너무 짧습니다/);

    expect(ffmpegMock.exec).not.toHaveBeenCalled();
  });

  it('removes the progress listener when the run finishes', async () => {
    const onProgress = vi.fn();
    await videoEditingService.trimVideo(makeVideo(), 0, 3, onProgress);

    expect(ffmpegMock.on).toHaveBeenCalledTimes(1);
    expect(ffmpegMock.off).toHaveBeenCalledTimes(1);
    expect(ffmpegMock.off.mock.calls[0][1]).toBe(ffmpegMock.on.mock.calls[0][1]);
  });

  it('falls back to a stream copy when the re-encode fails', async () => {
    ffmpegMock.exec.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const blob = await videoEditingService.trimVideo(makeVideo(), 0, 3);

    expect(ffmpegMock.exec).toHaveBeenCalledTimes(2);
    expect(ffmpegMock.exec.mock.calls[1][0]).toContain('copy');
    expect(blob.size).toBe(4);
  });

  it('throws when ffmpeg exits non-zero on both attempts', async () => {
    ffmpegMock.exec.mockResolvedValue(1);

    await expect(videoEditingService.trimVideo(makeVideo(), 0, 3)).rejects.toThrow(
      /영상 자르기에 실패했습니다/
    );
  });

  it('throws when ffmpeg produced an empty file', async () => {
    ffmpegMock.readFile.mockResolvedValue(new Uint8Array([]));

    await expect(videoEditingService.trimVideo(makeVideo(), 0, 3)).rejects.toThrow(
      /비어 있습니다/
    );
  });

  it('cleans up its scratch files even after a failure', async () => {
    ffmpegMock.exec.mockResolvedValue(1);

    await expect(videoEditingService.trimVideo(makeVideo(), 0, 3)).rejects.toThrow();

    const deleted = ffmpegMock.deleteFile.mock.calls.map((c) => c[0]);
    expect(deleted).toContain('trim_input.mp4');
    expect(deleted).toContain('trim_output.mp4');
  });
});
