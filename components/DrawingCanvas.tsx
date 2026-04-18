import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { fabric } from 'fabric';
import { Minus, Circle, Square, ArrowRight, PenTool, Undo2, Redo2, Trash2 } from 'lucide-react';
import { DrawingTool } from '../types';
import { drawingService } from '../services/drawingService';

interface DrawingCanvasProps {
  videoUrl: string;
  onSave: () => void;
  onCancel: () => void;
}

const COLORS = [
  { name: '빨강', value: '#FF0000' },
  { name: '파랑', value: '#0000FF' },
  { name: '초록', value: '#00FF00' },
  { name: '노랑', value: '#FFFF00' },
  { name: '흰색', value: '#FFFFFF' },
];

const LINE_WIDTHS = [2, 4, 6, 8, 10];

// Default canvas dimensions when video dimensions are not available
const DEFAULT_CANVAS_WIDTH = 640;
const DEFAULT_CANVAS_HEIGHT = 480;

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ 
  videoUrl, 
  onSave, 
  onCancel 
}) => {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [selectedTool, setSelectedTool] = useState<DrawingTool['type']>('free');
  const [selectedColor, setSelectedColor] = useState('#FF0000');
  const [lineWidth, setLineWidth] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const tempObjectRef = useRef<fabric.Object | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyStepRef = useRef(0);

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const video = videoRef.current;
    
    // Wait for video to load
    const handleLoadedMetadata = () => {
      const fabricCanvas = new fabric.Canvas(canvasRef.current!, {
        width: video.videoWidth || DEFAULT_CANVAS_WIDTH,
        height: video.videoHeight || DEFAULT_CANVAS_HEIGHT,
        backgroundColor: 'transparent',
      });

      fabricCanvas.isDrawingMode = selectedTool === 'free';
      fabricCanvas.freeDrawingBrush.color = selectedColor;
      fabricCanvas.freeDrawingBrush.width = lineWidth;

      setCanvas(fabricCanvas);

      // Save initial state
      saveHistory(fabricCanvas);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      canvas?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!canvas) return;

    canvas.isDrawingMode = selectedTool === 'free';
    
    if (selectedTool === 'free') {
      canvas.freeDrawingBrush.color = selectedColor;
      canvas.freeDrawingBrush.width = lineWidth;
    }
  }, [canvas, selectedTool, selectedColor, lineWidth]);

  const saveHistory = (canvasInstance: fabric.Canvas) => {
    const json = JSON.stringify(canvasInstance.toJSON());
    historyRef.current = historyRef.current.slice(0, historyStepRef.current + 1);
    historyRef.current.push(json);
    historyStepRef.current++;
  };

  const handleMouseDown = (e: fabric.IEvent) => {
    if (!canvas || selectedTool === 'free') return;

    const pointer = canvas.getPointer(e.e);
    drawStartRef.current = { x: pointer.x, y: pointer.y };
    setIsDrawing(true);
  };

  const handleMouseMove = (e: fabric.IEvent) => {
    if (!canvas || !isDrawing || !drawStartRef.current || selectedTool === 'free') return;

    const pointer = canvas.getPointer(e.e);
    
    if (tempObjectRef.current) {
      canvas.remove(tempObjectRef.current);
    }

    const start = drawStartRef.current;
    let obj: fabric.Object | null = null;

    switch (selectedTool) {
      case 'line':
        obj = new fabric.Line([start.x, start.y, pointer.x, pointer.y], {
          stroke: selectedColor,
          strokeWidth: lineWidth,
        });
        break;
      case 'arrow':
        // Simple arrow using line
        obj = new fabric.Line([start.x, start.y, pointer.x, pointer.y], {
          stroke: selectedColor,
          strokeWidth: lineWidth,
        });
        break;
      case 'circle':
        const radius = Math.sqrt(
          Math.pow(pointer.x - start.x, 2) + Math.pow(pointer.y - start.y, 2)
        );
        obj = new fabric.Circle({
          left: start.x - radius,
          top: start.y - radius,
          radius: radius,
          stroke: selectedColor,
          strokeWidth: lineWidth,
          fill: 'transparent',
        });
        break;
      case 'rect':
        obj = new fabric.Rect({
          left: Math.min(start.x, pointer.x),
          top: Math.min(start.y, pointer.y),
          width: Math.abs(pointer.x - start.x),
          height: Math.abs(pointer.y - start.y),
          stroke: selectedColor,
          strokeWidth: lineWidth,
          fill: 'transparent',
        });
        break;
    }

    if (obj) {
      tempObjectRef.current = obj;
      canvas.add(obj);
      canvas.renderAll();
    }
  };

  const handleMouseUp = () => {
    if (!canvas || !isDrawing) return;

    setIsDrawing(false);
    tempObjectRef.current = null;
    drawStartRef.current = null;
    
    saveHistory(canvas);
    saveCurrentFrame();
  };

  useEffect(() => {
    if (!canvas) return;

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [canvas, isDrawing, selectedTool, selectedColor, lineWidth]);

  const saveCurrentFrame = () => {
    if (!canvas || !videoRef.current) return;
    
    const timestamp = Math.floor(videoRef.current.currentTime * 1000);
    const canvasData = JSON.stringify(canvas.toJSON());
    drawingService.saveDrawingFrame(timestamp, canvasData);
  };

  const handleUndo = () => {
    if (!canvas || historyStepRef.current <= 0) return;
    
    historyStepRef.current--;
    const prevState = historyRef.current[historyStepRef.current];
    canvas.loadFromJSON(prevState, () => {
      canvas.renderAll();
    });
  };

  const handleRedo = () => {
    if (!canvas || historyStepRef.current >= historyRef.current.length - 1) return;
    
    historyStepRef.current++;
    const nextState = historyRef.current[historyStepRef.current];
    canvas.loadFromJSON(nextState, () => {
      canvas.renderAll();
    });
  };

  const handleClear = () => {
    if (!canvas) return;
    
    canvas.clear();
    saveHistory(canvas);
    saveCurrentFrame();
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleSave = () => {
    saveCurrentFrame();
    onSave();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Video Player */}
        <div className="space-y-2">
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full"
              playsInline
              onTimeUpdate={handleTimeUpdate}
            />
          </div>
          <Button onClick={handlePlayPause} className="w-full">
            {isPlaying ? '일시정지' : '재생'}
          </Button>
        </div>

        {/* Drawing Canvas */}
        <div className="space-y-2">
          <div className="relative bg-gray-900 rounded-lg overflow-hidden">
            <canvas ref={canvasRef} className="w-full" />
          </div>
        </div>
      </div>

      {/* Drawing Tools */}
      <div className="bg-gray-50 p-4 rounded-lg space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">도구</label>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={selectedTool === 'free' ? 'primary' : 'secondary'}
              onClick={() => setSelectedTool('free')}
              className="flex items-center gap-2"
            >
              <PenTool className="w-4 h-4" />
              자유
            </Button>
            <Button
              size="sm"
              variant={selectedTool === 'line' ? 'primary' : 'secondary'}
              onClick={() => setSelectedTool('line')}
              className="flex items-center gap-2"
            >
              <Minus className="w-4 h-4" />
              선
            </Button>
            <Button
              size="sm"
              variant={selectedTool === 'arrow' ? 'primary' : 'secondary'}
              onClick={() => setSelectedTool('arrow')}
              className="flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              화살표
            </Button>
            <Button
              size="sm"
              variant={selectedTool === 'circle' ? 'primary' : 'secondary'}
              onClick={() => setSelectedTool('circle')}
              className="flex items-center gap-2"
            >
              <Circle className="w-4 h-4" />
              원
            </Button>
            <Button
              size="sm"
              variant={selectedTool === 'rect' ? 'primary' : 'secondary'}
              onClick={() => setSelectedTool('rect')}
              className="flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              사각형
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">색상</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setSelectedColor(color.value)}
                className={`w-10 h-10 rounded-full border-2 ${
                  selectedColor === color.value ? 'border-gray-900 scale-110' : 'border-gray-300'
                } transition-transform`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">두께</label>
          <div className="flex gap-2 flex-wrap">
            {LINE_WIDTHS.map((width) => (
              <Button
                key={width}
                size="sm"
                variant={lineWidth === width ? 'primary' : 'secondary'}
                onClick={() => setLineWidth(width)}
              >
                {width}px
              </Button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-between pt-2 border-t">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleUndo}
              disabled={historyStepRef.current <= 0}
              className="flex items-center gap-2"
            >
              <Undo2 className="w-4 h-4" />
              실행취소
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRedo}
              disabled={historyStepRef.current >= historyRef.current.length - 1}
              className="flex items-center gap-2"
            >
              <Redo2 className="w-4 h-4" />
              다시실행
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleClear}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              전체삭제
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button onClick={onCancel} variant="secondary">
          취소
        </Button>
        <Button onClick={handleSave}>
          그리기 저장
        </Button>
      </div>
    </div>
  );
};
