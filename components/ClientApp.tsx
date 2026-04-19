
import React, { useState, useMemo, useEffect } from 'react';
import { Lesson, ViewState, ClientProfile, CoachProfile, Homework, QuickLogEntry } from '../types';
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
import { PointPurchase } from './PointPurchase';
import { PaymentSuccess } from './PaymentSuccess';
import { PaymentFail } from './PaymentFail';
import { MembershipPurchase } from './MembershipPurchase';
import { MembershipPaymentSuccess } from './MembershipPaymentSuccess';
import { User, LogOut, History, PlayCircle, Plus, BarChart3, Bell, Sparkles, ListChecks, Globe, Calendar, Search, Filter, Eye, EyeOff, ChevronRight, ChevronLeft, TrendingUp, Award, Target, ClipboardList, ShoppingCart, PenLine, Crown } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { pointService } from '../services/pointService';
import { GolfAIAgent } from './GolfAIAgent';
import { QuickGolfLog } from './QuickGolfLog';
import { WeeklyInsightCard } from './WeeklyInsightCard';
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
  const [view, setView] = useState<ViewState | 'STATS' | 'PROFILE' | 'RESERVATION' | 'BAY_RESERVATION' | 'MY_BAY_RESERVATIONS' | 'POINT_PURCHASE' | 'MEMBERSHIP_PURCHASE' | 'PAYMENT_SUCCESS' | 'MEMBERSHIP_PAYMENT_SUCCESS' | 'PAYMENT_FAIL' | 'RECENT_RECORDS' | 'AI_AGENT' | 'QUICK_LOG' | 'WEEKLY_INSIGHT'>(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseType = params.get('purchase');
    if (params.get('paymentKey') && params.get('orderId')) {
      return purchaseType === 'membership' ? 'MEMBERSHIP_PAYMENT_SUCCESS' : 'PAYMENT_SUCCESS';
    }
    if (params.get('code') || params.get('message')) return 'PAYMENT_FAIL';
    return 'LIST';
  });
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

  // Quick Log State
  const [quickLogs, setQuickLogs] = useState<QuickLogEntry[]>([]);
  const isProMember = clientProfile.subscriptionPlan === 'PRO' || !!clientProfile.isSubscribed;
  const FREE_RECORD_LIMIT = 5;
  const FREE_AI_DAILY_LIMIT = 1;

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

  // Load Quick Logs
  useEffect(() => {
    const loadQuickLogs = async () => {
      let logs: QuickLogEntry[] = [];
      if (isFirebaseMode) {
        logs = await firebaseService.getQuickLogsByClient(clientId);
      } else {
        logs = storageService.getQuickLogsByClient(clientId);
      }
      setQuickLogs(logs.sort((a, b) => b.createdAt - a.createdAt));
    };
    loadQuickLogs();
  }, [clientId, isFirebaseMode]);

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

  const handleMissionSaved = () => {
      setNotification({ title: 'AI 미션 등록', message: 'AI가 추천한 미션이 등록되었습니다!' });
  };

  const handleSaveQuickLog = async (entry: QuickLogEntry) => {
    if (isFirebaseMode) {
      await firebaseService.saveQuickLog(entry);
    } else {
      storageService.saveQuickLog(entry);
    }
    setQuickLogs((prev) => [entry, ...prev]);
    setNotification({ title: '기록 완료', message: '오늘의 빠른 기록이 저장되었습니다! 🏌️' });
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

  const today = getLocalISODate();
  const myLessonsRaw = useMemo(() => {
    return allLessons.filter(l => l.clientName === clientProfile.name && l.clientPhone === clientProfile.phone);
  }, [allLessons, clientProfile.name, clientProfile.phone]);
  const totalRecordCount = myLessonsRaw.length;
  const remainingFreeRecords = Math.max(0, FREE_RECORD_LIMIT - totalRecordCount);
  const todayAIUsage = useMemo(() => {
    return myLessonsRaw.filter((lesson) => lesson.date === today && !!lesson.aiAnalysis).length;
  }, [myLessonsRaw, today]);
  const remainingDailyAI = Math.max(0, FREE_AI_DAILY_LIMIT - todayAIUsage);

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
      if (!isEditingLesson && !isProMember && totalRecordCount >= FREE_RECORD_LIMIT) {
          setNotification({
            title: 'FREE 플랜 한도 도달',
            message: `무료 회원은 기록을 최대 ${FREE_RECORD_LIMIT}개까지 저장할 수 있어요. PRO로 업그레이드하면 무제한 기록이 가능합니다.`
          });
          setView('LIST');
          return;
      }

      if (!isEditingLesson && !isProMember && lesson.aiAnalysis && todayAIUsage >= FREE_AI_DAILY_LIMIT) {
          lesson = {
            ...lesson,
            aiAnalysis: 'FREE 플랜에서는 AI 분석을 하루 1회까지 사용할 수 있습니다. PRO 플랜으로 업그레이드하면 무제한 AI 분석과 상세 리포트를 사용할 수 있습니다.'
          };
          setNotification({
            title: 'AI 분석 일일 한도',
            message: '무료 회원은 AI 분석을 하루 1회까지 사용할 수 있어요. 오늘은 기본 피드백으로 저장됩니다.'
          });
      }

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
    <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#070b12] to-[#0B1220] text-slate-100 font-sans pb-20 safe-area-bottom">
      <header className="bg-[#0A0F1A]/95 border-b border-slate-800 sticky top-0 z-[60] shadow-lg shadow-black/30 backdrop-blur-xl safe-area-top">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('PROFILE')}>
            <div className="bg-gradient-to-br from-indigo-500/30 to-cyan-500/30 p-2 rounded-full text-cyan-100 shadow-md shadow-indigo-900/20 border border-cyan-200/20">
                <User className="w-5 h-5" />
            </div>
            <div>
                <h1 className="font-bold text-slate-100 leading-tight">{clientProfile.name}님</h1>
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    {clientProfile.designatedCoach ? `Coach: ${clientProfile.designatedCoach}` : clientProfile.phone}
                </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={toggleLanguage}
                className="flex items-center gap-1 px-2 py-1.5 bg-slate-900 text-slate-300 rounded-lg border border-slate-700 text-xs font-bold hover:text-cyan-200 transition-colors"
            >
                <Globe className="w-3.5 h-3.5" />
                {language.toUpperCase()}
            </button>

            {/* Points Badge */}
            <button 
                onClick={() => setShowPointHistory(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-amber-400/10 to-yellow-300/10 text-amber-200 rounded-full border border-amber-300/35 shadow-md shadow-amber-900/10 hover:from-amber-300/20 hover:to-yellow-200/20 transition-all duration-200 hover:scale-105 transform"
            >
                <div className="bg-gradient-to-br from-amber-300 to-yellow-300 rounded-full p-1 shadow-sm"><div className="w-2 h-2 bg-[#0A0F1A] rounded-full" /></div>
                <span className="text-xs font-bold">{clientProfile.currentPoints?.toLocaleString() || 0} P</span>
            </button>
            <button 
                onClick={onLogout} 
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-full transition-all duration-200 relative z-50 cursor-pointer hover:scale-110 transform"
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
                <div className="relative bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 rounded-2xl p-6 shadow-xl overflow-hidden">
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
                        <div className="grid grid-cols-3 gap-3">
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
                    </div>
                </div>

                {/* Membership Plan Status */}
                <div className={`rounded-2xl border p-4 ${isProMember ? 'bg-gradient-to-r from-indigo-600 to-blue-600 border-indigo-400/40 text-white' : 'bg-white border-emerald-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className={`text-xs font-bold ${isProMember ? 'text-indigo-100' : 'text-emerald-700'}`}>멤버십 플랜</p>
                            <h3 className="text-lg font-black">{isProMember ? '🔵 PRO' : '🟢 FREE'}</h3>
                        </div>
                        {!isProMember && (
                            <div className="text-right">
                                <p className="text-[11px] text-gray-500">추천 플랜</p>
                                <p className="text-sm font-black text-indigo-700">PRO 월 29,000원</p>
                            </div>
                        )}
                    </div>
                    {!isProMember ? (
                        <>
                        <button
                            onClick={() => setView('MEMBERSHIP_PURCHASE')}
                            className="w-full mb-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl px-4 py-3 text-sm font-bold shadow-md hover:from-indigo-700 hover:to-blue-700 transition-colors"
                        >
                            PRO 멤버십 바로 결제하기
                        </button>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2">
                                <p className="text-gray-500">기록 한도</p>
                                <p className="font-bold text-gray-900">{totalRecordCount}/{FREE_RECORD_LIMIT}개</p>
                                <p className="text-[10px] text-emerald-700">남은 {remainingFreeRecords}개</p>
                            </div>
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2">
                                <p className="text-gray-500">오늘 AI 분석</p>
                                <p className="font-bold text-gray-900">{todayAIUsage}/{FREE_AI_DAILY_LIMIT}회</p>
                                <p className="text-[10px] text-emerald-700">남은 {remainingDailyAI}회</p>
                            </div>
                            <div className="rounded-lg bg-gray-50 border border-gray-200 p-2 text-gray-600">기본 피드백</div>
                            <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-indigo-700 font-semibold">PRO: 성장 그래프 · 훈련 추천</div>
                        </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-white/15 border border-white/20 p-2">기록 무제한</div>
                            <div className="rounded-lg bg-white/15 border border-white/20 p-2">AI 무제한</div>
                            <div className="rounded-lg bg-white/15 border border-white/20 p-2">상세 분석</div>
                            <div className="rounded-lg bg-white/15 border border-white/20 p-2">성장 그래프 · 훈련 추천</div>
                        </div>
                    )}
                </div>

                {/* Lesson Recording Button - Prominent CTA */}
                <button
                    onClick={() => {
                        if (!isProMember && totalRecordCount >= FREE_RECORD_LIMIT) {
                            setNotification({
                                title: 'FREE 플랜 한도 도달',
                                message: `무료 회원은 기록을 최대 ${FREE_RECORD_LIMIT}개까지 저장할 수 있어요. PRO로 업그레이드하면 무제한 기록이 가능합니다.`
                            });
                            return;
                        }
                        setView('NEW');
                    }}
                    className="w-full bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 hover:from-emerald-800 hover:via-emerald-700 hover:to-teal-700 text-white rounded-2xl px-8 py-5 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 group relative overflow-hidden"
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

                {/* ===== 예약 Section ===== */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-blue-600" />
                        </div>
                        <h3 className="font-black text-gray-800 text-base">예약</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => { setSelectedLesson(null); setView('RESERVATION'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center transition-colors">
                                <Calendar className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-[11px] font-bold text-blue-700 text-center leading-tight">레슨 예약</span>
                        </button>
                        <button
                            onClick={() => { setSelectedLesson(null); setView('BAY_RESERVATION'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center transition-colors">
                                <Target className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-[11px] font-bold text-blue-700 text-center leading-tight">타석 예약</span>
                        </button>
                        <button
                            onClick={() => { setSelectedLesson(null); setView('MY_BAY_RESERVATIONS'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center transition-colors">
                                <ClipboardList className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-[11px] font-bold text-blue-700 text-center leading-tight">예약 내역</span>
                        </button>
                    </div>
                </div>

                {/* ===== 레슨 Section ===== */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <Award className="w-4 h-4 text-emerald-600" />
                        </div>
                        <h3 className="font-black text-gray-800 text-base">레슨</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => { setSelectedLesson(null); setView('RECENT_RECORDS'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
                                <History className="w-4 h-4 text-emerald-600" />
                            </div>
                            <span className="text-[11px] font-bold text-emerald-700 text-center leading-tight">{t('recent_records')}</span>
                        </button>
                        <button
                            onClick={() => { setSelectedLesson(null); setView('STATS'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
                                <BarChart3 className="w-4 h-4 text-emerald-600" />
                            </div>
                            <span className="text-[11px] font-bold text-emerald-700 text-center leading-tight">상세 통계</span>
                        </button>
                        <button
                            onClick={() => { setSelectedLesson(null); setView('WEEKLY_INSIGHT'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-purple-100 group-hover:bg-purple-200 rounded-xl flex items-center justify-center transition-colors">
                                <TrendingUp className="w-4 h-4 text-purple-600" />
                            </div>
                            <span className="text-[11px] font-bold text-purple-700 text-center leading-tight">주간 인사이트</span>
                        </button>
                        <button
                            onClick={() => {
                                if (!isProMember && todayAIUsage >= FREE_AI_DAILY_LIMIT) {
                                    setNotification({
                                        title: 'AI 분석 일일 한도',
                                        message: '무료 회원은 AI 분석을 하루 1회까지 사용할 수 있어요. PRO로 업그레이드하면 무제한 이용 가능합니다.'
                                    });
                                    return;
                                }
                                setSelectedLesson(null); setView('AI_AGENT');
                            }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-indigo-100 group-hover:bg-indigo-200 rounded-xl flex items-center justify-center transition-colors">
                                <Sparkles className="w-4 h-4 text-indigo-600" />
                            </div>
                            <span className="text-[11px] font-bold text-indigo-700 text-center leading-tight">AI 코치</span>
                        </button>
                        <button
                            onClick={() => { setSelectedLesson(null); setView('QUICK_LOG'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-emerald-100 group-hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors">
                                <PenLine className="w-4 h-4 text-emerald-600" />
                            </div>
                            <span className="text-[11px] font-bold text-emerald-700 text-center leading-tight">빠른 기록</span>
                        </button>
                    </div>
                </div>

                {/* ===== 내 정보 Section ===== */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center">
                            <User className="w-4 h-4 text-gray-600" />
                        </div>
                        <h3 className="font-black text-gray-800 text-base">내 정보</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => { setSelectedLesson(null); setView('PROFILE'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-gray-100 group-hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors">
                                <User className="w-4 h-4 text-gray-600" />
                            </div>
                            <span className="text-[11px] font-bold text-gray-700 text-center leading-tight">내 정보</span>
                        </button>
                        <button
                            onClick={() => { setSelectedLesson(null); setView('MEMBERSHIP_PURCHASE'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-indigo-100 group-hover:bg-indigo-200 rounded-xl flex items-center justify-center transition-colors">
                                <Crown className="w-4 h-4 text-indigo-600" />
                            </div>
                            <span className="text-[11px] font-bold text-indigo-700 text-center leading-tight">멤버십 결제</span>
                        </button>
                        <button
                            onClick={() => { setSelectedLesson(null); setView('POINT_PURCHASE'); }}
                            className="flex flex-col items-center gap-2 py-4 px-2 bg-yellow-50 hover:bg-yellow-100 rounded-xl transition-colors group"
                        >
                            <div className="w-9 h-9 bg-yellow-100 group-hover:bg-yellow-200 rounded-xl flex items-center justify-center transition-colors">
                                <ShoppingCart className="w-4 h-4 text-yellow-600" />
                            </div>
                            <span className="text-[11px] font-bold text-yellow-700 text-center leading-tight">포인트 구매</span>
                        </button>
                    </div>
                </div>

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
                
            </div>
        )}

        {view === 'RECENT_RECORDS' && (
            <div className="space-y-4 animate-fade-in">
                {/* Header */}
                <div className="flex items-center gap-3 pb-2">
                    <button
                        onClick={handleBackToList}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                        aria-label={t('back')}
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="w-1 h-6 bg-gradient-to-b from-emerald-700 to-teal-600 rounded-full" />
                    <h2 className="text-xl font-black text-gray-900">{t('recent_records')}</h2>
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">
                        {allMyLessons.length}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
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
                                    className="w-full text-xs p-2 border border-emerald-200 rounded-lg focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 outline-none transition-all"
                                />
                            </div>
                            <span className="text-gray-400 mt-4 font-bold">~</span>
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-600 font-semibold mb-1">종료일</label>
                                <input
                                    type="date"
                                    value={searchEndDate}
                                    onChange={(e) => setSearchEndDate(e.target.value)}
                                    className="w-full text-xs p-2 border border-emerald-200 rounded-lg focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 outline-none transition-all"
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

        {view === 'AI_AGENT' && (
            <GolfAIAgent
                clientProfile={clientProfile}
                allLessons={allLessons}
                clientId={clientId}
                isFirebaseMode={isFirebaseMode}
                onBack={handleBackToList}
                onMissionSaved={handleMissionSaved}
            />
        )}

        {view === 'QUICK_LOG' && (
            <QuickGolfLog
                clientId={clientId}
                coachId={clientProfile.coachId}
                onSave={handleSaveQuickLog}
                onBack={handleBackToList}
            />
        )}

        {view === 'WEEKLY_INSIGHT' && (
            <WeeklyInsightCard
                clientId={clientId}
                coachId={clientProfile.coachId}
                clientProfile={clientProfile}
                recentLogs={quickLogs}
                recentLessons={allMyLessons}
                onBack={handleBackToList}
                isFirebaseMode={isFirebaseMode}
            />
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

        {view === 'POINT_PURCHASE' && (
            <PointPurchase
                clientProfile={clientProfile}
                onBack={handleBackToList}
            />
        )}

        {view === 'MEMBERSHIP_PURCHASE' && (
            <MembershipPurchase
                clientProfile={clientProfile}
                onBack={handleBackToList}
            />
        )}

        {view === 'PAYMENT_SUCCESS' && (
            <PaymentSuccess
                clientProfile={clientProfile}
                onBack={handleBackToList}
                onPointsUpdated={(updated) => {
                    if (onUpdateProfile) onUpdateProfile(updated);
                    handleBackToList();
                }}
            />
        )}

        {view === 'MEMBERSHIP_PAYMENT_SUCCESS' && (
            <MembershipPaymentSuccess
                clientProfile={clientProfile}
                onBack={handleBackToList}
                onMembershipUpdated={(updated) => {
                    if (onUpdateProfile) onUpdateProfile(updated);
                    handleBackToList();
                }}
            />
        )}

        {view === 'PAYMENT_FAIL' && (
            <PaymentFail onBack={() => setView(new URLSearchParams(window.location.search).get('purchase') === 'membership' ? 'MEMBERSHIP_PURCHASE' : 'POINT_PURCHASE')} />
        )}

        {/* Floating Add Button */}
        {(view === 'LIST' || view === 'RECENT_RECORDS') && (
             <button 
                onClick={() => {
                    if (!isProMember && totalRecordCount >= FREE_RECORD_LIMIT) {
                        setNotification({
                            title: 'FREE 플랜 한도 도달',
                            message: `무료 회원은 기록을 최대 ${FREE_RECORD_LIMIT}개까지 저장할 수 있어요. PRO로 업그레이드하면 무제한 기록이 가능합니다.`
                        });
                        return;
                    }
                    setIsEditingLesson(false);
                    setView('NEW');
                }}
                className="group fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-emerald-700 to-teal-600 text-white rounded-full shadow-lg shadow-emerald-300 flex items-center justify-center hover:scale-110 transition-all z-40 relative"
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
