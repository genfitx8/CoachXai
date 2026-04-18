
import { SwingSequenceItem } from '../types';

/**
 * Extracts multiple frames from a video URL at specified timestamps.
 */
export const extractSequenceFrames = async (
  videoUrl: string, 
  points: { label: string; time: number }[]
): Promise<SwingSequenceItem[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    // Note: 'crossOrigin' is tricky with local blobs but usually fine if created via URL.createObjectURL.
    // If using remote URLs without CORS, this will fail (tainted canvas).
    // For this app, we assume local blobs or CORS-enabled URLs.
    video.crossOrigin = 'anonymous'; 
    video.muted = true;
    video.playsInline = true;

    // We'll create a single canvas to reuse
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const results: SwingSequenceItem[] = [];

    // Sort points by time to seek efficiently forward
    const sortedPoints = [...points].sort((a, b) => a.time - b.time);

    video.onloadedmetadata = async () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      try {
        for (const point of sortedPoints) {
          // Skip if timestamp is out of bounds
          if (point.time > video.duration) continue;

          // Seek and wait
          await new Promise<void>((seekResolve) => {
             // Robust seek: wait for 'seeked' event
             const onSeek = () => {
               video.removeEventListener('seeked', onSeek);
               seekResolve();
             };
             video.addEventListener('seeked', onSeek);
             video.currentTime = point.time;
          });

          if (ctx) {
            ctx.drawImage(video, 0, 0);
            // Use high quality jpeg
            const imageUrl = canvas.toDataURL('image/jpeg', 0.85);
            
            results.push({
              id: crypto.randomUUID(),
              label: point.label,
              imageUrl,
              timestamp: point.time
            });
          }
        }
        resolve(results);
      } catch (err) {
        reject(err);
      } finally {
        // Clean up
        video.src = '';
      }
    };

    video.onerror = (e) => reject(new Error("Video load failed"));
  });
};
