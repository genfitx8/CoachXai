import React, { useState, useRef } from 'react';
import { Button } from './Button';
import { Mic, Square, Play, Trash2 } from 'lucide-react';
import { createLogger } from '../utils/logger';

const log = createLogger('audioRecorder');

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ 
  onRecordingComplete,
  onCancel 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      return stream;
    } catch (error) {
      log.error('Microphone permission denied:', error);
      alert('마이크 접근 권한이 필요합니다.');
      return null;
    }
  };

  const startRecording = async () => {
    const stream = await requestMicrophonePermission();
    if (!stream) return;

    chunksRef.current = [];
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setRecordedAudio(blob);
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setRecordingTime(0);

    // Start timer
    timerRef.current = window.setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const deleteRecording = () => {
    setRecordedAudio(null);
    setRecordingTime(0);
  };

  const handleSave = () => {
    if (recordedAudio) {
      onRecordingComplete(recordedAudio);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 p-6 rounded-lg text-center">
        {!hasPermission && !isRecording && !recordedAudio && (
          <div className="space-y-4">
            <Mic className="w-16 h-16 mx-auto text-gray-400" />
            <p className="text-gray-600">
              영상에 음성 해설을 녹음하세요
            </p>
            <Button onClick={startRecording} className="flex items-center gap-2 mx-auto">
              <Mic className="w-4 h-4" />
              녹음 시작
            </Button>
          </div>
        )}

        {isRecording && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                  <Mic className="w-10 h-10 text-white" />
                </div>
              </div>
            </div>
            <div className="text-2xl font-mono font-bold text-red-500">
              {formatTime(recordingTime)}
            </div>
            <p className="text-gray-600">녹음 중...</p>
            <Button onClick={stopRecording} variant="secondary" className="flex items-center gap-2 mx-auto">
              <Square className="w-4 h-4" />
              녹음 중지
            </Button>
          </div>
        )}

        {recordedAudio && !isRecording && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
                <Play className="w-10 h-10 text-white" />
              </div>
            </div>
            <div className="text-lg font-medium">
              녹음 완료 ({formatTime(recordingTime)})
            </div>
            <audio
              ref={audioRef}
              src={URL.createObjectURL(recordedAudio)}
              controls
              className="w-full"
            />
            <div className="flex gap-2 justify-center">
              <Button onClick={deleteRecording} variant="secondary" className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                삭제
              </Button>
              <Button onClick={startRecording} variant="secondary" className="flex items-center gap-2">
                <Mic className="w-4 h-4" />
                다시 녹음
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button onClick={onCancel} variant="secondary">
          취소
        </Button>
        <Button 
          onClick={handleSave} 
          disabled={!recordedAudio}
        >
          녹음 저장
        </Button>
      </div>
    </div>
  );
};
