import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../Button';
import { Monitor, X, Camera } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

interface ScreenCaptureDialogProps {
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
}

export const ScreenCaptureDialog: React.FC<ScreenCaptureDialogProps> = ({ onCapture, onClose }) => {
  const { t } = useLanguage();
  const [availableScreens, setAvailableScreens] = useState<MediaStream[]>([]);
  const [selectedScreenIndex, setSelectedScreenIndex] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Request screen capture permission and get available screens
    const initScreenCapture = async () => {
      try {
        // Note: Modern browsers don't provide a way to enumerate all screens beforehand
        // User must select screen via browser's built-in picker
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'monitor',
          },
          audio: false,
        });

        streamRef.current = stream;
        setAvailableScreens([stream]);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Handle stream end (user stops sharing)
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          onClose();
        });
      } catch (error) {
        console.error('Error accessing screen:', error);
        alert(t('screen_capture_error') || '화면 캡처를 시작할 수 없습니다. 권한을 확인해주세요.');
        onClose();
      }
    };

    initScreenCapture();

    // Cleanup
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [onClose, t]);

  const handleCapture = () => {
    if (!videoRef.current) return;

    setIsCapturing(true);

    // Create canvas and capture current frame
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL('image/png');

      // Stop the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      onCapture(imageDataUrl);
    }

    setIsCapturing(false);
  };

  const handleChangeScreen = async () => {
    // Stop current stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    // Request new screen
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Handle stream end
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        onClose();
      });
    } catch (error) {
      console.error('Error changing screen:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-violet-400" />
            <h3 className="text-lg font-semibold text-slate-100">
              {t('screen_capture_title') || '화면 캡처'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative rounded-lg overflow-hidden bg-slate-950 aspect-video">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
          {!availableScreens.length && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-slate-400">
                {t('screen_capture_loading') || '화면을 불러오는 중...'}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            onClick={handleChangeScreen}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="change-screen-btn"
          >
            <Monitor className="w-4 h-4" />
            {t('screen_capture_change') || '다른 화면 선택'}
          </Button>

          <div className="flex gap-2">
            <Button
              onClick={onClose}
              variant="ghost"
              data-testid="screen-capture-cancel-btn"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleCapture}
              disabled={!availableScreens.length || isCapturing}
              className="flex items-center gap-2"
              data-testid="screen-capture-btn"
            >
              <Camera className="w-4 h-4" />
              {t('screen_capture_button') || '캡처하기'}
            </Button>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          {t('screen_capture_help') || '트랙맨 데이터가 표시된 화면을 선택하고 캡처 버튼을 눌러주세요.'}
        </p>
      </div>
    </div>
  );
};
