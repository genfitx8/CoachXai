import React, { useState, useMemo, useRef } from 'react';
import { Lesson } from '../types';
import { resolveMediaUrl } from '../services/apiService';
import {
  ArrowLeft,
  Download,
  Play,
  Film,
  Scissors,
  X,
  Loader2,
  ImageOff,
  Filter,
} from 'lucide-react';

interface AlbumEntry {
  lessonId: string;
  type: 'edited' | 'compare';
  videoUrl: string;
  clientName: string;
  date: string;
  title: string;
  createdAt: number;
  editedAt?: string;
}

interface VideoAlbumProps {
  lessons: Lesson[];
  onBack: () => void;
  onViewLesson?: (lessonId: string) => void;
}

type FilterType = 'ALL' | 'EDITED' | 'COMPARE';

const VideoCard: React.FC<{
  entry: AlbumEntry;
  onPlay: (entry: AlbumEntry) => void;
  onDownload: (entry: AlbumEntry) => void;
  isDownloading: boolean;
}> = ({ entry, onPlay, onDownload, isDownloading }) => {
  const [thumbError, setThumbError] = useState(false);

  const badgeClass =
    entry.type === 'edited'
      ? 'bg-blue-600/90 text-white'
      : 'bg-purple-600/90 text-white';
  const badgeLabel = entry.type === 'edited' ? '편집본' : '비교영상';
  const BadgeIcon = entry.type === 'edited' ? Scissors : Film;

  return (
    <div className="group relative bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl hover:border-slate-700 transition-all duration-200 hover:shadow-slate-900/60">
      {/* Thumbnail */}
      <div
        className="relative aspect-video bg-slate-950 cursor-pointer"
        onClick={() => onPlay(entry)}
      >
        {thumbError ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-600">
            <ImageOff className="w-8 h-8" />
            <span className="text-xs">미리보기 없음</span>
          </div>
        ) : (
          <video
            src={entry.videoUrl}
            className="w-full h-full object-cover"
            preload="metadata"
            muted
            onError={() => setThumbError(true)}
          />
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-6 h-6 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Type badge */}
        <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}`}>
          <BadgeIcon className="w-3 h-3" />
          {badgeLabel}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold text-slate-100 truncate">{entry.clientName}</p>
        <p className="text-xs text-slate-400 mt-0.5">{entry.date}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{entry.title}</p>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onPlay(entry)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-medium transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            재생
          </button>
          <button
            onClick={() => onDownload(entry)}
            disabled={isDownloading}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            저장
          </button>
        </div>
      </div>
    </div>
  );
};

const VideoPlayerModal: React.FC<{
  entry: AlbumEntry;
  onClose: () => void;
  onDownload: (entry: AlbumEntry) => void;
  isDownloading: boolean;
}> = ({ entry, onClose, onDownload, isDownloading }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isCompare = entry.type === 'compare';

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold">{entry.clientName}</p>
            <p className="text-slate-400 text-xs">{entry.date} · {entry.type === 'edited' ? '편집본' : '비교영상'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDownload(entry)}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition-colors disabled:opacity-50"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              저장
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video */}
        <div className={`rounded-xl overflow-hidden bg-black mx-auto w-full ${isCompare ? 'max-w-xs aspect-[9/16]' : 'aspect-video'}`}>
          <video
            ref={videoRef}
            src={entry.videoUrl}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
};

export const VideoAlbum: React.FC<VideoAlbumProps> = ({ lessons, onBack }) => {
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [playingEntry, setPlayingEntry] = useState<AlbumEntry | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const allEntries = useMemo<AlbumEntry[]>(() => {
    const entries: AlbumEntry[] = [];

    for (const lesson of lessons) {
      if (lesson.editedVideoUrl) {
        entries.push({
          lessonId: lesson.id,
          type: 'edited',
          videoUrl: resolveMediaUrl(lesson.editedVideoUrl),
          clientName: lesson.clientName,
          date: lesson.date,
          title: lesson.title,
          createdAt: lesson.createdAt,
          editedAt: lesson.videoEditMetadata?.editedAt,
        });
      }
      if (lesson.compareVideoUrl) {
        entries.push({
          lessonId: lesson.id,
          type: 'compare',
          videoUrl: resolveMediaUrl(lesson.compareVideoUrl),
          clientName: lesson.clientName,
          date: lesson.date,
          title: lesson.title,
          createdAt: lesson.createdAt,
          editedAt: lesson.compareVideoMetadata?.createdAt,
        });
      }
    }

    return entries.sort((a, b) => {
      const dateA = a.editedAt ? new Date(a.editedAt).getTime() : a.createdAt;
      const dateB = b.editedAt ? new Date(b.editedAt).getTime() : b.createdAt;
      return dateB - dateA;
    });
  }, [lessons]);

  const filteredEntries = useMemo(() => {
    if (filter === 'ALL') return allEntries;
    if (filter === 'EDITED') return allEntries.filter((e) => e.type === 'edited');
    return allEntries.filter((e) => e.type === 'compare');
  }, [allEntries, filter]);

  const editedCount = allEntries.filter((e) => e.type === 'edited').length;
  const compareCount = allEntries.filter((e) => e.type === 'compare').length;

  const handleDownload = async (entry: AlbumEntry) => {
    const key = `${entry.lessonId}_${entry.type}`;
    setDownloadingId(key);
    try {
      const response = await fetch(entry.videoUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = entry.type === 'edited' ? 'edited' : 'compare';
      a.download = `${suffix}_${entry.clientName}_${entry.date}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadingKey = playingEntry
    ? `${playingEntry.lessonId}_${playingEntry.type}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#070b12] to-[#0B1220] text-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0A0F1A]/95 border-b border-slate-800 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-800 text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-bold">영상 앨범</h1>
          </div>
          <span className="text-xs text-slate-500 ml-1">{allEntries.length}개</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filter Tabs */}
        <div className="flex gap-2">
          {([
            { key: 'ALL', label: `전체 ${allEntries.length}` },
            { key: 'EDITED', label: `편집본 ${editedCount}` },
            { key: 'COMPARE', label: `비교영상 ${compareCount}` },
          ] as { key: FilterType; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
            <div className="w-20 h-20 rounded-full bg-slate-800/60 flex items-center justify-center">
              <Film className="w-10 h-10" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-300">저장된 영상이 없습니다</p>
              <p className="text-sm mt-1">
                레슨 기록에서 영상을 편집하거나 비교 영상을 생성하면
                <br />
                이곳에 자동으로 저장됩니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredEntries.map((entry) => {
              const key = `${entry.lessonId}_${entry.type}`;
              return (
                <VideoCard
                  key={key}
                  entry={entry}
                  onPlay={setPlayingEntry}
                  onDownload={handleDownload}
                  isDownloading={downloadingId === key}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Video Player Modal */}
      {playingEntry && (
        <VideoPlayerModal
          entry={playingEntry}
          onClose={() => setPlayingEntry(null)}
          onDownload={handleDownload}
          isDownloading={downloadingKey === downloadingId}
        />
      )}
    </div>
  );
};
