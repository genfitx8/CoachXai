import React, { useState } from 'react';
import { Button } from './Button';
import { VideoTrimmer } from './VideoTrimmer';
import { AudioRecorder } from './AudioRecorder';
import { DrawingCanvas } from './DrawingCanvas';
import { X, Scissors, Mic, PenTool, Loader2 } from 'lucide-react';
import { videoEditingService } from '../services/videoEditingService';
import { drawingService } from '../services/drawingService';
import { VideoEditMetadata } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('videoEditor');

interface VideoEditorProps {
  videoUrl: string;
  onSave: (editedVideoBlob: Blob, metadata: VideoEditMetadata) => void;
  onCancel: () => void;
  lessonId?: string;
}

type EditMode = 'SELECT' | 'TRIM' | 'AUDIO' | 'DRAW';

export const VideoEditor: React.FC<VideoEditorProps> = ({ 
  videoUrl, 
  onSave, 
  onCancel,
  lessonId 
}) => {
  const [editMode, setEditMode] = useState<EditMode>('SELECT');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  
  // Edit state
  const [trimStart, setTrimStart] = useState<number | undefined>(undefined);
  const [trimEnd, setTrimEnd] = useState<number | undefined>(undefined);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [hasDrawings, setHasDrawings] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState(videoUrl);

  const handleTrim = async (startTime: number, endTime: number) => {
    setIsProcessing(true);
    setProcessingStatus('영상을 자르는 중...');
    
    try {
      const videoBlob = await fetch(currentVideoUrl).then(r => r.blob());
      const trimmedBlob = await videoEditingService.trimVideo(
        videoBlob,
        startTime,
        endTime,
        (progress) => {
          setProcessingProgress(progress * 100);
        }
      );
      
      setTrimStart(startTime);
      setTrimEnd(endTime);
      
      // Update current video URL with trimmed version
      const newUrl = URL.createObjectURL(trimmedBlob);
      setCurrentVideoUrl(newUrl);
      
      setEditMode('SELECT');
      alert('영상이 성공적으로 잘렸습니다.');
    } catch (error) {
      log.error('Error trimming video:', error);
      alert('영상 자르기 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStatus('');
    }
  };

  const handleAudioRecorded = async (audio: Blob) => {
    setAudioBlob(audio);
    setEditMode('SELECT');
    alert('음성이 녹음되었습니다. 저장 시 영상과 합쳐집니다.');
  };

  const handleDrawingSaved = () => {
    setHasDrawings(true);
    setEditMode('SELECT');
    alert('그리기가 저장되었습니다.');
  };

  const handleSaveAll = async () => {
    setIsProcessing(true);
    setProcessingStatus('편집된 영상을 저장하는 중...');
    
    try {
      let finalBlob = await fetch(currentVideoUrl).then(r => r.blob());
      
      // Apply audio if recorded
      if (audioBlob) {
        setProcessingStatus('음성을 합치는 중...');
        finalBlob = await videoEditingService.mergeAudioWithVideo(
          finalBlob,
          audioBlob,
          0,
          (progress) => {
            setProcessingProgress(progress * 100);
          }
        );
      }
      
      // Note: Drawing overlay is not fully implemented in FFmpeg service
      // It would require rendering each frame with fabric.js drawings
      // For now, we save the drawing data in metadata
      const drawingData = drawingService.exportDrawings();
      
      const metadata: VideoEditMetadata = {
        trimStart,
        trimEnd,
        hasAudioOverlay: !!audioBlob,
        hasDrawings: hasDrawings && drawingData.length > 0,
        drawingData: drawingData.length > 0 ? drawingData : undefined,
        editedAt: new Date().toISOString(),
      };
      
      onSave(finalBlob, metadata);
    } catch (error) {
      log.error('Error saving edited video:', error);
      alert('영상 저장 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStatus('');
    }
  };

  const hasEdits = trimStart !== undefined || audioBlob !== null || hasDrawings;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-raised rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-bg-raised border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold">영상 편집</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-bg-overlay rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {isProcessing && (
            <div className="mb-6 bg-interactive-500/10 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="font-medium">{processingStatus}</span>
              </div>
              {processingProgress > 0 && (
                <div className="w-full bg-bg-inset rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {editMode === 'SELECT' && (
            <div className="space-y-6">
              <div className="bg-bg-base p-4 rounded-lg">
                <video
                  src={currentVideoUrl}
                  controls
                  className="w-full rounded"
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">편집 도구 선택</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setEditMode('TRIM')}
                    disabled={isProcessing}
                    className="p-6 border-2 border-line-default rounded-lg hover:border-blue-500 hover:bg-interactive-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Scissors className="w-12 h-12 mx-auto mb-3 text-blue-600" />
                    <h4 className="font-semibold mb-1">영상 자르기</h4>
                    <p className="text-sm text-ink-medium">시작/종료 지점 선택</p>
                    {trimStart !== undefined && (
                      <p className="text-xs text-green-600 mt-2">✓ 적용됨</p>
                    )}
                  </button>

                  <button
                    onClick={() => setEditMode('AUDIO')}
                    disabled={isProcessing}
                    className="p-6 border-2 border-line-default rounded-lg hover:border-blue-500 hover:bg-interactive-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mic className="w-12 h-12 mx-auto mb-3 text-blue-600" />
                    <h4 className="font-semibold mb-1">음성 녹음</h4>
                    <p className="text-sm text-ink-medium">해설 음성 추가</p>
                    {audioBlob && (
                      <p className="text-xs text-green-600 mt-2">✓ 녹음됨</p>
                    )}
                  </button>

                  <button
                    onClick={() => setEditMode('DRAW')}
                    disabled={isProcessing}
                    className="p-6 border-2 border-line-default rounded-lg hover:border-blue-500 hover:bg-interactive-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <PenTool className="w-12 h-12 mx-auto mb-3 text-blue-600" />
                    <h4 className="font-semibold mb-1">선 긋기</h4>
                    <p className="text-sm text-ink-medium">영상에 그림 추가</p>
                    {hasDrawings && (
                      <p className="text-xs text-green-600 mt-2">✓ 그려짐</p>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button onClick={onCancel} variant="secondary">
                  취소
                </Button>
                <Button 
                  onClick={handleSaveAll} 
                  disabled={!hasEdits || isProcessing}
                >
                  편집 완료 및 저장
                </Button>
              </div>
            </div>
          )}

          {editMode === 'TRIM' && (
            <VideoTrimmer
              videoUrl={currentVideoUrl}
              onTrim={handleTrim}
              onCancel={() => setEditMode('SELECT')}
            />
          )}

          {editMode === 'AUDIO' && (
            <AudioRecorder
              onRecordingComplete={handleAudioRecorded}
              onCancel={() => setEditMode('SELECT')}
            />
          )}

          {editMode === 'DRAW' && (
            <DrawingCanvas
              videoUrl={currentVideoUrl}
              onSave={handleDrawingSaved}
              onCancel={() => setEditMode('SELECT')}
            />
          )}
        </div>
      </div>
    </div>
  );
};
