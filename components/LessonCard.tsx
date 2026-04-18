
import React, { useState } from 'react';
import { Lesson } from '../types';
import { Calendar, PlayCircle, ChevronRight, Image as ImageIcon, Mic, User, Send, Target, Award, AlertCircle, MessageCircle, CheckCircle, Trash2, Flag, BookOpen, Trophy } from 'lucide-react';

interface LessonCardProps {
  lesson: Lesson;
  onClick: (lesson: Lesson) => void;
  onShare: (lesson: Lesson, e: React.MouseEvent) => void;
  onDelete?: (lesson: Lesson, e: React.MouseEvent) => void;
}

export const LessonCard: React.FC<LessonCardProps> = ({ lesson, onClick, onShare, onDelete }) => {
  const [mediaError, setMediaError] = useState(false);

  const renderMediaPreview = () => {
    if (mediaError || !lesson.videoUrl) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs">미디어를 불러올 수 없음</span>
            </div>
        );
    }

    switch(lesson.mediaType) {
        case 'image':
            return (
                <img 
                    src={lesson.videoUrl} 
                    className="w-full h-full object-cover" 
                    alt={lesson.title}
                    onError={() => setMediaError(true)}
                />
            );
        case 'audio':
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-800 to-gray-900">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                        <Mic className="w-8 h-8 text-emerald-300" />
                    </div>
                    <div className="mt-3 flex gap-1">
                        {[...Array(6)].map((_, i) => (
                           <div key={i} className="w-1 bg-emerald-400/50 rounded-full h-4" />
                        ))}
                    </div>
                </div>
            );
        case 'video':
        default:
             return (
                <video 
                    src={lesson.videoUrl} 
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    onMouseOver={(e) => !mediaError && e.currentTarget.play().catch(() => {})}
                    onMouseOut={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                    }}
                    onError={() => setMediaError(true)}
                />
             );
    }
  };

  const renderIcon = () => {
     if (mediaError || !lesson.videoUrl) return null;

     switch(lesson.mediaType) {
         case 'image': 
            return <ImageIcon className="absolute text-white/90 w-10 h-10 z-20 opacity-80 group-hover:scale-110 transition-transform" />;
         case 'audio':
            return null; // Icon already in center
         case 'video':
         default:
            return <PlayCircle className="absolute text-white/90 w-12 h-12 z-20 opacity-80 group-hover:scale-110 transition-transform" />;
     }
  };

  const getTypeLabel = () => {
    switch(lesson.mediaType) {
        case 'image': return 'PHOTO';
        case 'audio': return 'VOICE';
        default: return 'VIDEO';
    }
  }

  // Determine badge style based on who created it and record type
  const isSelfRecord = lesson.createdBy === 'CLIENT';
  const recordType = lesson.recordType || (isSelfRecord ? 'PRACTICE' : 'LESSON');

  const renderBadge = () => {
      if (!isSelfRecord) {
          return (
             <div className="absolute top-2 left-2 z-20 px-2 py-1 rounded-md text-xs font-bold shadow-sm flex items-center gap-1 bg-emerald-600/90 text-white">
                <Award className="w-3 h-3" /> Pro Lesson
             </div>
          );
      }

      switch(recordType) {
          case 'SCORE':
              return (
                <div className="absolute top-2 left-2 z-20 px-2 py-1 rounded-md text-xs font-bold shadow-sm flex items-center gap-1 bg-blue-600/90 text-white">
                    <Trophy className="w-3 h-3" /> 스코어
                </div>
              );
          case 'LESSON':
              return (
                <div className="absolute top-2 left-2 z-20 px-2 py-1 rounded-md text-xs font-bold shadow-sm flex items-center gap-1 bg-purple-600/90 text-white">
                    <BookOpen className="w-3 h-3" /> 레슨 기록
                </div>
              );
          default: // PRACTICE
              return (
                <div className="absolute top-2 left-2 z-20 px-2 py-1 rounded-md text-xs font-bold shadow-sm flex items-center gap-1 bg-gray-800/90 text-white">
                    <Target className="w-3 h-3" /> 연습
                </div>
              );
      }
  };

  return (
    <div 
      onClick={() => onClick(lesson)}
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group flex flex-col h-full relative"
    >
      <div className="relative aspect-[9/16] bg-gray-200 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
        
        {renderMediaPreview()}
        {renderIcon()}
        
        <div className="absolute bottom-2 right-2 z-20 bg-black/50 px-2 py-0.5 rounded text-xs text-white font-mono">
           {getTypeLabel()}
        </div>

        {/* Dynamic Badge */}
        {renderBadge()}

        {/* Status Badge for Feedback */}
        {lesson.feedbackStatus === 'REQUESTED' && (
             <div className="absolute top-2 right-2 z-30 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 bg-orange-500 text-white animate-pulse border-2 border-white">
                <MessageCircle className="w-3.5 h-3.5 fill-current" /> 피드백 요청
            </div>
        )}
        {lesson.feedbackStatus === 'COMPLETED' && (
             <div className="absolute top-2 right-2 z-30 px-2 py-1 rounded-md text-xs font-bold shadow-sm flex items-center gap-1 bg-emerald-500 text-white border border-emerald-400">
                <CheckCircle className="w-3 h-3" /> 피드백 완료
            </div>
        )}
      </div>
      
      <div className="p-4 flex-1 flex flex-col">
        {/* Client Name */}
        <div className="flex items-center text-xs text-gray-500 mb-1">
          <User className="w-3 h-3 mr-1" />
          {lesson.clientName || '회원'}
        </div>
        
        <div className="flex justify-between items-start mb-2 gap-2">
          <h3 className="font-bold text-gray-900 line-clamp-1 group-hover:text-emerald-600 transition-colors">
            {lesson.title}
          </h3>
          {lesson.club && (
              <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-800 border border-gray-200 truncate max-w-[80px]">
                  {lesson.club}
              </span>
          )}
        </div>
        
        <div className="flex items-center text-xs text-gray-500 mb-3">
          <Calendar className="w-3 h-3 mr-1" />
          {lesson.date}
        </div>

        <div className="flex flex-wrap gap-1 mb-4">
          {lesson.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-100">
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center text-xs font-medium text-emerald-600">
                자세히 보기 <ChevronRight className="w-3 h-3 ml-0.5" />
            </div>
            
            <div className="flex items-center gap-1">
                {onDelete && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(lesson, e); }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-red-50"
                        title="삭제"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
