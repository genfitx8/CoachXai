
import React, { useState, useMemo, useEffect } from 'react';
import { Lesson, ViewState, ClientProfile, CoachProfile, Homework } from '../types';
import { LessonCard } from './LessonCard';
import { LessonDetail } from './LessonDetail';
import { ClientStats } from './ClientStats';
import { ClientProfileSettings } from './ClientProfileSettings';
import { PointHistoryModal } from './PointHistoryModal';
import { HomeworkModal } from './HomeworkModal';
import { NewLessonForm } from './NewLessonForm';
import { ClientReservation } from './ClientReservation';
import { ClientBayReservation } from './ClientBayReservation';
import { MyBayReservations } from './MyBayReservations';
import CalendarIntegrationComponent from './CalendarIntegration';
import { User, LogOut, History, PlayCircle, Plus, BarChart3, Bell, Sparkles, ListChecks, Globe, Calendar, Search, Filter, Eye, EyeOff, ChevronRight, TrendingUp, Award, Target, ClipboardList } from 'lucide-react';
import { Button } from './Button';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { pointService } from '../services/pointService';
import { generateGolfMissions } from '../services/geminiService';
import { NotificationToast } from './NotificationToast';
import { useLanguage } from './LanguageContext';

interface ClientAppProps {
  clientProfile: ClientProfile;
  allLessons: Lesson[];
  onLogout: () => void;
  onUpdateLesson: (lesson: Lesson) => void;
  onSaveNewRecord?: (lesson: Lesson, homeworkBatch?: Homework[]) => void; 
  onDeleteLesson?: (lessonId: string) => void;
  onUpdateProfile?: (updatedProfile: ClientProfile) => void;
  // onSearchCoach is handled internally now
}

