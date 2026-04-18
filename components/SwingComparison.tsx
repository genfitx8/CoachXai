
import React, { useState, useRef } from 'react';
import { Lesson, ComparisonResult } from '../types';
import { Button } from './Button';
import { ArrowLeft, CheckCircle2, Sparkles, Layers, Layout, Play, Pause, Mic } from 'lucide-react';
import { compareSwings } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface SwingComparisonProps {
  lessons: Lesson[];
  onBack: () => void;
}

export const SwingComparison: React.FC<SwingComparisonProps> = ({ lessons, onBack }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [viewMode, setViewMode] = useState<'SPLIT' | 'GHOST'>('SPLIT');
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for video syncing
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(i => i !== id));
    } else {
      if (selectedIds.length < 2) {
        setSelectedIds(prev => [...prev, id]);
      }
    }
  };

  const handleAnalyze = async () => {
    if (selectedIds.length !== 2) return;
    
    // Sort by date (oldest first)
    const selectedLessons = lessons
      .filter(l => selectedIds.includes(l.id))
      .sort((a, b) => a.createdAt - b.createdAt);

    setIsAnalyzing(true);
    try {
      const data = await compareSwings(
        selectedLessons[0].videoUrl,
        selectedLessons[1].videoUrl,
        selectedLessons[0].date,
        selectedLessons[1].date
      );
      setResult(data);
    } catch (error) {
      console.error(error);
      alert("분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePlayPause = () => {
    const v1 = video1Ref.current;
    const v2 = video2Ref.current;
    
    if (isPlaying) {
      if(v1) v1.pause();
      if(v2) v2.pause();
    } else {
      if(v1) { v1.currentTime = 0; v1.play(); }
      if(v2) { v2.currentTime = 0; v2.play(); }
    }
    setIsPlaying(!isPlaying);
  };

  // Ensure selection state is reset if lessons change drastically
  const selectedLessons = lessons
      .filter(l => selectedIds.includes(l.id))
      .sort((a, b) => a.createdAt - b.createdAt);

  if (result && selectedLessons.length === 2) {
    const oldLesson = selectedLessons[0];
    const newLesson = selectedLessons[1];
    
    // Controls for video sync only avail if both are videos
    const showControls = oldLesson.mediaType === 'video' && newLesson.mediaType === 'video';
    // Ghost mode only for videos
    const allowGhostMode = showControls;

    const renderMedia = (lesson: Lesson, ref: React.RefObject<HTMLVideoElement | null>, className: string) => {
      if (!lesson.videoUrl) return <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">No Media</div>;

      if (lesson.mediaType === 'image') {
        return <img src={lesson.videoUrl} className={className} alt={lesson.title} />;
      }
      if (lesson.mediaType === 'audio') {
         return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white">
                <Mic className="w-12 h-12 mb-2 text-emerald-400" />
                <audio src={lesson.videoUrl} controls className="w-3/4 max-w-xs" />
            </div>
         );
      }
      return (
        <video 
            ref={ref}
            src={lesson.videoUrl} 
            className={className}
            muted
            playsInline
            onEnded={() => setIsPlaying(false)}
        />
      );
    };

    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setResult(null)} className="pl-0">
                <ArrowLeft className="w-5 h-5 mr-1" /> 다른 레슨 선택하기
            </Button>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-500" /> 레슨 비교 분석
            </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visual Comparison Area */}
            <div className="lg:col-span-2 space-y-4">
                <div className="bg-black rounded-xl overflow-hidden shadow-2xl relative aspect-video group">
                    {viewMode === 'SPLIT' || !allowGhostMode ? (
                        <div className="grid grid-cols-2 h-full">
                            <div className="relative border-r border-gray-800 bg-gray-900 flex items-center justify-center">
                                {renderMedia(oldLesson, video1Ref, "w-full h-full object-contain")}
                                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg z-10 font-semibold border border-white/10">
                                    Before ({oldLesson.date})
                                </div>
                            </div>
                            <div className="relative bg-gray-900 flex items-center justify-center">
                                {renderMedia(newLesson, video2Ref, "w-full h-full object-contain")}
                                <div className="absolute top-2 left-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg z-10 font-semibold shadow-lg border border-white/20">
                                    After ({newLesson.date})
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Ghost Mode (Overlay) - Only for video-video comparison
                        <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
                            {renderMedia(oldLesson, video1Ref, "absolute inset-0 w-full h-full object-contain opacity-50 grayscale mix-blend-screen")}
                            {renderMedia(newLesson, video2Ref, "absolute inset-0 w-full h-full object-contain opacity-80 mix-blend-normal")}
                            
                             <div className="absolute top-2 left-2 flex gap-2 z-10">
                                <span className="bg-gray-700/90 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg font-semibold border border-white/10">Before (흑백)</span>
                                <span className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-lg border border-white/20">After (컬러)</span>
                             </div>
                        </div>
                    )}

                    {/* Controls */}
                    {showControls && (
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-center gap-4 z-20">
                            <button 
                                onClick={handlePlayPause}
                                className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-all duration-200 hover:scale-110 transform shadow-lg"
                            >
                                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                            </button>
                            
                            <div className="flex bg-white/20 backdrop-blur-md rounded-lg p-1 shadow-lg">
                                <button 
                                    onClick={() => setViewMode('SPLIT')}
                                    className={`p-2 rounded transition-all duration-200 ${viewMode === 'SPLIT' ? 'bg-white text-black shadow-md' : 'text-white hover:bg-white/10'}`}
                                    title="나란히 보기"
                                >
                                    <Layout className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={() => setViewMode('GHOST')}
                                    className={`p-2 rounded transition-all duration-200 ${viewMode === 'GHOST' ? 'bg-white text-black shadow-md' : 'text-white hover:bg-white/10'}`}
                                    title="겹쳐 보기 (고스트 모드)"
                                >
                                    <Layers className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-lg hover:shadow-xl transition-shadow">
                    <div className="flex items-center gap-2 mb-2">
                         <h3 className="font-bold text-gray-900">향상 점수</h3>
                         <div className="text-xs px-2 py-0.5 bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 rounded-full font-semibold border border-emerald-200">AI 추정</div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden mb-1 shadow-inner">
                        <div 
                            className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 h-full rounded-full transition-all duration-1000 ease-out shadow-lg"
                            style={{ width: `${result.improvementScore}%` }}
                        />
                    </div>
                    <div className="flex justify-end text-emerald-600 font-bold text-lg">
                        {result.improvementScore} / 100
                    </div>
                </div>
            </div>

            {/* Analysis Text */}
            <div className="lg:col-span-1 space-y-4">
                 <div className="bg-white p-6 rounded-xl border border-emerald-100 shadow-lg h-full">
                    <h3 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" /> 분석 요약
                    </h3>
                    
                    <div className="mb-6">
                        <p className="text-gray-800 font-medium mb-3 bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                            "{result.summary}"
                        </p>
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">주요 변경점</h4>
                        <ul className="space-y-2">
                            {result.keyChanges.map((change, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                                    {change}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">코치 코멘트</h4>
                        <div className="prose prose-sm prose-emerald text-gray-600 max-h-[300px] overflow-y-auto">
                            <ReactMarkdown>{result.coachComment}</ReactMarkdown>
                        </div>
                    </div>
                 </div>
            </div>
        </div>
      </div>
    );
  }

  // Selection View
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="pl-0">
          <ArrowLeft className="w-5 h-5 mr-1" /> 돌아가기
        </Button>
      </div>

      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">레슨 비교 분석</h2>
        <p className="text-gray-500">비교하고 싶은 두 개의 레슨을 선택해주세요.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {lessons.map(lesson => {
          const isSelected = selectedIds.includes(lesson.id);
          const selectionIndex = selectedIds.indexOf(lesson.id);
          
          return (
            <div 
              key={lesson.id}
              onClick={() => toggleSelection(lesson.id)}
              className={`
                relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all
                ${isSelected 
                  ? 'border-emerald-500 ring-2 ring-emerald-200 transform scale-[1.02]' 
                  : 'border-transparent hover:border-gray-200 bg-white shadow-sm'}
              `}
            >
              <div className="aspect-video bg-gray-100 relative flex items-center justify-center overflow-hidden">
                 {lesson.mediaType === 'image' && <img src={lesson.videoUrl} className="w-full h-full object-cover" alt={lesson.title} />}
                 {lesson.mediaType === 'video' && (
                    lesson.videoUrl ? (
                        <video src={lesson.videoUrl} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">No Video</div>
                    )
                 )}
                 {lesson.mediaType === 'audio' && (
                    <div className="w-full h-full flex items-center justify-center bg-emerald-800">
                        <Mic className="w-10 h-10 text-white/50" />
                    </div>
                 )}
                 
                 {isSelected && (
                   <div className="absolute inset-0 bg-emerald-600/20 flex items-center justify-center">
                     <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold shadow-lg">
                       {selectionIndex + 1}
                     </div>
                   </div>
                 )}
              </div>
              <div className="p-3 bg-white">
                <h3 className="font-bold text-gray-900 text-sm truncate">{lesson.title}</h3>
                <p className="text-xs text-gray-500 flex justify-between">
                    <span>{lesson.date}</span>
                    <span className="text-[10px] bg-gray-100 px-1 rounded border border-gray-200 uppercase">{lesson.mediaType}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 pointer-events-none">
         <div className="bg-white p-2 rounded-xl shadow-xl border border-gray-100 pointer-events-auto flex items-center gap-4 max-w-md w-full">
            <div className="flex-1 px-2 text-sm text-gray-600">
                {selectedIds.length === 0 && "레슨 2개를 선택해주세요"}
                {selectedIds.length === 1 && "하나 더 선택해주세요"}
                {selectedIds.length === 2 && "준비 완료!"}
            </div>
            <Button 
                onClick={handleAnalyze} 
                disabled={selectedIds.length !== 2 || isAnalyzing}
                className="w-32"
                isLoading={isAnalyzing}
            >
                {isAnalyzing ? "분석 중..." : "비교 분석하기"}
            </Button>
         </div>
      </div>
    </div>
  );
};
