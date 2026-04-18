
import React, { useState, useMemo, useEffect } from 'react';
import { Lesson, ViewState, ClientProfile, CoachProfile, Homework } from '../types';
import { LessonCard } from './LessonCard';
import { LessonDetail } from './LessonDetail';
import { ClientStats } from './ClientStats';
import { ClientProfileSettings } from './ClientProfileSettings';
import { PointHistoryModal } from './PointHistoryModal';
import { HomeworkModal } from './HomeworkModal';
import { NewLessonForm } from './NewLessonForm';
import { User, LogOut, History, PlayCircle, Plus, BarChart3, Bell, Sparkles, ListChecks, Globe, Calendar, Search, Filter, Eye, EyeOff } from 'lucide-react';
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
  const [view, setView] = useState<ViewState | 'STATS' | 'PROFILE'>('LIST');
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
      <header className="bg-white border-b border-gray-200 sticky top-0 z-[60]">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('PROFILE')}>
            <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
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
                className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg border border-gray-200 text-xs font-bold"
            >
                <Globe className="w-3.5 h-3.5" />
                {language.toUpperCase()}
            </button>

            {/* Points Badge */}
            <button 
                onClick={() => setShowPointHistory(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200 shadow-sm hover:bg-yellow-100 transition-colors"
            >
                <div className="bg-yellow-100 rounded-full p-0.5"><div className="w-3 h-3 bg-yellow-400 rounded-full" /></div>
                <span className="text-xs font-bold">{clientProfile.currentPoints?.toLocaleString() || 0} P</span>
            </button>
            <button 
                onClick={onLogout} 
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors relative z-50 cursor-pointer"
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
                
                {/* Today's Mission Card */}
                <div 
                    onClick={() => setShowHomeworkModal(true)}
                    className="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 relative overflow-hidden transition-all hover:shadow-md cursor-pointer group"
                >
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <ListChecks className="w-24 h-24 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                        {t('today_mission')}
                        {todaysHomework.length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
                                {todaysHomework.filter(h => !h.isCompleted).length}
                            </span>
                        )}
                    </h3>
                    <p className="text-sm text-gray-500 mb-3 relative z-10">
                        {todaysHomework.length === 0 
                            ? t('no_mission_today')
                            : `${todaysHomework.length}개의 미션이 있습니다. (달성률 ${Math.round((todaysHomework.filter(h => h.isCompleted).length / todaysHomework.length) * 100)}%)`
                        }
                    </p>
                    <div className="flex gap-2 relative z-10">
                        <Button 
                            variant="secondary" 
                            className="text-xs py-1.5 h-auto bg-white/80 backdrop-blur-sm"
                            onClick={(e) => { e.stopPropagation(); setShowHomeworkModal(true); }}
                        >
                            {t('mission_manage')}
                        </Button>
                        <Button 
                            variant="primary" 
                            className="text-xs py-1.5 h-auto"
                            onClick={(e) => { e.stopPropagation(); handleAIMissionGeneration(); }}
                            icon={<Sparkles className="w-3 h-3" />}
                            isLoading={isGeneratingMissions}
                        >
                            {t('ai_recommend')}
                        </Button>
                    </div>
                </div>

                {/* Main Action Buttons */}
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => { setSelectedLesson(null); setView('STATS'); }}
                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                    >
                        <div className="bg-blue-50 p-3 rounded-full text-blue-600">
                            <BarChart3 className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-gray-800 text-sm">{t('stats')}</span>
                    </button>
                     <button 
                        onClick={() => { setSelectedLesson(null); setView('PROFILE'); }}
                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                    >
                        <div className="bg-purple-50 p-3 rounded-full text-purple-600">
                            <User className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-gray-800 text-sm">{t('my_info')}</span>
                    </button>
                </div>
                
                {/* Lesson List Header with Filter Toggle */}
                <div className="flex items-center justify-between pt-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <History className="w-5 h-5 text-gray-500" /> {t('recent_records')}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={toggleShowMedia}
                            className={`p-2 rounded-lg transition-colors ${showMedia ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}
                            title={showMedia ? '미디어 숨기기' : '미디어 표시'}
                        >
                            {showMedia ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button 
                            onClick={() => setShowDateFilter(!showDateFilter)}
                            className={`p-2 rounded-lg transition-colors ${showDateFilter || (searchStartDate || searchEndDate) ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}
                        >
                            <Filter className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Date Filter Section */}
                {(showDateFilter || searchStartDate || searchEndDate) && (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm animate-fade-in">
                        <div className="flex gap-2 items-center mb-2">
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-500 mb-1">시작일</label>
                                <input 
                                    type="date" 
                                    value={searchStartDate}
                                    onChange={(e) => setSearchStartDate(e.target.value)}
                                    className="w-full text-xs p-2 border border-gray-200 rounded focus:border-emerald-500 outline-none"
                                />
                            </div>
                            <span className="text-gray-400 mt-4">~</span>
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-500 mb-1">종료일</label>
                                <input 
                                    type="date" 
                                    value={searchEndDate}
                                    onChange={(e) => setSearchEndDate(e.target.value)}
                                    className="w-full text-xs p-2 border border-gray-200 rounded focus:border-emerald-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button onClick={clearDateFilter} className="text-xs text-gray-400 underline hover:text-red-500">
                                필터 초기화
                            </button>
                        </div>
                    </div>
                )}

                {/* Lesson List */}
                {allMyLessons.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
                        <PlayCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-gray-900 font-bold">{t('no_records')}</h3>
                        <p className="text-gray-500 text-sm">
                            {(searchStartDate || searchEndDate) ? '검색 기간에 해당하는 기록이 없습니다.' : t('no_records_desc')}
                        </p>
                        {(searchStartDate || searchEndDate) && (
                            <button onClick={clearDateFilter} className="mt-2 text-emerald-600 text-sm font-bold hover:underline">
                                전체 목록 보기
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {allMyLessons.map(lesson => (
                            <div key={lesson.id} className="h-full">
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

        {/* Floating Add Button */}
        {view === 'LIST' && (
             <button 
                onClick={() => {
                    setIsEditingLesson(false);
                    setView('NEW');
                }}
                className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-lg shadow-emerald-200 flex items-center justify-center hover:bg-emerald-700 hover:scale-105 transition-all z-40"
            >
                <Plus className="w-8 h-8" />
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
