import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { CompareVideoMetadata, DrawingFrame, VideoMetadata } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('videoEditing');

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
        
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        
        await this.ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

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

    try {
      const inputName = 'input.mp4';
      const outputName = 'output.mp4';

      // Write input file
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // Set up progress callback
      if (onProgress) {
        this.ffmpeg.on('progress', ({ progress }) => {
          onProgress(progress);
        });
      }

      // Trim video
      const duration = endTime - startTime;
      await this.ffmpeg.exec([
        '-i', inputName,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-c', 'copy',
        outputName
      ]);

      // Read output file
      const data = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: 'video/mp4' });

      // Clean up
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);

      return blob;
    } catch (error) {
      log.error('Error trimming video:', error);
      throw error;
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

    try {
      const videoName = 'video.mp4';
      const audioName = 'audio.webm';
      const outputName = 'output.mp4';

      // Write input files
      await this.ffmpeg.writeFile(videoName, await fetchFile(videoBlob));
      await this.ffmpeg.writeFile(audioName, await fetchFile(audioBlob));

      // Set up progress callback
      if (onProgress) {
        this.ffmpeg.on('progress', ({ progress }) => {
          onProgress(progress);
        });
      }

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
      const blob = new Blob([data], { type: 'video/mp4' });

      // Clean up
      await this.ffmpeg.deleteFile(videoName);
      await this.ffmpeg.deleteFile(audioName);
      await this.ffmpeg.deleteFile(outputName);

      return blob;
    } catch (error) {
      log.error('Error merging audio with video:', error);
      throw error;
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
    } = options;

    const halfWidth = outputWidth / 2;
    const videoHeight = outputHeight;

    const beforeName = 'before.mp4';
    const afterName = 'after.mp4';
    const outputName = 'compare.mp4';

    try {
      await this.ffmpeg.writeFile(beforeName, await fetchFile(beforeFile));
      await this.ffmpeg.writeFile(afterName, await fetchFile(afterFile));

      if (onProgress) {
        this.ffmpeg.on('progress', ({ progress }) => {
          onProgress(Math.min(progress, 1));
        });
      }

      // Scale each half to fill (halfWidth x videoHeight), then hstack
      // Avoid drawtext (requires libfreetype which may not be in the WASM build)
      const scaleAndCrop = `scale=${halfWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${halfWidth}:${videoHeight}`;
      const filterComplex =
        `[0:v]${scaleAndCrop}[left];` +
        `[1:v]${scaleAndCrop}[right];` +
        `[left][right]hstack=inputs=2[vout]`;

      // Try libx264 first; fall back to mpeg4 if the codec is unavailable
      const encodeArgs = (codec: string) => [
        '-i', beforeName,
        '-i', afterName,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '1:a?',
        '-c:v', codec,
        ...(codec === 'libx264' ? ['-preset', 'fast', '-crf', '23'] : ['-q:v', '5']),
        '-c:a', 'aac',
        '-shortest',
        '-movflags', '+faststart',
        outputName,
      ];

      try {
        await this.ffmpeg.exec(encodeArgs('libx264'));
      } catch {
        log.warn('libx264 unavailable, falling back to mpeg4');
        await this.ffmpeg.exec(encodeArgs('mpeg4'));
      }

      const data = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: 'video/mp4' });

      await this.ffmpeg.deleteFile(beforeName);
      await this.ffmpeg.deleteFile(afterName);
      await this.ffmpeg.deleteFile(outputName);

      return blob;
    } catch (error) {
      log.error('Error creating side-by-side compare video:', error);
      throw error;
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

    const inputName = 'input.mp4';
    const outputName = 'slow_output.mp4';

    try {
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      if (onProgress) {
        this.ffmpeg.on('progress', ({ progress }) => onProgress(progress));
      }

      const ptsMultiplier = 1 / speed; // 0.5x → 2, 0.25x → 4, 0.125x → 8
      // atempo only supports 0.5–2.0 per filter, so chain multiple for extreme speeds
      const atempoCount = Math.round(Math.log(speed) / Math.log(0.5));
      const atempoChain = Array(atempoCount).fill('atempo=0.5').join(',');

      try {
        await this.ffmpeg.exec([
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
        // Fallback: no audio stream
        await this.ffmpeg.exec([
          '-i', inputName,
          '-filter:v', `setpts=${ptsMultiplier}*PTS`,
          '-an',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          outputName,
        ]);
      }

      const data = await this.ffmpeg.readFile(outputName);
      return new Blob([data], { type: 'video/mp4' });
    } catch (error) {
      log.error('Error creating slow motion video:', error);
      throw error;
    } finally {
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
