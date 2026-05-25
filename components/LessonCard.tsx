
import React, { useEffect, useMemo, useState } from 'react';
import { Lesson } from '../types';
import { Calendar, PlayCircle, ChevronRight, Image as ImageIcon, Mic, User, Send, Target, Award, AlertCircle, MessageCircle, CheckCircle, Trash2, Flag, BookOpen, Trophy } from 'lucide-react';
import { useLanguage } from './LanguageContext';
import { resolveMediaUrl } from '../services/apiService';

interface LessonCardProps {
  lesson: Lesson;
  onClick: (lesson: Lesson) => void;
  onShare: (lesson: Lesson, e: React.MouseEvent) => void;
  onDelete?: (lesson: Lesson, e: React.MouseEvent) => void;
  showMedia?: boolean;
}

export const LessonCard: React.FC<LessonCardProps> = ({ lesson, onClick, onShare, onDelete, showMedia = true }) => {
  const [mediaError, setMediaError] = useState(false);
  const { t } = useLanguage();
  const lessonMediaUrl = useMemo(
    () => resolveMediaUrl(lesson.videoUrl || (lesson.videoKey ? `/api/files/${lesson.videoKey}` : '')),
    [lesson.videoUrl, lesson.videoKey]
  );

  useEffect(() => {
    setMediaError(false);
  }, [lessonMediaUrl]);

  const renderMediaPreview = () => {
    if (mediaError || !lessonMediaUrl) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs">{t('media_load_error')}</span>
            </div>
        );
    }

    switch(lesson.mediaType) {
        case 'image':
            return (
                <img 
                    src={lessonMediaUrl} 
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
                           <div key={i} className="w-1 bg-emerald-700/50 rounded-full h-4" />
                        ))}
                    </div>
                </div>
            );
        case 'video':
        default:
             return (
                <video 
                    src={lessonMediaUrl} 
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
     if (mediaError || !lessonMediaUrl) return null;

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
             <div className="absolute top-2 left-2 z-20 px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 bg-gradient-to-r from-emerald-800 to-emerald-700 text-white border border-white/20">
                <Award className="w-3 h-3" /> Pro Lesson
             </div>
          );
      }

      switch(recordType) {
          case 'SCORE':
              return (
                <div className="absolute top-2 left-2 z-20 px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white border border-white/20">
                    <Trophy className="w-3 h-3" /> {t('record_type_round')}
                </div>
              );
          case 'LESSON':
              return (
                <div className="absolute top-2 left-2 z-20 px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white border border-white/20">
                    <BookOpen className="w-3 h-3" /> {t('record_type_lesson_rec')}
                </div>
              );
          default: // PRACTICE
              return (
                <div className="absolute top-2 left-2 z-20 px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 bg-gradient-to-r from-gray-800 to-gray-900 text-white border border-white/20">
                    <Target className="w-3 h-3" /> {t('record_type_practice')}
                </div>
              );
      }
  };

  return (
    <div 
      onClick={() => onClick(lesson)}
      className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
    >
      {showMedia ? (
        <div className="relative aspect-[9/16] bg-gray-200 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent z-10" />
          
          {renderMediaPreview()}
          {renderIcon()}
          
          <div className="absolute bottom-2 right-2 z-20 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs text-white font-semibold border border-white/10">
             {getTypeLabel()}
          </div>

          {/* Dynamic Badge */}
          {renderBadge()}

          {/* Status Badge for Feedback */}
          {lesson.feedbackStatus === 'REQUESTED' && (
               <div className="absolute top-2 right-2 z-30 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white animate-pulse border border-white/20">
                  <MessageCircle className="w-3.5 h-3.5 fill-current" /> {t('feedback_requested')}
              </div>
          )}
          {lesson.feedbackStatus === 'COMPLETED' && (
               <div className="absolute top-2 right-2 z-30 px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 bg-gradient-to-r from-emerald-700 to-emerald-800 text-white border border-white/20">
                  <CheckCircle className="w-3 h-3" /> {t('feedback_completed')}
              </div>
          )}
        </div>
      ) : (
        <div className="relative h-12 bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-center border-b border-gray-200">
          <span className="text-xs text-gray-400 font-medium">{t('media_hidden')}</span>
        </div>
      )}
      
      <div className="p-4 flex-1 flex flex-col">
        {/* Client Name */}
        <div className="flex items-center text-xs text-gray-400 mb-1.5">
          <User className="w-3 h-3 mr-1" />
          <span className="font-medium">{lesson.clientName || t('client')}</span>
        </div>
        
        <div className="flex justify-between items-start mb-2 gap-2">
          <h3 className="font-bold text-gray-900 line-clamp-1 group-hover:text-emerald-600 transition-colors text-sm">
            {lesson.title}
          </h3>
          {lesson.club && (
              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border border-gray-300 truncate max-w-[80px] shadow-sm">
                  {lesson.club}
              </span>
          )}
        </div>
        
        <div className="flex items-center text-xs text-gray-400 mb-3">
          <Calendar className="w-3 h-3 mr-1" />
          <span className="font-medium">{lesson.date}</span>
        </div>

        <div className="flex flex-wrap gap-1 mb-4">
          {lesson.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-2.5 py-1 bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 rounded-full text-[10px] font-semibold border border-emerald-200 shadow-sm">
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center text-xs font-semibold text-emerald-600 group-hover:text-emerald-700 transition-colors">
                {t('view_detail')} <ChevronRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-1 transition-transform" />
            </div>
            
            <div className="flex items-center gap-1">
                {onDelete && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(lesson, e); }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-red-50 hover:scale-110 transform duration-200"
                        title={t('delete')}
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
