import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './Button';
import { Scissors, Play, Pause } from 'lucide-react';
import { MIN_TRIM_DURATION } from '../services/videoEditingService';

interface VideoTrimmerProps {
  videoUrl: string;
  onTrim: (startTime: number, endTime: number) => void;
  onCancel: () => void;
}

export const VideoTrimmer: React.FC<VideoTrimmerProps> = ({
  videoUrl,
  onTrim,
  onCancel
}) => {
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The auto-pause check runs on every timeupdate; reading the range from refs
  // keeps the listeners attached once instead of re-binding on each drag tick.
  const rangeRef = useRef({ start: 0, end: 0 });
  rangeRef.current = { start: startTime, end: endTime };

  const applyDuration = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return false;
    setDuration(value);
    setEndTime((prev) => (prev > 0 ? Math.min(prev, value) : value));
    setLoadError(null);
    return true;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Blobs recorded with MediaRecorder report duration === Infinity until the
    // whole file has been scanned; seeking past the end forces a real value.
    const forceDurationScan = () => {
      try {
        video.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        /* seeking may be rejected before the video is seekable */
      }
    };

    const handleLoadedMetadata = () => {
      if (!applyDuration(video.duration)) forceDurationScan();
    };

    const handleDurationChange = () => {
      if (applyDuration(video.duration) && video.currentTime > 0) {
        // Undo the seek used to probe the duration.
        video.currentTime = 0;
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Auto-pause when reaching end time (only while previewing — otherwise
      // an unset end time at 0 would keep rewinding the video).
      const { start, end } = rangeRef.current;
      if (end > start && !video.paused && video.currentTime >= end) {
        video.pause();
        setIsPlaying(false);
        video.currentTime = start;
      }
    };

    const handleEnded = () => setIsPlaying(false);
    const handleError = () =>
      setLoadError('영상을 불러오지 못했습니다. 다른 영상으로 다시 시도해주세요.');

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    // Metadata may already be there when the source is a cached blob URL, in
    // which case 'loadedmetadata' never fires again and duration stayed 0 —
    // that produced a 0-length trim request and the "자르기 오류".
    if (video.readyState >= 1) handleLoadedMetadata();

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [applyDuration, videoUrl]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      if (video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
      video.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false)
      );
    }
  };

  const seekPreview = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = value;
    } catch {
      /* ignore seeks the browser rejects */
    }
  };

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!Number.isFinite(value)) return;
    setStartTime(value);
    if (value > endTime) setEndTime(value);
    seekPreview(value);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!Number.isFinite(value)) return;
    setEndTime(value);
    if (value < startTime) setStartTime(value);
    seekPreview(value);
  };

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const selectedDuration = endTime - startTime;
  const isReady = duration > 0;
  const canApply = isReady && selectedDuration >= MIN_TRIM_DURATION;

  const handleApplyTrim = () => {
    if (!canApply) return;
    onTrim(startTime, Math.min(endTime, duration));
  };

  return (
    <div className="space-y-4">
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full"
          preload="metadata"
          playsInline
        />
      </div>

      {loadError && (
        <p className="text-sm text-red-400 text-center">{loadError}</p>
      )}

      <div className="flex justify-center">
        <Button
          onClick={handlePlayPause}
          disabled={!isReady}
          className="flex items-center gap-2"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? '일시정지' : '재생'}
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="trim-start" className="block text-sm font-medium mb-2">
            시작 시간: {formatTime(startTime)}
          </label>
          <input
            id="trim-start"
            type="range"
            min="0"
            max={duration || 0}
            step="0.01"
            value={startTime}
            disabled={!isReady}
            onChange={handleStartChange}
            className="w-full h-2 bg-white/[0.10] rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label htmlFor="trim-end" className="block text-sm font-medium mb-2">
            종료 시간: {formatTime(endTime)}
          </label>
          <input
            id="trim-end"
            type="range"
            min="0"
            max={duration || 0}
            step="0.01"
            value={endTime}
            disabled={!isReady}
            onChange={handleEndChange}
            className="w-full h-2 bg-white/[0.10] rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
          />
        </div>

        <div className="bg-white/[0.06] p-3 rounded-lg">
          <div className="text-sm">
            <div>전체 길이: {formatTime(duration)}</div>
            <div>선택 구간: {formatTime(startTime)} ~ {formatTime(endTime)}</div>
            <div>선택 길이: {formatTime(Math.max(selectedDuration, 0))}</div>
            <div className="text-xs text-ink-muted mt-1">
              현재 재생 위치: {formatTime(currentTime)}
            </div>
          </div>
        </div>

        {!isReady && !loadError && (
          <p className="text-sm text-ink-muted text-center">
            영상 정보를 불러오는 중입니다...
          </p>
        )}
        {isReady && !canApply && (
          <p className="text-sm text-amber-400 text-center">
            선택 구간이 {MIN_TRIM_DURATION}초보다 짧습니다. 종료 시간을 더 뒤로 옮겨주세요.
          </p>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button onClick={onCancel} variant="secondary">
          취소
        </Button>
        <Button
          onClick={handleApplyTrim}
          disabled={!canApply}
          className="flex items-center gap-2"
        >
          <Scissors className="w-4 h-4" />
          자르기 적용
        </Button>
      </div>
    </div>
  );
};
