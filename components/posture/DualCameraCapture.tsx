import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, Check, X, AlertCircle } from 'lucide-react';
import { PostureCapture } from '../../types/postureAnalysis';

interface DualCameraCaptureProps {
  onCapturesComplete: (front: PostureCapture, side: PostureCapture) => void;
  onCancel: () => void;
}

export const DualCameraCapture: React.FC<DualCameraCaptureProps> = ({
  onCapturesComplete,
  onCancel,
}) => {
  const [frontCapture, setFrontCapture] = useState<PostureCapture | null>(null);
  const [sideCapture, setSideCapture] = useState<PostureCapture | null>(null);
  const [activeView, setActiveView] = useState<'front' | 'side'>('front');
  const [isUsingCamera, setIsUsingCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const sideFileInputRef = useRef<HTMLInputElement>(null);

  // Bind the stream to the video element after the camera modal renders.
  useEffect(() => {
    if (isUsingCamera && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((e) => {
        console.error('Failed to play video:', e);
        setCameraError('카메라 미리보기를 시작할 수 없습니다. 다시 시도해주세요.');
      });
    }
  }, [isUsingCamera, stream]);

  const startCamera = useCallback(async (view?: 'front' | 'side') => {
    if (view) setActiveView(view);
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);
      setIsUsingCamera(true);
    } catch (error: unknown) {
      console.error('Failed to start camera:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setCameraError('카메라 접근 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.');
        } else if (error.name === 'NotFoundError') {
          setCameraError('카메라 장치를 찾을 수 없습니다. 파일 업로드를 사용해주세요.');
        } else if (error.name === 'NotReadableError') {
          setCameraError('카메라가 다른 앱에서 사용 중입니다. 다른 앱을 닫고 다시 시도해주세요.');
        } else {
          setCameraError('카메라를 시작할 수 없습니다. 파일 업로드를 사용해주세요.');
        }
      } else {
        setCameraError('카메라를 시작할 수 없습니다. 파일 업로드를 사용해주세요.');
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsUsingCamera(false);
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    const capture: PostureCapture = {
      id: `${activeView}-${Date.now()}`,
      type: activeView,
      imageData,
      timestamp: new Date().toISOString(),
      width: canvas.width,
      height: canvas.height,
    };

    if (activeView === 'front') {
      setFrontCapture(capture);
      setActiveView('side');
    } else {
      setSideCapture(capture);
      stopCamera();
    }
  }, [activeView, stopCamera]);

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'side') => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const capture: PostureCapture = {
            id: `${type}-${Date.now()}`,
            type,
            imageData,
            timestamp: new Date().toISOString(),
            width: img.width,
            height: img.height,
          };
          if (type === 'front') setFrontCapture(capture);
          else setSideCapture(capture);
        };
        img.src = imageData;
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const handleComplete = useCallback(() => {
    if (frontCapture && sideCapture) {
      onCapturesComplete(frontCapture, sideCapture);
    }
  }, [frontCapture, sideCapture, onCapturesComplete]);

  const handleReset = useCallback((type: 'front' | 'side') => {
    if (type === 'front') {
      setFrontCapture(null);
      if (frontFileInputRef.current) frontFileInputRef.current.value = '';
    } else {
      setSideCapture(null);
      if (sideFileInputRef.current) sideFileInputRef.current.value = '';
    }
  }, []);

  const bothDone = frontCapture && sideCapture;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-1">신체 자세 촬영</h2>
          <p className="text-slate-400 text-sm">정면과 측면 사진을 촬영하거나 업로드하세요.</p>
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <StepDot done={!!frontCapture} active={!frontCapture} label="정면" num={1} />
          <div className={`h-0.5 w-16 rounded transition-colors ${frontCapture ? 'bg-emerald-500' : 'bg-slate-700'}`} />
          <StepDot done={!!sideCapture} active={!!frontCapture && !sideCapture} label="측면" num={2} />
          <div className={`h-0.5 w-16 rounded transition-colors ${sideCapture ? 'bg-emerald-500' : 'bg-slate-700'}`} />
          <StepDot done={false} active={!!bothDone} label="분석" num={3} />
        </div>

        {/* Capture cards */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <CaptureCard
            type="front"
            label="정면 촬영"
            capture={frontCapture}
            onStartCamera={() => startCamera('front')}
            onUploadClick={() => frontFileInputRef.current?.click()}
            onReset={() => handleReset('front')}
            disabled={false}
            fileInputRef={frontFileInputRef}
            onFileChange={(e) => handleFileUpload(e, 'front')}
          />
          <CaptureCard
            type="side"
            label="측면 촬영"
            capture={sideCapture}
            onStartCamera={() => startCamera('side')}
            onUploadClick={() => sideFileInputRef.current?.click()}
            onReset={() => handleReset('side')}
            disabled={!frontCapture}
            fileInputRef={sideFileInputRef}
            onFileChange={(e) => handleFileUpload(e, 'side')}
          />
        </div>

        {/* Camera error */}
        {cameraError && (
          <div className="flex items-start gap-2 mb-4 px-4 py-3 bg-red-900/30 border border-red-700 rounded-xl text-sm text-red-300">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {cameraError}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleComplete}
            disabled={!bothDone}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/30"
          >
            분석 시작
          </button>
        </div>
      </div>

      {/* Camera modal */}
      {isUsingCamera && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5 w-full max-w-xl">
            <h3 className="text-lg font-bold mb-4 text-slate-100">
              {activeView === 'front' ? '정면' : '측면'} 촬영
            </h3>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-xl mb-4 bg-black"
            />
            <div className="flex gap-3">
              <button
                onClick={capturePhoto}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
              >
                <Camera size={20} />
                촬영
              </button>
              <button
                onClick={stopCamera}
                className="px-5 py-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

/* ── Sub-components ── */

interface StepDotProps {
  done: boolean;
  active: boolean;
  label: string;
  num: number;
}

const StepDot: React.FC<StepDotProps> = ({ done, active, label, num }) => {
  const bg = done ? 'bg-emerald-500' : active ? 'bg-emerald-600 ring-2 ring-emerald-400/40' : 'bg-slate-700';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-all ${bg}`}>
        {done ? <Check size={16} /> : num}
      </div>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
};

interface CaptureCardProps {
  type: 'front' | 'side';
  label: string;
  capture: PostureCapture | null;
  onStartCamera: () => void;
  onUploadClick: () => void;
  onReset: () => void;
  disabled: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const CaptureCard: React.FC<CaptureCardProps> = ({
  label, capture, onStartCamera, onUploadClick, onReset, disabled, fileInputRef, onFileChange,
}) => (
  <div className={`rounded-xl border ${capture ? 'border-emerald-700' : 'border-slate-700'} bg-slate-900 overflow-hidden`}>
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        {label}
        {capture && <Check size={14} className="text-emerald-400" />}
      </h3>
      {disabled && !capture && (
        <span className="text-xs text-slate-600">정면 먼저 완료하세요</span>
      )}
    </div>

    {capture ? (
      <div className="relative">
        <img
          src={capture.imageData}
          alt={label}
          className="w-full h-56 object-contain bg-black"
        />
        <button
          onClick={onReset}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600/90 hover:bg-red-500 flex items-center justify-center transition-colors"
        >
          <X size={14} className="text-white" />
        </button>
      </div>
    ) : (
      <div className="p-4 space-y-3">
        <div className="w-full h-40 rounded-lg bg-slate-800 flex items-center justify-center">
          <Camera size={40} className="text-slate-600" />
        </div>
        <button
          onClick={onStartCamera}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Camera size={16} />
          실시간 촬영
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
          disabled={disabled}
        />
        <button
          onClick={onUploadClick}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600"
        >
          <Upload size={16} />
          파일 업로드
        </button>
      </div>
    )}
  </div>
);
