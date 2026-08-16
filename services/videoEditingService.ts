import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { CompareVideoMetadata, DrawingFrame, VideoMetadata } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('videoEditing');

/** Shortest clip we let through — below this ffmpeg reliably produces 0 frames. */
export const MIN_TRIM_DURATION = 0.2;

const EXTENSION_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-m4v': 'm4v',
  'video/3gpp': '3gp',
};

/** Pick a container extension ffmpeg can demux from the blob's MIME type / filename. */
const extensionFor = (file: File | Blob): string => {
  const name = (file as File).name;
  if (name) {
    const ext = name.split('.').pop();
    if (ext && ext.length <= 5 && /^[a-z0-9]+$/i.test(ext)) return ext.toLowerCase();
  }
  const mime = (file.type || '').split(';')[0].toLowerCase();
  return EXTENSION_BY_MIME[mime] || 'mp4';
};

/** ffmpeg.readFile can hand back a string when the file is text; normalise to bytes. */
const toUint8Array = (data: unknown): Uint8Array => {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(0);
};

export interface SideBySideOptions {
  outputWidth?: number;   // default 1080
  outputHeight?: number;  // default 1920
  watermarkText?: string; // default 'CoachXai'
}

class VideoEditingService {
  private ffmpeg: FFmpeg | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async initFFmpeg(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        this.ffmpeg = new FFmpeg();

        // Core must match the version the installed @ffmpeg/ffmpeg worker
        // expects; the 0.12.15 worker calls APIs (ffprobe/ret/reset) that
        // only exist in core >= 0.12.9. Loading 0.12.6 here silently broke
        // every edit operation.
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd';

        // Some CDNs / networks fail to serve unpkg; fall back to jsDelivr
        // so users don't get a blank "오류가 발생했습니다" with no cause.
        const load = async (host: string) => {
          const coreURL = await toBlobURL(`${host}/ffmpeg-core.js`, 'text/javascript');
          const wasmURL = await toBlobURL(`${host}/ffmpeg-core.wasm`, 'application/wasm');
          await this.ffmpeg!.load({ coreURL, wasmURL });
        };

        try {
          await load(baseURL);
        } catch (primaryError) {
          log.warn('unpkg core load failed, retrying via jsDelivr', primaryError);
          await load('https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/umd');
        }

        this.isInitialized = true;
        log.info('FFmpeg initialized successfully');
      } catch (error) {
        log.error('Failed to initialize FFmpeg:', error);
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  async trimVideo(
    videoFile: File | Blob,
    startTime: number,
    endTime: number,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    await this.initFFmpeg();
    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }
    const ffmpeg = this.ffmpeg;

    const start = Number.isFinite(startTime) ? Math.max(0, startTime) : 0;
    const end = Number.isFinite(endTime) ? endTime : NaN;
    const duration = end - start;
    if (!Number.isFinite(duration) || duration < MIN_TRIM_DURATION) {
      throw new Error(
        `자를 구간이 너무 짧습니다. 시작/종료 지점을 ${MIN_TRIM_DURATION}초 이상 벌려주세요.`
      );
    }

    // Keep the source container extension so ffmpeg picks the right demuxer
    // for .mov / .webm recordings straight off a phone camera.
    const inputName = `trim_input.${extensionFor(videoFile)}`;
    const outputName = 'trim_output.mp4';
    const handleProgress = onProgress
      ? ({ progress }: { progress: number }) => {
          if (Number.isFinite(progress)) {
            onProgress(Math.min(Math.max(progress, 0), 1));
          }
        }
      : null;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // The listener has to be removed again in `finally`; otherwise every
      // trim stacked another callback that kept driving old progress bars.
      if (handleProgress) ffmpeg.on('progress', handleProgress);

      // Seek on the input (fast) and re-encode. The previous version seeked on
      // the output with `-c copy`, which cuts on keyframe boundaries only —
      // for swing clips that produced empty or frozen-first-second files, and
      // often a broken/unplayable MP4.
      let code: number;
      try {
        code = await ffmpeg.exec([
          '-ss', start.toFixed(3),
          '-i', inputName,
          '-t', duration.toFixed(3),
          // Even dimensions keep libx264 happy with odd-sized phone captures.
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          outputName,
        ]);
      } catch (encodeError) {
        log.warn('Trim re-encode threw, falling back to stream copy', encodeError);
        code = -1;
      }

      if (code !== 0) {
        // Fallback for sources libx264 refuses: a keyframe-aligned stream copy
        // still beats failing outright.
        log.warn('Trim re-encode failed, retrying with stream copy', { code });
        code = await ffmpeg.exec([
          '-ss', start.toFixed(3),
          '-i', inputName,
          '-t', duration.toFixed(3),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          '-movflags', '+faststart',
          outputName,
        ]);
      }

      if (code !== 0) {
        throw new Error(`영상 자르기에 실패했습니다. (ffmpeg 종료 코드 ${code})`);
      }

      const data = await ffmpeg.readFile(outputName);
      const bytes = toUint8Array(data);
      if (bytes.byteLength === 0) {
        throw new Error('잘라낸 영상이 비어 있습니다. 구간을 다시 선택해주세요.');
      }

      return new Blob([bytes], { type: 'video/mp4' });
    } catch (error) {
      log.error('Error trimming video:', error);
      throw error;
    } finally {
      if (handleProgress) {
        try { ffmpeg.off('progress', handleProgress); } catch { /* noop */ }
      }
      try { await ffmpeg.deleteFile(inputName); } catch { /* noop */ }
      try { await ffmpeg.deleteFile(outputName); } catch { /* noop */ }
    }
  }

  async mergeAudioWithVideo(
    videoBlob: Blob,
    audioBlob: Blob,
    audioStartTime: number = 0,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    await this.initFFmpeg();
    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    const videoName = 'video.mp4';
    const audioName = 'audio.webm';
    const outputName = 'output.mp4';
    const handleProgress = onProgress
      ? ({ progress }: { progress: number }) => onProgress(progress)
      : null;

    try {
      // Write input files
      await this.ffmpeg.writeFile(videoName, await fetchFile(videoBlob));
      await this.ffmpeg.writeFile(audioName, await fetchFile(audioBlob));

      // Set up progress callback
      if (handleProgress) this.ffmpeg.on('progress', handleProgress);

      // Merge audio with video
      await this.ffmpeg.exec([
        '-i', videoName,
        '-i', audioName,
        '-filter_complex',
        `[1:a]adelay=${audioStartTime * 1000}|${audioStartTime * 1000}[delayed];[0:a][delayed]amix=inputs=2:duration=first[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        outputName
      ]);

      // Read output file
      const data = await this.ffmpeg.readFile(outputName);
      return new Blob([toUint8Array(data)], { type: 'video/mp4' });
    } catch (error) {
      log.error('Error merging audio with video:', error);
      throw error;
    } finally {
      if (handleProgress) {
        try { this.ffmpeg!.off('progress', handleProgress); } catch { /* noop */ }
      }
      try { await this.ffmpeg!.deleteFile(videoName); } catch { /* noop */ }
      try { await this.ffmpeg!.deleteFile(audioName); } catch { /* noop */ }
      try { await this.ffmpeg!.deleteFile(outputName); } catch { /* noop */ }
    }
  }

  async overlayDrawingsOnVideo(
    videoBlob: Blob,
    drawingFrames: DrawingFrame[],
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    // Note: Drawing overlay is a complex feature that requires rendering each video frame
    // with fabric.js drawings overlaid. This would involve:
    // 1. Extracting all video frames as images
    // 2. Rendering drawings on each frame using fabric.js
    // 3. Re-encoding all frames back into video format
    // 
    // This is computationally intensive and beyond basic FFmpeg capabilities in the browser.
    // For production use, consider:
    // - Server-side processing
    // - Storing drawing data separately and rendering on playback
    // - Using a dedicated video compositing library
    //
    // TODO: Implement full drawing overlay functionality
    log.warn('Drawing overlay not yet fully implemented - returning original video');
    log.info('Drawing data will be saved in metadata for future implementation');
    return videoBlob;
  }

  async createSideBySideCompareVideo(
    beforeFile: File | Blob,
    afterFile: File | Blob,
    options: SideBySideOptions = {},
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    await this.initFFmpeg();
    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    const {
      outputWidth = 1080,
      outputHeight = 1920,
      watermarkText = 'CoachXai',
    } = options;

    const halfWidth = outputWidth / 2;
    const labelHeight = 40;
    const videoHeight = outputHeight - labelHeight;

    const beforeName = 'before.mp4';
    const afterName = 'after.mp4';
    const outputName = 'compare.mp4';
    const handleProgress = onProgress
      ? ({ progress }: { progress: number }) => onProgress(Math.min(progress, 1))
      : null;

    try {
      await this.ffmpeg.writeFile(beforeName, await fetchFile(beforeFile));
      await this.ffmpeg.writeFile(afterName, await fetchFile(afterFile));

      if (handleProgress) this.ffmpeg.on('progress', handleProgress);

      // Scale each side to fill (halfWidth x videoHeight), then pad top with colored label bar
      const scaleAndCrop = `scale=${halfWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${halfWidth}:${videoHeight}`;
      const beforeLabel =
        `pad=${halfWidth}:${outputHeight}:0:${labelHeight}:color=#2D6A2D,` +
        `drawtext=text='Before':fontsize=20:fontcolor=white:x=(w-tw)/2:y=10`;
      const afterLabel =
        `pad=${halfWidth}:${outputHeight}:0:${labelHeight}:color=#1E508C,` +
        `drawtext=text='After':fontsize=20:fontcolor=white:x=(w-tw)/2:y=10`;
      const watermarkFilter =
        `drawtext=text='${watermarkText}':fontsize=36:fontcolor=white:alpha=0.75:` +
        `x=w-tw-20:y=h-th-20:shadowcolor=black:shadowx=2:shadowy=2`;

      const filterComplex =
        `[0:v]${scaleAndCrop},${beforeLabel}[left];` +
        `[1:v]${scaleAndCrop},${afterLabel}[right];` +
        `[left][right]hstack=inputs=2,${watermarkFilter}[vout]`;

      await this.ffmpeg.exec([
        '-i', beforeName,
        '-i', afterName,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '1:a?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-shortest',
        '-movflags', '+faststart',
        outputName,
      ]);

      const data = await this.ffmpeg.readFile(outputName);
      return new Blob([toUint8Array(data)], { type: 'video/mp4' });
    } catch (error) {
      log.error('Error creating side-by-side compare video:', error);
      throw error;
    } finally {
      if (handleProgress) {
        try { this.ffmpeg!.off('progress', handleProgress); } catch { /* noop */ }
      }
      try { await this.ffmpeg!.deleteFile(beforeName); } catch { /* noop */ }
      try { await this.ffmpeg!.deleteFile(afterName); } catch { /* noop */ }
      try { await this.ffmpeg!.deleteFile(outputName); } catch { /* noop */ }
    }
  }

  async createSlowMotionVideo(
    videoFile: File | Blob,
    speed: 0.5 | 0.25 | 0.125,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    await this.initFFmpeg();
    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    const inputName = `slow_input.${extensionFor(videoFile)}`;
    const outputName = 'slow_output.mp4';
    const handleProgress = onProgress
      ? ({ progress }: { progress: number }) => onProgress(progress)
      : null;

    try {
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      if (handleProgress) this.ffmpeg.on('progress', handleProgress);

      const ptsMultiplier = 1 / speed; // 0.5x → 2, 0.25x → 4, 0.125x → 8
      // atempo only supports 0.5–2.0 per filter, so chain multiple for extreme speeds
      const atempoCount = Math.round(Math.log(speed) / Math.log(0.5));
      const atempoChain = Array(atempoCount).fill('atempo=0.5').join(',');

      // ffmpeg.exec resolves with the exit code instead of throwing, so the
      // silent-video fallback below has to test the code, not catch an error.
      let code: number;
      try {
        code = await this.ffmpeg.exec([
          '-i', inputName,
          '-filter_complex', `[0:v]setpts=${ptsMultiplier}*PTS[v];[0:a]${atempoChain}[a]`,
          '-map', '[v]',
          '-map', '[a]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          outputName,
        ]);
      } catch {
        code = -1;
      }

      if (code !== 0) {
        // Fallback: no audio stream
        code = await this.ffmpeg.exec([
          '-i', inputName,
          '-filter:v', `setpts=${ptsMultiplier}*PTS`,
          '-an',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          outputName,
        ]);
      }

      if (code !== 0) {
        throw new Error(`슬로모션 처리에 실패했습니다. (ffmpeg 종료 코드 ${code})`);
      }

      const data = await this.ffmpeg.readFile(outputName);
      return new Blob([toUint8Array(data)], { type: 'video/mp4' });
    } catch (error) {
      log.error('Error creating slow motion video:', error);
      throw error;
    } finally {
      if (handleProgress) {
        try { this.ffmpeg!.off('progress', handleProgress); } catch { /* noop */ }
      }
      try { await this.ffmpeg!.deleteFile(inputName); } catch {}
      try { await this.ffmpeg!.deleteFile(outputName); } catch {}
    }
  }

  async getVideoMetadata(videoFile: File | Blob): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          // Note: FPS detection is not available through standard browser APIs
          // This default value should be sufficient for most use cases
          // TODO: Implement more accurate FPS detection if needed
          fps: 30,
        });
        URL.revokeObjectURL(video.src);
      };

      video.onerror = () => {
        reject(new Error('Failed to load video metadata'));
        URL.revokeObjectURL(video.src);
      };

      video.src = URL.createObjectURL(videoFile);
    });
  }
}

export const videoEditingService = new VideoEditingService();
