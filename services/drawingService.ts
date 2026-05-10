import { DrawingFrame } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('drawing');

class DrawingService {
  private drawingFrames: Map<number, string> = new Map();

  saveDrawingFrame(timestamp: number, canvasJSON: string): void {
    this.drawingFrames.set(timestamp, canvasJSON);
  }

  getDrawingAtTime(timestamp: number): string | null {
    // Find the closest drawing frame at or before this timestamp
    let closestTimestamp: number | null = null;
    let minDiff = Infinity;

    for (const [frameTime] of this.drawingFrames) {
      if (frameTime <= timestamp) {
        const diff = timestamp - frameTime;
        if (diff < minDiff) {
          minDiff = diff;
          closestTimestamp = frameTime;
        }
      }
    }

    if (closestTimestamp !== null) {
      return this.drawingFrames.get(closestTimestamp) || null;
    }

    return null;
  }

  exportDrawings(): DrawingFrame[] {
    const frames: DrawingFrame[] = [];
    
    this.drawingFrames.forEach((canvasData, timestamp) => {
      frames.push({ timestamp, canvasData });
    });

    return frames.sort((a, b) => a.timestamp - b.timestamp);
  }

  clearDrawings(): void {
    this.drawingFrames.clear();
  }

  importDrawings(frames: DrawingFrame[]): void {
    this.clearDrawings();
    frames.forEach(frame => {
      this.drawingFrames.set(frame.timestamp, frame.canvasData);
    });
  }

  async saveToFirebase(lessonId: string, drawings: DrawingFrame[]): Promise<void> {
    // TODO: Implement Firebase Firestore integration
    // This method should store drawing data in a subcollection under the lesson document
    // Example structure: lessons/{lessonId}/drawings/{drawingId}
    // For now, we log the data that would be saved
    log.info('Drawing data to save for lesson:', lessonId);
    log.info('Number of frames:', drawings.length);
    
    // When implementing, use firebaseService to save to Firestore
    // Example:
    // await firebaseService.saveDrawingData(lessonId, drawings);
  }
}

export const drawingService = new DrawingService();
