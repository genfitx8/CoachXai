import React, { useState, useRef, useCallback } from 'react';
import { Camera, Upload, Check, X } from 'lucide-react';
import { PostureCapture } from '../../types/postureAnalysis';
import { Button } from '../Button';

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const sideFileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      setIsUsingCamera(true);
    } catch (error) {
      console.error('Failed to start camera:', error);
      alert('카메라를 시작할 수 없습니다. 파일 업로드를 사용해주세요.');
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

          if (type === 'front') {
            setFrontCapture(capture);
          } else {
            setSideCapture(capture);
          }
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

  const handleReset = useCallback(
    (type: 'front' | 'side') => {
      if (type === 'front') {
        setFrontCapture(null);
        if (frontFileInputRef.current) frontFileInputRef.current.value = '';
      } else {
        setSideCapture(null);
        if (sideFileInputRef.current) sideFileInputRef.current.value = '';
      }
    },
    []
  );

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">신체 자세 촬영</h2>
        <p className="text-gray-600">
          정면과 측면 사진을 촬영하거나 업로드하세요. 스켈레톤 분석을 통해 체형 밸런스를 측정합니다.
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
            frontCapture ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
          }`}>
            {frontCapture ? <Check size={20} /> : '1'}
          </div>
          <div className="w-16 h-1 bg-gray-300">
            <div className={`h-full transition-all ${frontCapture ? 'bg-green-500 w-full' : 'bg-blue-500 w-0'}`} />
          </div>
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
            sideCapture ? 'bg-green-500 text-white' : frontCapture ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'
          }`}>
            {sideCapture ? <Check size={20} /> : '2'}
          </div>
        </div>
      </div>

      {/* Capture Interface */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Front View */}
        <div className="border-2 border-gray-300 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            정면 촬영
            {frontCapture && <Check className="ml-2 text-green-500" size={20} />}
          </h3>

          {frontCapture ? (
            <div className="relative">
              <img
                src={frontCapture.imageData}
                alt="Front view"
                className="w-full h-64 object-contain bg-gray-100 rounded"
              />
              <button
                onClick={() => handleReset('front')}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-full h-64 bg-gray-100 rounded flex items-center justify-center">
                <Camera size={48} className="text-gray-400" />
              </div>
              <input
                ref={frontFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'front')}
                className="hidden"
              />
              <button
                onClick={() => frontFileInputRef.current?.click()}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center"
              >
                <Upload size={20} className="mr-2" />
                파일 업로드
              </button>
            </div>
          )}
        </div>

        {/* Side View */}
        <div className="border-2 border-gray-300 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            측면 촬영
            {sideCapture && <Check className="ml-2 text-green-500" size={20} />}
          </h3>

          {sideCapture ? (
            <div className="relative">
              <img
                src={sideCapture.imageData}
                alt="Side view"
                className="w-full h-64 object-contain bg-gray-100 rounded"
              />
              <button
                onClick={() => handleReset('side')}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-full h-64 bg-gray-100 rounded flex items-center justify-center">
                <Camera size={48} className="text-gray-400" />
              </div>
              <input
                ref={sideFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'side')}
                className="hidden"
                disabled={!frontCapture}
              />
              <button
                onClick={() => sideFileInputRef.current?.click()}
                disabled={!frontCapture}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={20} className="mr-2" />
                파일 업로드
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Camera Capture (hidden canvas and video) */}
      {isUsingCamera && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 className="text-xl font-bold mb-4">
              {activeView === 'front' ? '정면' : '측면'} 촬영
            </h3>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded mb-4"
            />
            <div className="flex space-x-3">
              <Button onClick={capturePhoto} className="flex-1">
                <Camera size={20} className="mr-2" />
                촬영
              </Button>
              <Button onClick={stopCamera} variant="secondary">
                취소
              </Button>
            </div>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <Button
          onClick={onCancel}
          variant="secondary"
          className="flex-1"
        >
          취소
        </Button>
        <Button
          onClick={handleComplete}
          disabled={!frontCapture || !sideCapture}
          className="flex-1"
        >
          분석 시작
        </Button>
      </div>
    </div>
  );
};
