import React, { useCallback, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Upload, Video, X, Users } from 'lucide-react';
import { Button } from './Button';
import { LessonUpload, Student } from '../types';

// ---------------------------------------------------------------------------
// Sub-component: video drop zone
// ---------------------------------------------------------------------------
interface VideoDropZoneProps {
  label: 'BEFORE' | 'AFTER';
  file: File | undefined;
  previewUrl: string | undefined;
  onFileSelect: (file: File) => void;
  onClear: () => void;
}

const VideoDropZone: React.FC<VideoDropZoneProps> = ({
  label,
  file,
  previewUrl,
  onFileSelect,
  onClear,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped && dropped.type.startsWith('video/')) {
        onFileSelect(dropped);
      }
    },
    [onFileSelect]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      onFileSelect(selected);
    }
    // reset so the same file can be re-selected after clearing
    e.target.value = '';
  };

  const labelColor = label === 'BEFORE' ? 'text-blue-400' : 'text-emerald-400';
  const borderColor = isDragging
    ? 'border-indigo-400'
    : file
    ? 'border-indigo-500/60'
    : 'border-slate-600/60';

  return (
    <div className="flex flex-col gap-2">
      <span className={`text-xs font-bold tracking-widest uppercase ${labelColor}`}>
        {label}
      </span>

      <div
        className={`relative rounded-2xl border-2 border-dashed ${borderColor} bg-slate-900/60 transition-colors`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        data-testid={`drop-zone-${label.toLowerCase()}`}
      >
        {previewUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={previewUrl}
              className="w-full rounded-2xl aspect-video object-cover"
              controls={false}
              muted
              playsInline
              data-testid={`preview-${label.toLowerCase()}`}
            />
            <button
              type="button"
              onClick={onClear}
              className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
              aria-label={`Remove ${label} video`}
              data-testid={`clear-${label.toLowerCase()}`}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
              {file?.name}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-3 p-8 text-slate-400 hover:text-slate-200 transition-colors"
            data-testid={`select-${label.toLowerCase()}`}
          >
            <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
              {isDragging ? (
                <Upload className="w-6 h-6 text-indigo-400" />
              ) : (
                <Video className="w-6 h-6" />
              )}
            </div>
            <span className="text-sm">
              {isDragging ? 'Drop to upload' : 'Tap or drag a video here'}
            </span>
            <span className="text-xs text-slate-500">MP4, MOV, WebM · max 30 s</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleInputChange}
        data-testid={`file-input-${label.toLowerCase()}`}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface LessonUploadPageProps {
  students: Student[];
  onBack: () => void;
  onNext: (upload: LessonUpload) => void;
  onGoToStudents?: () => void;
}

export const LessonUploadPage: React.FC<LessonUploadPageProps> = ({
  students,
  onBack,
  onNext,
  onGoToStudents,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [beforeFile, setBeforeFile] = useState<File | undefined>();
  const [afterFile, setAfterFile] = useState<File | undefined>();
  const [beforeUrl, setBeforeUrl] = useState<string | undefined>();
  const [afterUrl, setAfterUrl] = useState<string | undefined>();

  // Revoke object URLs when the component unmounts to prevent memory leaks
  React.useEffect(() => {
    return () => {
      if (beforeUrl) URL.revokeObjectURL(beforeUrl);
      if (afterUrl) URL.revokeObjectURL(afterUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (selectedStudentId && !students.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId('');
    }
  }, [selectedStudentId, students]);

  const handleSelectFile = (label: 'BEFORE' | 'AFTER', file: File) => {
    const url = URL.createObjectURL(file);
    if (label === 'BEFORE') {
      if (beforeUrl) URL.revokeObjectURL(beforeUrl);
      setBeforeFile(file);
      setBeforeUrl(url);
    } else {
      if (afterUrl) URL.revokeObjectURL(afterUrl);
      setAfterFile(file);
      setAfterUrl(url);
    }
  };

  const handleClearFile = (label: 'BEFORE' | 'AFTER') => {
    if (label === 'BEFORE') {
      if (beforeUrl) URL.revokeObjectURL(beforeUrl);
      setBeforeFile(undefined);
      setBeforeUrl(undefined);
    } else {
      if (afterUrl) URL.revokeObjectURL(afterUrl);
      setAfterFile(undefined);
      setAfterUrl(undefined);
    }
  };

  const canProceed = selectedStudentId && beforeFile && afterFile;

  const handleNext = () => {
    if (!canProceed) return;
    const upload: LessonUpload = {
      id: `upload-${Date.now()}`,
      studentId: selectedStudentId,
      beforeVideoFile: beforeFile,
      afterVideoFile: afterFile,
      beforeVideoUrl: beforeUrl,
      afterVideoUrl: afterUrl,
      createdAt: Date.now(),
    };
    onNext(upload);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="lesson-upload-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Back"
          data-testid="upload-back-btn"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-indigo-300/80 font-semibold">
            Step 1 of 2
          </p>
          <h2 className="text-xl font-bold text-slate-50">자동 영상 편집</h2>
        </div>
      </div>

      {/* Student selector */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
        <label
          htmlFor="student-select"
          className="block text-sm font-semibold text-slate-300"
        >
          Student
        </label>
        {students.length > 0 ? (
          <select
            id="student-select"
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            data-testid="student-select"
          >
            <option value="">— Select a student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.phone})
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-col gap-3" data-testid="student-empty-message">
            <p className="text-slate-400 text-sm">
              등록된 학생이 없습니다. 먼저 회원을 등록해 주세요.
            </p>
            {onGoToStudents && (
              <button
                type="button"
                onClick={onGoToStudents}
                className="flex items-center gap-2 w-fit px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
              >
                <Users className="w-4 h-4" />
                회원 등록하러 가기
              </button>
            )}
          </div>
        )}
      </section>

      {/* Video upload zones */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">편집할 전/후 영상</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <VideoDropZone
            label="BEFORE"
            file={beforeFile}
            previewUrl={beforeUrl}
            onFileSelect={(f) => handleSelectFile('BEFORE', f)}
            onClear={() => handleClearFile('BEFORE')}
          />
          <VideoDropZone
            label="AFTER"
            file={afterFile}
            previewUrl={afterUrl}
            onFileSelect={(f) => handleSelectFile('AFTER', f)}
            onClear={() => handleClearFile('AFTER')}
          />
        </div>
      </section>

      {/* Next button */}
      <Button
        onClick={handleNext}
        disabled={!canProceed}
        className="w-full py-4 text-base rounded-2xl border border-indigo-500/40 shadow-lg shadow-indigo-900/30 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed justify-center"
        icon={<ArrowRight className="w-5 h-5" />}
        data-testid="upload-next-btn"
      >
        Next: Set Impact Point
      </Button>
    </div>
  );
};
