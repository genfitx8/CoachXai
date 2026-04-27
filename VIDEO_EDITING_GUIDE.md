# Video Editing Features Guide

## Overview
CoachX now includes comprehensive video editing capabilities designed specifically for golf lesson analysis. Coaches can trim videos, add voice commentary, and draw annotations directly on swing videos.

## Features

### 0. Before/After Comparison Video (전/후 비교영상)
Automatically compose a side-by-side 9:16 (Instagram Reels) comparison video from two lesson clips.

**How to use:**
1. Open a lesson detail
2. In the media thumbnail strip, add two videos with roles:
   - Tap the role badge at the bottom of a video thumbnail to cycle through **레슨 전 (Before) → 레슨 후 (After) → 태그 없음**.
   - Or, when adding new media, choose a role in the preview step before saving.
3. Once both a **레슨 전** and a **레슨 후** video are tagged, the **전/후 비교영상 만들기** button appears.
4. Tap the button. A progress bar shows the render status.
5. The finished video is saved as `compareVideoUrl` in the lesson and displayed in a preview card below the button.
6. Use the **다시 만들기** button to regenerate.

**Output specs:**
- Resolution: **1080 × 1920** (9:16)
- Layout: Left = Before, Right = After (each 540 × 1920, center-cropped)
- Watermark: `CoachXai` bottom-right, white with drop shadow
- Audio: After clip audio (silent if none)
- Length: Trimmed to the shorter clip (`-shortest`)
- Codec: H.264 / AAC, `movflags +faststart` (Instagram-compatible)

**Storage path (Firebase Storage):**
```
compare-videos/{userId}/{lessonId}_{timestamp}.mp4
```

**Firestore metadata:**
```typescript
{
  compareVideoUrl: "https://...",
  compareVideoMetadata: {
    beforeMediaId: "uuid-of-before-media",
    afterMediaId:  "uuid-of-after-media",
    watermarkText: "CoachXai",
    createdAt: "2026-04-27T09:00:00.000Z"
  }
}
```

### 1. Video Trimming (영상 자르기)
Extract specific portions of lesson videos with precise control.

**How to use:**
1. Open a lesson with a video
2. Click the "영상 편집" button
3. Select "영상 자르기"
4. Use the dual sliders to set start and end points
5. Preview the selection by playing the video
6. Click "자르기 적용" to apply

**Technical Details:**
- Precision: 0.01 seconds (10ms)
- Format: MP4 output
- Processing: Browser-based using FFmpeg.js WebAssembly
- No quality loss (uses copy codec)

### 2. Audio Recording (음성 녹음)
Add voice-over commentary to explain swing techniques.

**How to use:**
1. Open a lesson with a video
2. Click the "영상 편집" button
3. Select "음성 녹음"
4. Click "녹음 시작" (grants microphone permission on first use)
5. Record your commentary
6. Click "녹음 중지" when finished
7. Preview the recording
8. Click "녹음 저장" to merge with video

**Technical Details:**
- Format: WebM audio (Opus codec)
- Sample Rate: Browser default (typically 48kHz)
- Output: AAC audio in final MP4
- Audio mixing: Original video audio + voice overlay

### 3. Drawing on Video (선 긋기)
Annotate swing videos with visual markers for technique analysis.

**How to use:**
1. Open a lesson with a video
2. Click the "영상 편집" button
3. Select "선 긋기"
4. Choose a drawing tool:
   - 자유 (Free draw)
   - 선 (Line)
   - 화살표 (Arrow)
   - 원 (Circle)
   - 사각형 (Rectangle)
5. Select color and line width
6. Draw on the canvas while video plays
7. Use undo/redo as needed
8. Click "그리기 저장"

**Technical Details:**
- Library: Fabric.js 5.3.0
- Storage: JSON format per frame timestamp
- Colors: Red, Blue, Green, Yellow, White
- Line widths: 2, 4, 6, 8, 10 pixels

## Architecture

### Services

#### videoEditingService.ts
Core video processing service using FFmpeg.js.

**Key Methods:**
- `initFFmpeg()` - Initialize FFmpeg WebAssembly
- `trimVideo()` - Extract video segment
- `mergeAudioWithVideo()` - Combine audio tracks
- `getVideoMetadata()` - Extract duration, dimensions, FPS
- `createSideBySideCompareVideo(before, after, options?, onProgress?)` - Compose 9:16 side-by-side comparison video with watermark

#### drawingService.ts
Manages drawing annotations frame-by-frame.

**Key Methods:**
- `saveDrawingFrame()` - Store canvas state for timestamp
- `getDrawingAtTime()` - Retrieve drawing for playback
- `exportDrawings()` - Get all drawings for storage

### Components

#### VideoEditor.tsx
Main modal component with mode selection and processing status.

**Props:**
```typescript
interface VideoEditorProps {
  videoUrl: string;
  onSave: (editedVideoBlob: Blob, metadata: VideoEditMetadata) => void;
  onCancel: () => void;
  lessonId?: string;
}
```

#### VideoTrimmer.tsx
Dual-slider interface for precise video trimming.

