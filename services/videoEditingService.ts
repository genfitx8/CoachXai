import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { CompareVideoMetadata, DrawingFrame, VideoMetadata } from '../types';

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
        console.log('FFmpeg initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FFmpeg:', error);
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
      console.error('Error trimming video:', error);
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
      console.error('Error merging audio with video:', error);
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
    console.warn('Drawing overlay not yet fully implemented - returning original video');
    console.log('Drawing data will be saved in metadata for future implementation');
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

    // Each side occupies half the output width
    const halfWidth = outputWidth / 2;

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

      // Filter graph:
      // 1. Scale each input to fill its half (halfWidth x outputHeight) using center-crop
      // 2. Stack side by side with hstack
      // 3. Burn watermark at bottom-right
      const scaleFilter = `scale=${halfWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${halfWidth}:${outputHeight}`;
      const watermarkFilter =
        `drawtext=text='${watermarkText}':fontsize=36:fontcolor=white:alpha=0.75:` +
        `x=w-tw-20:y=h-th-20:shadowcolor=black:shadowx=2:shadowy=2`;

      const filterComplex =
        `[0:v]${scaleFilter}[left];` +
        `[1:v]${scaleFilter}[right];` +
        `[left][right]hstack=inputs=2,${watermarkFilter}[vout]`;

      await this.ffmpeg.exec([
        '-i', beforeName,
        '-i', afterName,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '1:a?',   // Use 'after' audio if present
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-shortest',
        '-movflags', '+faststart',
        outputName,
      ]);

      const data = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: 'video/mp4' });

      await this.ffmpeg.deleteFile(beforeName);
      await this.ffmpeg.deleteFile(afterName);
      await this.ffmpeg.deleteFile(outputName);

      return blob;
    } catch (error) {
      console.error('Error creating side-by-side compare video:', error);
      throw error;
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
