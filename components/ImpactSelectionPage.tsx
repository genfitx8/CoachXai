import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { Button } from './Button';
import { ImpactSelection, LessonUpload } from '../types';

// ---------------------------------------------------------------------------
// Sub-component: single video scrubber panel
// ---------------------------------------------------------------------------
interface VideoScrubberProps {
  label: 'BEFORE' | 'AFTER';
  videoUrl: string | undefined;
  impactTimeSec: number;
  onImpactChange: (secs: number) => void;
}

const VideoScrubber: React.FC<VideoScrubberProps> = ({
  label,
  videoUrl,
  impactTimeSec,
  onImpactChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number>(30);

  // Seek the video whenever the impact value changes
  useEffect(() => {
    const vid = videoRef.current;
    if (vid && Number.isFinite(impactTimeSec)) {
      vid.currentTime = impactTimeSec;
    }
  }, [impactTimeSec]);

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (vid && vid.duration && Number.isFinite(vid.duration)) {
      setDuration(vid.duration);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onImpactChange(val);
  };

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(2).padStart(5, '0');
    return `${m}:${s}`;
  };

  const labelColor = label === 'BEFORE' ? 'text-blue-400' : 'text-emerald-400';

  return (
    <div
      className="flex flex-col gap-3"
      data-testid={`scrubber-${label.toLowerCase()}`}
    >
      <span className={`text-xs font-bold tracking-widest uppercase ${labelColor}`}>
        {label}
      </span>

      <div className="rounded-2xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center">
        {videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-cover"
            onLoadedMetadata={handleLoadedMetadata}
            muted
            playsInline
            data-testid={`video-${label.toLowerCase()}`}
          />
        ) : (
          <span className="text-slate-600 text-sm">No video</span>
        )}
      </div>

      {/* Slider */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={duration}
          step={0.033}
          value={impactTimeSec}
          onChange={handleSliderChange}
          className="w-full accent-indigo-500"
          aria-label={`${label} impact timestamp`}
          data-testid={`slider-${label.toLowerCase()}`}
        />
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>0:00.00</span>
          <span className="flex items-center gap-1 text-indigo-300 font-semibold">
            <Clock className="w-3 h-3" />
            Impact: {formatTime(impactTimeSec)}
          </span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Fine-adjust buttons (±1 frame at 30 fps ≈ 0.033 s; matches the FFmpeg
           pipeline default. For 60 fps footage the coach can tap twice.) */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onImpactChange(Math.max(0, impactTimeSec - 0.033))}
          className="flex-1 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          data-testid={`prev-frame-${label.toLowerCase()}`}
        >
          −1 frame
        </button>
        <button
          type="button"
          onClick={() => onImpactChange(Math.min(duration, impactTimeSec + 0.033))}
          className="flex-1 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          data-testid={`next-frame-${label.toLowerCase()}`}
        >
          +1 frame
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface ImpactSelectionPageProps {
  lessonUpload: LessonUpload;
  onBack: () => void;
  onConfirm: (selection: ImpactSelection) => void;
}

export const ImpactSelectionPage: React.FC<ImpactSelectionPageProps> = ({
  lessonUpload,
  onBack,
  onConfirm,
}) => {
  const [beforeImpact, setBeforeImpact] = useState<number>(1.5);
  const [afterImpact, setAfterImpact] = useState<number>(1.5);

  const handleConfirm = () => {
    const selection: ImpactSelection = {
      lessonId: lessonUpload.id,
      beforeImpactTimeSec: beforeImpact,
      afterImpactTimeSec: afterImpact,
    };
    onConfirm(selection);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="impact-selection-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          aria-label="Back"
          data-testid="impact-back-btn"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-indigo-300/80 font-semibold">
            Step 2 of 2
          </p>
          <h2 className="text-xl font-bold text-slate-50">Set Impact Point</h2>
        </div>
      </div>

      {/* Guidance */}
      <p className="text-sm text-slate-400 leading-relaxed">
        Drag the slider or use the frame buttons to mark the exact impact frame
        in each video. The editing engine uses these timestamps to synchronise
        the BEFORE and AFTER swings.
      </p>

      {/* Scrubbers */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-6">
        <VideoScrubber
          label="BEFORE"
          videoUrl={lessonUpload.beforeVideoUrl}
          impactTimeSec={beforeImpact}
          onImpactChange={setBeforeImpact}
        />
        <VideoScrubber
          label="AFTER"
          videoUrl={lessonUpload.afterVideoUrl}
          impactTimeSec={afterImpact}
          onImpactChange={setAfterImpact}
        />
      </section>

      {/* Confirm button */}
      <Button
        onClick={handleConfirm}
        className="w-full py-4 text-base rounded-2xl border border-indigo-500/40 shadow-lg shadow-indigo-900/30 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 justify-center"
        icon={<ArrowRight className="w-5 h-5" />}
        data-testid="impact-confirm-btn"
      >
        Confirm &amp; Process
      </Button>
    </div>
  );
};