**Features:**
- Real-time preview
- Time display in MM:SS.MS format
- Auto-pause at end point
- Visual timeline

#### AudioRecorder.tsx
Microphone recording with MediaRecorder API.

**Features:**
- Permission handling
- Recording timer
- Playback preview
- Re-record capability

#### DrawingCanvas.tsx
Fabric.js canvas for video annotations.

**Features:**
- Multiple drawing tools
- Color/width selection
- Undo/Redo with history
- Side-by-side video/canvas view

### Data Types

```typescript
interface VideoEditMetadata {
  trimStart?: number;
  trimEnd?: number;
  hasAudioOverlay: boolean;
  hasDrawings: boolean;
  drawingData?: DrawingFrame[];
  editedAt: string;
}

interface DrawingFrame {
  timestamp: number; // milliseconds
  canvasData: string; // fabric.js JSON
}

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
}
```

## Storage

### Firebase Storage
Edited videos are uploaded to Firebase Storage with the path:
```
edited-videos/{userId}/{lessonId}_{timestamp}.mp4
```

Before/After comparison videos use a distinct prefix:
```
compare-videos/{userId}/{lessonId}_{timestamp}.mp4
```

### Firestore
Video edit metadata is stored in the lesson document:
```typescript
{
  editedVideoUrl: "https://...",
  videoEditMetadata: {
    trimStart: 1.5,
    trimEnd: 10.3,
    hasAudioOverlay: true,
    hasDrawings: true,
    drawingData: [...],
    editedAt: "2026-01-24T11:30:00.000Z"
  }
}
```

## Browser Compatibility

### Required Features
- WebAssembly (for FFmpeg.js)
- MediaRecorder API (for audio recording)
- Canvas 2D (for drawings)
- Blob/File APIs

### Tested Browsers
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14.1+
- ✅ Edge 90+

## Performance Considerations

### Video Processing
- FFmpeg.js runs in WebAssembly (near-native performance)
- Processing time varies with video length and operations
- Progress indicators shown during processing

### Memory Usage
- Large videos (>100MB) may cause performance issues on mobile
- Consider server-side processing for production deployments

### Drawing Performance
- Fabric.js is lightweight and performs well
- Frame-by-frame storage is efficient
- Canvas rendering is hardware-accelerated

## Known Limitations

### Drawing Overlay on Video
The current implementation stores drawing data separately and does not burn drawings into the video file. This is by design because:

1. **Performance**: Rendering drawings on every frame is CPU-intensive
2. **Flexibility**: Separate storage allows editing/removing drawings later
3. **Browser Limitations**: Complex frame-by-frame compositing requires server-side processing

**Future Enhancement Options:**
- Server-side rendering with Node.js + FFmpeg
- Dedicated video compositing service
- WebGL-accelerated rendering

### FPS Detection
The `getVideoMetadata()` method returns a default FPS of 30. True FPS detection requires complex analysis not available through standard browser APIs.

## Troubleshooting

### FFmpeg Initialization Fails
**Problem:** "Failed to initialize FFmpeg"
**Solution:** Check browser console for WebAssembly errors. Ensure CORS headers are properly configured if loading from CDN.

### Audio Permission Denied
**Problem:** Cannot record audio
**Solution:** Grant microphone permission in browser settings. Check that the site is served over HTTPS (required for MediaRecorder API).

### Large File Upload Fails
**Problem:** Video upload times out
**Solution:** Implement chunked upload or compress video before uploading. Consider setting up Firebase Storage CORS rules.

### Canvas Drawings Not Saving
**Problem:** Drawings disappear after closing editor
**Solution:** Ensure "그리기 저장" is clicked before exiting. Check browser console for errors.

## Future Enhancements

### Planned Features
- [ ] Multiple audio track support
- [ ] Text annotations on video
- [ ] Slow-motion playback control
- [ ] Frame-by-frame stepping
- [ ] Drawing templates (angle guides, posture lines)
- [ ] Export drawings as overlay video
- [ ] Undo/Redo across all edit types
- [ ] Keyboard shortcuts

### Integration Ideas
- Export edited videos to external platforms
- Share edited videos via link with timestamp markers
- AI-assisted drawing suggestions based on swing analysis
- Batch processing multiple videos
- Video comparison with drawing sync

## Development

### Adding New Drawing Tools
1. Add tool type to `DrawingTool` interface in `types.ts`
2. Implement tool logic in `DrawingCanvas.tsx` `handleMouseMove()`
3. Add button to tool selection UI
4. Update icon imports

### Extending Audio Features
The `AudioRecorder.tsx` component can be extended with:
- Audio filters (noise reduction, EQ)
- Multiple audio tracks
- Audio waveform visualization
- Volume control

### Custom Video Filters
FFmpeg.js supports various filters. Add them in `videoEditingService.ts`:
```typescript
await this.ffmpeg.exec([
  '-i', inputName,
  '-vf', 'brightness=0.1', // Example filter
  outputName
]);
```

## Support
For issues or questions, please refer to the main CoachX documentation or contact the development team.
