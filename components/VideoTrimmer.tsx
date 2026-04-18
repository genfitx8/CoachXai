import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { Scissors, Play, Pause } from 'lucide-react';

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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setEndTime(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      // Auto-pause when reaching end time
      if (video.currentTime >= endTime) {
        video.pause();
        setIsPlaying(false);
        video.currentTime = startTime;
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [endTime, startTime]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      if (video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setStartTime(value);
    if (value > endTime) {
      setEndTime(value);
    }
    if (videoRef.current) {
      videoRef.current.currentTime = value;
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setEndTime(value);
    if (value < startTime) {
      setStartTime(value);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleApplyTrim = () => {
    onTrim(startTime, endTime);
  };

  return (
    <div className="space-y-4">
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full"
          playsInline
        />
      </div>

      <div className="flex justify-center">
        <Button onClick={handlePlayPause} className="flex items-center gap-2">
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? '일시정지' : '재생'}
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            시작 시간: {formatTime(startTime)}
          </label>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.01"
            value={startTime}
            onChange={handleStartChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            종료 시간: {formatTime(endTime)}
          </label>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.01"
            value={endTime}
            onChange={handleEndChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        <div className="bg-gray-100 p-3 rounded-lg">
          <div className="text-sm">
            <div>전체 길이: {formatTime(duration)}</div>
            <div>선택 구간: {formatTime(startTime)} ~ {formatTime(endTime)}</div>
            <div>선택 길이: {formatTime(endTime - startTime)}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button onClick={onCancel} variant="secondary">
          취소
        </Button>
        <Button onClick={handleApplyTrim} className="flex items-center gap-2">
          <Scissors className="w-4 h-4" />
          자르기 적용
        </Button>
      </div>
    </div>
  );
};