// Helper to get local YYYY-MM-DD
const getLocalISODate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const ClientApp: React.FC<ClientAppProps> = ({ clientProfile, allLessons, onLogout, onUpdateLesson, onSaveNewRecord, onDeleteLesson, onUpdateProfile }) => {
  const { t, language, setLanguage } = useLanguage();
  const [view, setView] = useState<ViewState | 'STATS' | 'PROFILE' | 'RESERVATION' | 'CALENDAR_INTEGRATION' | 'BAY_RESERVATION' | 'MY_BAY_RESERVATIONS'>('LIST');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [showPointHistory, setShowPointHistory] = useState(false);
  
  // Media visibility toggle
  const [showMedia, setShowMedia] = useState<boolean>(() => {
    const saved = localStorage.getItem('client_showMedia');
    return saved ? JSON.parse(saved) : false; // Default to hidden (false)
  });
  
  // Date Filtering State
  const [searchStartDate, setSearchStartDate] = useState('');
  const [searchEndDate, setSearchEndDate] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Edit Mode State
  const [isEditingLesson, setIsEditingLesson] = useState(false);

  // Homework State
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [notification, setNotification] = useState<{title: string, message: string} | null>(null);
  
  // Mission/Homework Modal State
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  
  // AI Mission State
  const [isGeneratingMissions, setIsGeneratingMissions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showAiMissionModal, setShowAiMissionModal] = useState(false);

  const clientId = `${clientProfile.name}_${clientProfile.phone}`.trim();
  const isFirebaseMode = firebaseService.isInitialized();

  // Load Homework & AI Check
  useEffect(() => {
    const loadHomework = async () => {
        let hw: Homework[] = [];
        if (isFirebaseMode) {
            hw = await firebaseService.getHomework(clientId);
        } else {
            const all = storageService.getHomework();
            hw = all.filter(h => h.clientId === clientId);
        }
        setHomeworkList(hw.sort((a,b) => b.createdAt - a.createdAt));

        // AI Notification Logic
        const today = getLocalISODate();
        const todaysTasks = hw.filter(h => h.date === today);
        const incomplete = todaysTasks.filter(h => !h.isCompleted);

        if (incomplete.length > 0) {
            setNotification({
                title: "AI 코치 알림",
                message: `${clientProfile.name}님, 오늘 남은 과제가 ${incomplete.length}개 있어요! 지금 시작해보세요 🏌️‍♂️`
            });
        }
    };
    loadHomework();
  }, [clientId, isFirebaseMode, clientProfile.name]);

  const saveNewHomework = async (title: string) => {
      const today = getLocalISODate();
      const newHomework: Homework = {
          id: crypto.randomUUID(),
          clientId,
          title: title.trim(),
          isCompleted: false,
          date: today,
          createdAt: Date.now()
      };

      // Optimistic Update
      setHomeworkList(prev => [newHomework, ...prev]);

      if (isFirebaseMode) {
          await firebaseService.saveHomework(newHomework);
      } else {
          const all = storageService.getHomework();
          storageService.saveHomework([...all, newHomework]);
      }
  };

  // Called when HomeworkModal adds tasks
  const handleHomeworkUpdated = async () => {
      let hw: Homework[] = [];
      if (isFirebaseMode) {
          hw = await firebaseService.getHomework(clientId);
      } else {
          const all = storageService.getHomework();
          hw = all.filter(h => h.clientId === clientId);
      }
      setHomeworkList(hw.sort((a,b) => b.createdAt - a.createdAt));
      setShowHomeworkModal(false);
      setNotification({ title: "미션 추가 완료", message: "새로운 미션이 등록되었습니다." });
  };

  const handleAIMissionGeneration = async () => {
      setIsGeneratingMissions(true);
      try {
          // Pass relevant lessons (e.g., recent 5)
          const recentLessons = allLessons
              .filter(l => l.clientName === clientProfile.name && l.clientPhone === clientProfile.phone)
              .sort((a,b) => b.createdAt - a.createdAt)
              .slice(0, 5);

          const suggestions = await generateGolfMissions(clientProfile, recentLessons);
          setAiSuggestions(suggestions);
          setShowAiMissionModal(true);
      } catch (e) {
          console.error(e);
          setNotification({ title: "오류", message: "AI 미션 생성 중 문제가 발생했습니다." });
      } finally {
          setIsGeneratingMissions(false);
      }
  };

  const handleSelectAiMission = async (mission: string) => {
      await saveNewHomework(mission);
      setShowAiMissionModal(false);
      setNotification({ title: "AI 미션 등록", message: "AI가 추천한 미션이 등록되었습니다!" });
  };

  const todaysHomework = useMemo(() => {
      const today = getLocalISODate();
      return homeworkList.filter(h => h.date === today);
  }, [homeworkList]);

  // All lessons (including data images) - used for Stats
  const allMyLessons = useMemo(() => {
    return allLessons
      // Match by Name AND Phone to handle duplicates
      .filter(l => l.clientName === clientProfile.name && l.clientPhone === clientProfile.phone)
      // Apply Date Filter
      .filter(l => {
          if (searchStartDate && l.date < searchStartDate) return false;
          if (searchEndDate && l.date > searchEndDate) return false;
          return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [allLessons, clientProfile, searchStartDate, searchEndDate]);

  const handleBackToList = () => {
    setSelectedLesson(null);
    setView('LIST');
    setIsEditingLesson(false);
  };

  const handleSaveProfile = (updatedProfile: ClientProfile) => {
      if (onUpdateProfile) {
          onUpdateProfile(updatedProfile);
          setView('LIST');
      }
  };

  const handleLocalUpdate = (updatedLesson: Lesson) => {
      onUpdateLesson(updatedLesson);
      setSelectedLesson(updatedLesson);
  };

  const handleSaveRecord = async (lesson: Lesson, homeworkBatch?: Homework[]) => {
      // 1. If Editing, call update directly
      if (isEditingLesson) {
          onUpdateLesson(lesson);
          setIsEditingLesson(false);
      } else {
          // 2. If New, call save
          if (onSaveNewRecord) {
            onSaveNewRecord(lesson, homeworkBatch);
          }
          
          // Award points for practice recording (only for new)
          if (onUpdateProfile) {
              try {
                  const rule = pointService.getRules().LESSON_RECORDING;
                  const updatedProfile = await pointService.addTransaction(
                      clientProfile,
                      rule,
                      'LESSON_RECORD',
                      '자율 연습 기록 저장'
                  );
                  onUpdateProfile(updatedProfile);
                  setNotification({ title: "포인트 적립", message: `💰 ${rule}P가 적립되었습니다!` });
              } catch(e) { console.error(e); }
          }
      }

      // 3. Set the lesson as selected so it displays in DETAIL view
      setSelectedLesson(lesson);
      setView('DETAIL');
  };

  const handleEditLesson = (lesson: Lesson) => {
      setSelectedLesson(lesson);
      setIsEditingLesson(true);
      setView('NEW');
  };

  const toggleLanguage = () => {
      const nextLang = language === 'ko' ? 'en' : language === 'en' ? 'ja' : 'ko';
      setLanguage(nextLang);
  };

  const clearDateFilter = () => {
      setSearchStartDate('');
      setSearchEndDate('');
      setShowDateFilter(false);
  };

  const toggleShowMedia = () => {
      const newValue = !showMedia;
      setShowMedia(newValue);
      localStorage.setItem('client_showMedia', JSON.stringify(newValue));
  };

  // Implement the coach search logic here
  const handleCoachSearchByName = async (term: string) => {
      let coaches: CoachProfile[] = [];
      if (firebaseService.isInitialized()) {
          coaches = await firebaseService.searchCoachesByName(term);
      } else {
          coaches = storageService.searchCoachesByName(term);
      }
      
      return coaches.map(c => ({
          id: c.id,
          name: c.name,
          phoneLast4: c.phone ? c.phone.slice(-4) : '****'
      }));
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-20">
      <header className="bg-gradient-to-r from-white via-emerald-50 to-white border-b border-emerald-100/50 sticky top-0 z-[60] shadow-sm">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('PROFILE')}>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-2 rounded-full text-white shadow-md shadow-emerald-500/30">
                <User className="w-5 h-5" />
            </div>
            <div>
                <h1 className="font-bold text-gray-900 leading-tight">{clientProfile.name}님</h1>
                <p className="text-[10px] text-gray-500 flex items-center gap-1">
                    {clientProfile.designatedCoach ? `Coach: ${clientProfile.designatedCoach}` : clientProfile.phone}
                </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={toggleLanguage}
                className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg border border-gray-200 text-xs font-bold hover:bg-gray-100 transition-colors"
            >
                <Globe className="w-3.5 h-3.5" />
                {language.toUpperCase()}
            </button>

            {/* Points Badge */}
            <button 
                onClick={() => setShowPointHistory(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-700 rounded-full border border-yellow-200 shadow-md hover:shadow-lg hover:from-yellow-100 hover:to-amber-100 transition-all duration-200 hover:scale-105 transform"
            >
                <div className="bg-gradient-to-br from-yellow-300 to-yellow-400 rounded-full p-1 shadow-sm"><div className="w-2 h-2 bg-white rounded-full" /></div>
                <span className="text-xs font-bold">{clientProfile.currentPoints?.toLocaleString() || 0} P</span>
            </button>
            <button 
                onClick={onLogout} 
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all duration-200 relative z-50 cursor-pointer hover:scale-110 transform"
                aria-label={t('logout')}
            >
                <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {view === 'LIST' && (
            <div className="space-y-6 animate-fade-in">
                
                {/* Lesson Statistics Hero Section */}
                <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 rounded-2xl p-6 shadow-xl overflow-hidden">
                    {/* Decorative background circles */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12" />
                    
                    <div className="relative z-10">
                        <h2 className="text-white text-xl font-black mb-1 flex items-center gap-2">
                            <TrendingUp className="w-6 h-6" />
                            나의 기록 통계
                        </h2>
                        <p className="text-emerald-100 text-sm mb-4">한눈에 보는 나의 성장 기록</p>
                        
                        {/* Statistics Cards */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="glass rounded-xl p-3 text-center">
                                <div className="text-2xl font-black text-gray-900">{allMyLessons.length}</div>
                                <div className="text-[10px] text-gray-600 font-semibold mt-1">총 기록</div>
                            </div>
                            <div className="glass rounded-xl p-3 text-center">
                                <div className="text-2xl font-black text-gray-900">
                                    {allMyLessons.filter(l => {
                                        const lessonMonth = l.date.substring(0, 7);
                                        const currentMonth = new Date().toISOString().substring(0, 7);
                                        return lessonMonth === currentMonth;
                                    }).length}
                                </div>
                                <div className="text-[10px] text-gray-600 font-semibold mt-1">이번 달</div>
                            </div>
                            <div className="glass rounded-xl p-3 text-center">
                                <div className="text-xs font-black text-gray-900 leading-tight">
                                    {allMyLessons.length > 0 
                                        ? new Date(allMyLessons[0].date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                                        : '-'}
                                </div>
                                <div className="text-[10px] text-gray-600 font-semibold mt-1">최근 기록</div>
                            </div>
                        </div>
                        
                        {/* Quick Action Buttons */}
                        <div className="grid grid-cols-3 gap-2">
                            <button 
                                onClick={() => { setSelectedLesson(null); setView('STATS'); }}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg px-3 py-2.5 text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-white/20 hover:scale-[1.02]"
                            >
                                <BarChart3 className="w-4 h-4" />
                                상세 통계
                            </button>
                            <button 
                                onClick={() => { setSelectedLesson(null); setView('RESERVATION'); }}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg px-3 py-2.5 text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-white/20 hover:scale-[1.02]"
                            >
                                <Calendar className="w-4 h-4" />
                                레슨 예약
                            </button>
                            <button 
                                onClick={() => { setSelectedLesson(null); setView('PROFILE'); }}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg px-3 py-2.5 text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-white/20 hover:scale-[1.02]"
                            >
                                <User className="w-4 h-4" />
                                내 정보
                            </button>
                            <button 
                                onClick={() => { setSelectedLesson(null); setView('BAY_RESERVATION'); }}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg px-3 py-2.5 text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-white/20 hover:scale-[1.02]"
                            >
                                <Target className="w-4 h-4" />
                                타석 예약
                            </button>
                            <button 
                                onClick={() => { setSelectedLesson(null); setView('MY_BAY_RESERVATIONS'); }}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg px-3 py-2.5 text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-white/20 hover:scale-[1.02]"
                            >
                                <ClipboardList className="w-4 h-4" />
                                예약 내역
                            </button>
                            <button 
                                onClick={() => { setSelectedLesson(null); setView('CALENDAR_INTEGRATION'); }}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg px-3 py-2.5 text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 border border-white/20 hover:scale-[1.02]"
                            >
                                <Calendar className="w-4 h-4" />
                                캘린더 연동
                            </button>
                        </div>
                    </div>
                </div>

                {/* Lesson Recording Button - Prominent CTA */}
                <button
                    onClick={() => setView('NEW')}
                    className="w-full bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700 text-white rounded-2xl px-8 py-5 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 group relative overflow-hidden"
                >
                    {/* Animated background overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                    
                    <div className="relative flex items-center gap-3">
                        <div className="bg-white/20 p-2.5 rounded-full group-hover:bg-white/30 transition-colors">
                            <PlayCircle className="w-7 h-7" />
                        </div>
                        <div className="text-left">
                            <div className="text-xl font-black">레슨 기록 시작</div>
                            <div className="text-xs text-emerald-100 font-medium">새로운 레슨을 기록하세요</div>
                        </div>
                    </div>
                    
                    <Plus className="w-6 h-6 ml-auto group-hover:rotate-90 transition-transform duration-300" />
                </button>

                {/* Today's Mission Card - Compact */}
                {todaysHomework.filter(h => !h.isCompleted).length > 0 && (
                    <div 
                        onClick={() => setShowHomeworkModal(true)}
                        className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border-2 border-amber-200 cursor-pointer hover:scale-[1.02] transition-transform flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-400 p-2 rounded-lg">
                                <ListChecks className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-sm">오늘의 미션</h3>
                                <p className="text-xs text-gray-600">
                                    {todaysHomework.filter(h => !h.isCompleted).length}개 남음
                                </p>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-amber-600" />
                    </div>
                )}
                
                {/* Lesson List Header with Filter Toggle */}
                <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full" />
                        <h2 className="text-xl font-black text-gray-900">{t('recent_records')}</h2>
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">
                            {allMyLessons.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={toggleShowMedia}
                            className={`p-2 rounded-lg transition-all duration-200 transform hover:scale-110 ${showMedia ? 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            title={showMedia ? '미디어 숨기기' : '미디어 표시'}
                        >
                            {showMedia ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button 
                            onClick={() => setShowDateFilter(!showDateFilter)}
                            className={`p-2 rounded-lg transition-all duration-200 transform hover:scale-110 ${showDateFilter || (searchStartDate || searchEndDate) ? 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        >
                            <Filter className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Date Filter Section */}
                {(showDateFilter || searchStartDate || searchEndDate) && (
                    <div className="bg-gradient-to-br from-white to-emerald-50/30 p-4 rounded-xl border border-emerald-100 shadow-md animate-slide-in-up">
                        <div className="flex gap-2 items-center mb-2">
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-600 font-semibold mb-1">시작일</label>
                                <input 
                                    type="date" 
                                    value={searchStartDate}
                                    onChange={(e) => setSearchStartDate(e.target.value)}
                                    className="w-full text-xs p-2 border border-emerald-200 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                                />
                            </div>
                            <span className="text-gray-400 mt-4 font-bold">~</span>
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-600 font-semibold mb-1">종료일</label>
                                <input 
                                    type="date" 
                                    value={searchEndDate}
                                    onChange={(e) => setSearchEndDate(e.target.value)}
                                    className="w-full text-xs p-2 border border-emerald-200 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button onClick={clearDateFilter} className="text-xs text-gray-500 font-semibold underline hover:text-red-500 transition-colors">
                                필터 초기화
                            </button>
                        </div>
                    </div>
                )}

                {/* Lesson List */}
                {allMyLessons.length === 0 ? (
                    <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200">
                        <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                            <PlayCircle className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-gray-900 font-bold text-lg mb-2">{t('no_records')}</h3>
                        <p className="text-gray-500 text-sm px-4">
                            {(searchStartDate || searchEndDate) ? '검색 기간에 해당하는 기록이 없습니다.' : t('no_records_desc')}
                        </p>
                        {(searchStartDate || searchEndDate) && (
                            <button onClick={clearDateFilter} className="mt-4 text-emerald-600 text-sm font-bold hover:underline">
                                전체 목록 보기
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {allMyLessons.map((lesson, index) => (
                            <div 
                                key={lesson.id} 
                                className="h-full animate-fade-in" 
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <LessonCard 
                                    lesson={lesson} 
                                    onClick={(l) => { setSelectedLesson(l); setView('DETAIL'); }}
                                    onShare={() => {}}
                                    onDelete={lesson.createdBy === 'CLIENT' ? (l, e) => {
                                        e.stopPropagation();
                                        if(onDeleteLesson && confirm('삭제하시겠습니까?')) onDeleteLesson(l.id);
                                    } : undefined}
                                    showMedia={showMedia}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {view === 'DETAIL' && selectedLesson && (
            <LessonDetail 
                lesson={selectedLesson}
                role="CLIENT"
                onBack={handleBackToList}
                onUpdate={handleLocalUpdate}
                onDelete={selectedLesson.createdBy === 'CLIENT' && onDeleteLesson ? () => {
                     onDeleteLesson(selectedLesson.id);
                     handleBackToList();
                } : undefined}
                onEdit={handleEditLesson}
            />
        )}

        {view === 'STATS' && (
            <ClientStats 
                lessons={allMyLessons} 
                onBack={handleBackToList} 
            />
        )}

        {view === 'PROFILE' && (
            <ClientProfileSettings 
                profile={clientProfile}
                allLessons={allMyLessons}
                onSave={handleSaveProfile}
                onBack={handleBackToList}
                onSearchCoach={handleCoachSearchByName}
            />
        )}

        {view === 'RESERVATION' && (
            <ClientReservation
                clientProfile={clientProfile}
                onBack={handleBackToList}
            />
        )}

        {view === 'BAY_RESERVATION' && (
            <ClientBayReservation
                clientProfile={clientProfile}
                onBack={handleBackToList}
                onPointsUpdated={(updatedProfile) => {
                    if (onUpdateProfile) onUpdateProfile(updatedProfile);
                }}
            />
        )}

        {view === 'MY_BAY_RESERVATIONS' && (
            <MyBayReservations
                clientProfile={clientProfile}
                onBack={handleBackToList}
            />
        )}

        {view === 'CALENDAR_INTEGRATION' && (
            <CalendarIntegrationComponent
                userId={`${clientProfile.name}_${clientProfile.phone}`}
                userRole="CLIENT"
                lessons={allMyLessons}
                onBack={handleBackToList}
            />
        )}

        {/* Floating Add Button */}
        {view === 'LIST' && (
             <button 
                onClick={() => {
                    setIsEditingLesson(false);
                    setView('NEW');
                }}
                className="group fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full shadow-lg shadow-emerald-300 flex items-center justify-center hover:scale-110 transition-all z-40 relative"
            >
                <Plus className="w-7 h-7 group-hover:rotate-90 transition-transform duration-300" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse font-bold">
                    NEW
                </span>
            </button>
        )}

        {/* New Lesson Form (Self Record or Edit) */}
        {view === 'NEW' && (
            <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
                <NewLessonForm 
                    existingClients={[clientProfile]} // Pass self
                    userRole="CLIENT"
                    currentUser={clientProfile}
                    onSave={handleSaveRecord}
                    onCancel={() => {
                        if (isEditingLesson) {
                            setView('DETAIL');
                            setIsEditingLesson(false);
                        } else {
                            setView('LIST');
                        }
                    }}
                    initialData={isEditingLesson && selectedLesson ? selectedLesson : undefined}
                />
            </div>
        )}

      </main>

      {/* Modals */}
      <PointHistoryModal 
        isOpen={showPointHistory} 
        onClose={() => setShowPointHistory(false)} 
        client={clientProfile} 
      />

      {showHomeworkModal && (
          <HomeworkModal 
            isOpen={showHomeworkModal}
            onClose={() => setShowHomeworkModal(false)}
            clientId={clientId}
            clientName={clientProfile.name}
            isFirebaseMode={isFirebaseMode}
            onAssign={handleHomeworkUpdated}
          />
      )}

      {/* AI Mission Suggestion Modal */}
      {showAiMissionModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                  <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white text-center">
                      <Sparkles className="w-12 h-12 mx-auto mb-2 text-yellow-300 animate-pulse" />
                      <h3 className="text-xl font-bold">AI 코치의 추천 미션</h3>
                      <p className="text-indigo-100 text-sm">회원님의 최근 기록을 분석했습니다.</p>
                  </div>
                  <div className="p-4 space-y-3">
                      {aiSuggestions.map((mission, idx) => (
                          <button 
                            key={idx}
                            onClick={() => handleSelectAiMission(mission)}
                            className="w-full text-left p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl transition-all group"
                          >
                              <div className="flex items-start gap-3">
                                  <div className="bg-white p-2 rounded-full shadow-sm text-indigo-500 font-bold text-xs border border-gray-100">
                                      {idx + 1}
                                  </div>
                                  <div>
                                      <p className="font-bold text-gray-800 text-sm group-hover:text-indigo-700">{mission}</p>
                                      <p className="text-xs text-gray-400 mt-1">클릭하여 내 미션으로 등록</p>
                                  </div>
                              </div>
                          </button>
                      ))}
                  </div>
                  <div className="p-4 border-t border-gray-100">
                      <Button variant="secondary" onClick={() => setShowAiMissionModal(false)} className="w-full">{t('cancel')}</Button>
                  </div>
              </div>
          </div>
      )}

      {/* Toast Notification */}
      <NotificationToast 
        title={notification?.title || ''} 
        message={notification?.message || ''} 
        visible={!!notification} 
        onClose={() => setNotification(null)} 
      />
    </div>
  );
};
