
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Lesson, ViewState, ClientProfile, CoachProfile, Homework, QuickLogEntry } from '../types';
import { LessonCard } from './LessonCard';
import { LessonDetail } from './LessonDetail';
import { ClientStats } from './ClientStats';
import { ClientProfileSettings } from './ClientProfileSettings';
import { HomeworkModal } from './HomeworkModal';
import { NewLessonForm } from './NewLessonForm';
import { ClientReservation } from './ClientReservation';
import { ClientBayReservation } from './ClientBayReservation';
import { MyBayReservations } from './MyBayReservations';
import { StudentReservationSummary } from './StudentReservationSummary';
import { PracticeUploadFlow } from './PracticeUploadFlow';
import { GolfPassportScreen } from './GolfPassportScreen';
import { CoachHandoverFlow } from './CoachHandoverFlow';
import { PointPurchase } from './PointPurchase';
import { PaymentSuccess } from './PaymentSuccess';
import { PaymentFail } from './PaymentFail';
import { MembershipPurchase } from './MembershipPurchase';
import { MembershipPaymentSuccess } from './MembershipPaymentSuccess';
import { StudentHome } from './StudentHome';
import { StudentBottomNav, StudentTab } from './StudentBottomNav';
import { StudentHamburgerMenu, HamburgerAction } from './StudentHamburgerMenu';
import { GrowthTimeline } from './GrowthTimeline';
import { AIToneSettings } from './AIToneSettings';
import { SwingVideoAnalysis } from './posture/SwingVideoAnalysis';
import { PlayCircle, Filter, Eye, EyeOff, Target, Menu } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { apiService } from '../services/apiService';
import { pointService } from '../services/pointService';
import { NotificationToast } from './NotificationToast';
import { useLanguage } from './LanguageContext';
import { BackButton } from './ui/BackButton';
import { readBooleanPref } from '../utils/safeStorage';

interface ClientAppProps {
  clientProfile: ClientProfile;
  allLessons: Lesson[];
  onLogout: () => void;
  onUpdateLesson: (lesson: Lesson) => void;
  onSaveNewRecord?: (lesson: Lesson, homeworkBatch?: Homework[]) => void;
  onDeleteLesson?: (lessonId: string) => void;
  onUpdateProfile?: (updatedProfile: ClientProfile) => void;
  /**
   * Refetch this user's lessons from the backend. Called when the student opens
   * the recent-records view so a lesson the coach recorded on their own device
   * shows up without a full sign-out / sign-in.
   */
  onRefreshLessons?: () => void | Promise<void>;
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

const HIDE_MEMBERSHIP_FEATURES = (import.meta.env.VITE_CLIENT_HIDE_MEMBERSHIP ?? 'false') === 'true';
const HIDE_RESERVATION_FEATURES = (import.meta.env.VITE_CLIENT_HIDE_RESERVATION ?? 'false') === 'true';

/**
 * Sub-views layer over the current tab as full-screen overlays. Their back
 * button clears the sub-view and returns the user to whichever tab they were
 * on. Kept separate from `StudentTab` so tab identity is preserved across
 * sub-view visits (e.g. opening a lesson detail from the Growth tab and
 * closing it lands you back on Growth, not Home).
 */
type SubView =
  | 'DETAIL'
  | 'NEW'
  | 'STATS'
  | 'PROFILE'
  | 'RECENT_RECORDS'
  | 'LESSON_BOOKING'
  | 'BAY_RESERVATION'
  | 'MY_BAY_RESERVATIONS'
  | 'POINT_PURCHASE'
  | 'MEMBERSHIP_PURCHASE'
  | 'PAYMENT_SUCCESS'
  | 'MEMBERSHIP_PAYMENT_SUCCESS'
  | 'PAYMENT_FAIL'
  | 'SWING_ANALYSIS'
  | 'GOLF_PASSPORT';

export const ClientApp: React.FC<ClientAppProps> = ({ clientProfile, allLessons, onLogout, onUpdateLesson, onSaveNewRecord, onDeleteLesson, onUpdateProfile, onRefreshLessons }) => {
  const { t, language, setLanguage } = useLanguage();

  // Initial routing — payment redirects still land the user directly in the
  // right success/fail sub-view. Everything else starts on the AI Home tab.
  const initialSubView = useMemo<SubView | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseType = params.get('purchase');
    if (params.get('paymentKey') && params.get('orderId')) {
      return purchaseType === 'membership' ? 'MEMBERSHIP_PAYMENT_SUCCESS' : 'PAYMENT_SUCCESS';
    }
    if (params.get('code') || params.get('message')) return 'PAYMENT_FAIL';
    return null;
  }, []);

  const [tab, setTab] = useState<StudentTab>('HOME');
  const [subView, setSubView] = useState<SubView | null>(initialSubView);
  const [isEditingSubmit, setIsEditingSubmit] = useState(false); // reserved
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [showToneModal, setShowToneModal] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  
  // Media visibility toggle.
  // readBooleanPref self-heals a poisoned "client_showMedia" slot so a
  // corrupted preference can't crash ClientApp on mount — the student
  // side of the same "logged in and then bounced" regression that
  // cc0ca89 fixed for the coach auth slots.
  const [showMedia, setShowMedia] = useState<boolean>(() =>
    readBooleanPref('client_showMedia', false)
  );
  
  // Date Filtering State
  const [searchStartDate, setSearchStartDate] = useState('');
  const [searchEndDate, setSearchEndDate] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Edit Mode State
  const [isEditingLesson, setIsEditingLesson] = useState(false);

  // Homework State
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [showPracticeUpload, setShowPracticeUpload] = useState(false);
  const [practiceUploadHomeworkId, setPracticeUploadHomeworkId] = useState<string | null>(null);
  const [showHandoverFlow, setShowHandoverFlow] = useState(false);
  const [notification, setNotification] = useState<{title: string, message: string} | null>(null);
  
  // Mission/Homework Modal State
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [profileSection, setProfileSection] = useState<'OVERVIEW' | 'GOLF_PROFILE' | 'CLUB_BAG' | 'BODY_ANALYSIS'>('OVERVIEW');

  // Designated coach profile (for AI context)
  const [designatedCoachProfile, setDesignatedCoachProfile] = useState<CoachProfile | null>(null);

  // Quick Log State
  const [quickLogs, setQuickLogs] = useState<QuickLogEntry[]>([]);
  const isProMember = clientProfile.subscriptionPlan === 'PRO' || !!clientProfile.isSubscribed;
  const FREE_RECORD_LIMIT = 10;
  const FREE_AI_DAILY_LIMIT = 1;

  const clientId = `${clientProfile.name}_${clientProfile.phone}`.trim();
  const isFirebaseMode = firebaseService.isInitialized();

  // Apply build-flag gates against the current sub-view. Blocked sub-views
  // fall back to `null` so the underlying tab shows through.
  const effectiveSubView = useMemo<SubView | null>(() => {
    if (subView == null) return null;
    if (HIDE_MEMBERSHIP_FEATURES && (subView === 'MEMBERSHIP_PURCHASE' || subView === 'MEMBERSHIP_PAYMENT_SUCCESS')) {
      return null;
    }
    if (HIDE_RESERVATION_FEATURES && (subView === 'BAY_RESERVATION' || subView === 'MY_BAY_RESERVATIONS')) {
      return null;
    }
    return subView;
  }, [subView]);

  // Load designated coach profile for AI context
  useEffect(() => {
    const coachId = clientProfile.coachId;
    if (!coachId) return;

    const loadCoach = async () => {
      let coach: CoachProfile | null = null;
      if (isFirebaseMode) {
        coach = await firebaseService.getCoachById(coachId);
      } else {
        const stored = storageService.getCoachById(coachId);
        if (stored) {
          coach = stored;
        } else {
          coach = await apiService.getCoachById(coachId);
        }
      }
      if (coach) setDesignatedCoachProfile(coach);
    };

    loadCoach();
  }, [clientProfile.coachId, isFirebaseMode]);

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

  const todaysHomework = useMemo(() => {
      const today = getLocalISODate();
      return homeworkList.filter(h => h.date === today);
  }, [homeworkList]);

  // Normalize a phone string to digits only so format differences
  // (010-1234-5678 vs 01012345678) don't prevent lessons from matching.
  const myNormalizedPhone = useMemo(
    () => (clientProfile.phone || '').replace(/[^0-9]/g, ''),
    [clientProfile.phone]
  );

  const matchesMyPhone = useCallback(
    (lessonPhone: string | undefined) => {
      if (!myNormalizedPhone) return false;
      const normalized = (lessonPhone || '').replace(/[^0-9]/g, '');
      return normalized.length > 0 && normalized === myNormalizedPhone;
    },
    [myNormalizedPhone]
  );

  // All lessons (including data images) - used for Stats
  const allMyLessons = useMemo(() => {
    return allLessons
      // Match by normalized phone (primary) or exact name+phone (fallback)
      .filter(l =>
        matchesMyPhone(l.clientPhone) ||
        (l.clientName === clientProfile.name && l.clientPhone === clientProfile.phone)
      )
      // Apply Date Filter
      .filter(l => {
          if (searchStartDate && l.date < searchStartDate) return false;
          if (searchEndDate && l.date > searchEndDate) return false;
          return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [allLessons, clientProfile, searchStartDate, searchEndDate, matchesMyPhone]);

  const today = getLocalISODate();
  const myLessonsRaw = useMemo(() => {
    return allLessons.filter(l =>
      matchesMyPhone(l.clientPhone) ||
      (l.clientName === clientProfile.name && l.clientPhone === clientProfile.phone)
    );
  }, [allLessons, clientProfile.name, clientProfile.phone, matchesMyPhone]);
  const totalRecordCount = myLessonsRaw.length;
  const remainingFreeRecords = Math.max(0, FREE_RECORD_LIMIT - totalRecordCount);
  const todayAIUsage = useMemo(() => {
    return myLessonsRaw.filter((lesson) => lesson.date === today && !!lesson.aiAnalysis).length;
  }, [myLessonsRaw, today]);
  const remainingDailyAI = Math.max(0, FREE_AI_DAILY_LIMIT - todayAIUsage);

  const handleBackToTab = () => {
    setSelectedLesson(null);
    setSubView(null);
    setIsEditingLesson(false);
  };

  const handleSaveProfile = (updatedProfile: ClientProfile) => {
      if (onUpdateProfile) {
          onUpdateProfile(updatedProfile);
          setSubView(null);
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
          setSubView(null);
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
      setSubView('DETAIL');
  };

  const handleEditLesson = (lesson: Lesson) => {
      setSelectedLesson(lesson);
      setIsEditingLesson(true);
      setSubView('NEW');
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
      if (apiService.isAvailable()) {
          coaches = await apiService.searchCoachesByName(term);
      } else if (firebaseService.isInitialized()) {
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

  const openProfileSection = (section: 'OVERVIEW' | 'GOLF_PROFILE' | 'CLUB_BAG' | 'BODY_ANALYSIS') => {
      setProfileSection(section);
      setSelectedLesson(null);
      setSubView('PROFILE');
  };

  // ── Hamburger menu wiring ──────────────────────────────────────────────────

  const handleHamburgerAction = useCallback((action: HamburgerAction) => {
    switch (action) {
      case 'PROFILE':
        openProfileSection('OVERVIEW');
        break;
      case 'GOLF_PASSPORT':
        setSubView('GOLF_PASSPORT');
        break;
      case 'MY_BAY_RESERVATIONS':
        setSubView('MY_BAY_RESERVATIONS');
        break;
      case 'POINT_PURCHASE':
        setSubView('POINT_PURCHASE');
        break;
      case 'MEMBERSHIP_PURCHASE':
        setSubView('MEMBERSHIP_PURCHASE');
        break;
      case 'SWING_ANALYSIS':
        setSubView('SWING_ANALYSIS');
        break;
      case 'AI_TONE':
        setShowToneModal(true);
        break;
      case 'LANGUAGE':
        toggleLanguage();
        break;
      case 'LOGOUT':
        onLogout();
        break;
    }
  }, [onLogout]);
  // ↑ toggleLanguage's closure captures the current `language` and is stable
  //   for a given render, so it is intentionally omitted from deps.

  // Sub-view helpers ─────────────────────────────────────────────────────────
  const handleNewLessonCTA = () => {
    if (!isProMember && totalRecordCount >= FREE_RECORD_LIMIT) {
      setNotification({
        title: 'FREE 플랜 한도 도달',
        message: `무료 회원은 기록을 최대 ${FREE_RECORD_LIMIT}개까지 저장할 수 있어요. PRO로 업그레이드하면 무제한 기록이 가능합니다.`,
      });
      return;
    }
    setIsEditingLesson(false);
    setSubView('NEW');
  };

  // Small shell used by non-HOME tabs to provide a top bar with the hamburger
  // button. HOME tab reuses StudentAIChat's own header via headerLeftSlot.
  const TabHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
    <header className="bg-base/95 border-b border-line-subtle sticky top-0 z-30 backdrop-blur-xl">
      <div className="max-w-md mx-auto px-3 h-14 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setHamburgerOpen(true)}
          aria-label="Open menu"
          className="p-2 rounded-lg text-ink-high hover:bg-white/10 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-ink-high truncate">{title}</h1>
        {right && <div className="ml-auto">{right}</div>}
      </div>
    </header>
  );

  const reservationTabTitle =
    language === 'en' ? 'Book a lesson'
    : language === 'ja' ? 'レッスン予約'
    : '레슨 예약';

  const growthTabTitle =
    language === 'en' ? 'Growth log'
    : language === 'ja' ? '成長ログ'
    : '성장 기록';

  const showBottomNav = !effectiveSubView;

  return (
    <div className="min-h-screen bg-base text-ink-high font-sans">
      {/* ── Tab bodies (only when no sub-view is active) ─────────────────────── */}
      {!effectiveSubView && tab === 'HOME' && (
        <div className="pb-20">
          <StudentHome
            clientProfile={clientProfile}
            myLessons={myLessonsRaw}
            homeworkList={homeworkList}
            quickLogs={quickLogs}
            coachProfile={designatedCoachProfile ?? undefined}
            onOpenMenu={() => setHamburgerOpen(true)}
            onOpenLesson={(lessonId) => {
              const target = myLessonsRaw.find((l) => l.id === lessonId);
              if (!target) return;
              setSelectedLesson(target);
              setSubView('DETAIL');
            }}
            onToggleHomework={(id, next) => {
              // Optimistic — same pattern used elsewhere in this file.
              setHomeworkList((prev) =>
                prev.map((h) => (h.id === id ? { ...h, isCompleted: next } : h))
              );
              storageService.updateHomeworkStatus(id, next);
              if (apiService.isAvailable()) {
                void firebaseService.updateHomeworkStatus?.(id, next).catch(() => {
                  /* best-effort — offline queue picks it up later */
                });
              }
            }}
            onUploadPractice={(homeworkId) => {
              // 5d flow: open the dedicated practice-upload sheet
              // (PracticeUploadFlow) rooted on the tapped homework row.
              // Falls back to a free practice upload when the id doesn't
              // resolve — the sheet handles either case.
              setPracticeUploadHomeworkId(homeworkId ?? null);
              setShowPracticeUpload(true);
            }}
          />
        </div>
      )}

      {!effectiveSubView && tab === 'RESERVATION' && (
        HIDE_RESERVATION_FEATURES ? (
          <div>
            <TabHeader title={reservationTabTitle} />
            <main className="max-w-md mx-auto px-4 py-10 text-center text-ink-muted text-sm">
              {language === 'en' ? 'Reservations are disabled for this build.'
                : language === 'ja' ? 'この環境では予約機能が無効です。'
                : '이 환경에서는 예약 기능이 비활성화되어 있어요.'}
            </main>
          </div>
        ) : (
          // 5c redesign: reservation tab opens on the overview screen —
          // next lesson + package balance + CTAs — instead of dropping
          // straight into the booking form. The old ClientReservation
          // and ClientBayReservation flows are one tap away as sub-views.
          <div className="pb-20">
            <TabHeader title={reservationTabTitle} />
            <StudentReservationSummary
              clientProfile={clientProfile}
              myLessons={myLessonsRaw}
              onOpenLessonBooking={() => setSubView('LESSON_BOOKING')}
              onOpenBayBooking={() => setSubView('BAY_RESERVATION')}
              onOpenMyBayReservations={() => setSubView('MY_BAY_RESERVATIONS')}
              onOpenLesson={(lessonId) => {
                // Reservation ids and lesson ids are distinct — the
                // summary card carries a LessonReservation.id. Deep
                // linking a reservation into a lesson detail belongs to
                // a follow-up; for now open the lesson list scope.
                const target = myLessonsRaw.find((l) => l.id === lessonId);
                if (target) {
                  setSelectedLesson(target);
                  setSubView('DETAIL');
                }
              }}
            />
          </div>
        )
      )}

      {effectiveSubView === 'LESSON_BOOKING' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto">
            <ClientReservation
              clientProfile={clientProfile}
              onBack={handleBackToTab}
            />
          </main>
        </div>
      )}

      {!effectiveSubView && tab === 'GROWTH' && (
        <div className="pb-20">
          <TabHeader title={growthTabTitle} />
          <main className="max-w-md mx-auto px-4 py-4">
            <GrowthTimeline
              clientProfile={clientProfile}
              allMyLessons={allMyLessons}
              onOpenDetailedStats={() => setSubView('STATS')}
              onOpenLesson={(l) => { setSelectedLesson(l); setSubView('DETAIL'); }}
            />
          </main>
        </div>
      )}

      {/* ── Sub-view overlays ────────────────────────────────────────────────── */}
      {effectiveSubView === 'DETAIL' && selectedLesson && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <LessonDetail
              lesson={selectedLesson}
              role="CLIENT"
              onBack={handleBackToTab}
              onUpdate={handleLocalUpdate}
              onDelete={selectedLesson.createdBy === 'CLIENT' && onDeleteLesson ? () => {
                onDeleteLesson(selectedLesson.id);
                handleBackToTab();
              } : undefined}
              onEdit={handleEditLesson}
            />
          </main>
        </div>
      )}

      {effectiveSubView === 'STATS' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <ClientStats
              lessons={allMyLessons}
              onBack={handleBackToTab}
              clientProfile={clientProfile}
              coachId={clientProfile.coachId}
            />
          </main>
        </div>
      )}

      {effectiveSubView === 'GOLF_PASSPORT' && (
        <GolfPassportScreen
          clientProfile={clientProfile}
          lessons={allMyLessons}
          onBack={handleBackToTab}
          onStartHandover={() => setShowHandoverFlow(true)}
          // onExportData intentionally omitted — export flow is a
          // follow-up PR; the CTA renders as "곧 제공" until then.
        />
      )}

      {effectiveSubView === 'PROFILE' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <ClientProfileSettings
              profile={clientProfile}
              allLessons={allMyLessons}
              onSave={handleSaveProfile}
              onBack={handleBackToTab}
              onSearchCoach={handleCoachSearchByName}
              initialSection={profileSection}
            />
          </main>
        </div>
      )}

      {effectiveSubView === 'RECENT_RECORDS' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 pb-2">
                <BackButton onClick={handleBackToTab} tone="dark" />
                <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-emerald-500 rounded-full" />
                <h2 className="text-xl font-black text-ink-high">{t('recent_records')}</h2>
                <span className="bg-emerald-500/15 border border-emerald-300/30 text-emerald-200 px-2 py-0.5 rounded-full text-xs font-bold">
                  {allMyLessons.length}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={toggleShowMedia}
                    className={`p-2 rounded-lg transition-colors ${showMedia ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-300/30' : 'bg-base border border-line-subtle text-ink-muted hover:bg-white/[0.06]'}`}
                    title={showMedia ? '미디어 숨기기' : '미디어 표시'}
                  >
                    {showMedia ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setShowDateFilter(!showDateFilter)}
                    className={`p-2 rounded-lg transition-colors ${showDateFilter || (searchStartDate || searchEndDate) ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-300/30' : 'bg-base border border-line-subtle text-ink-muted hover:bg-white/[0.06]'}`}
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {(showDateFilter || searchStartDate || searchEndDate) && (
                <div className="bg-white/[0.03] p-4 rounded-xl border border-line-subtle">
                  <div className="flex gap-2 items-center mb-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-ink-muted font-semibold mb-1">시작일</label>
                      <input
                        type="date"
                        value={searchStartDate}
                        onChange={(e) => setSearchStartDate(e.target.value)}
                        className="w-full text-xs p-2 border border-line-subtle bg-base text-ink-high rounded-lg outline-none"
                      />
                    </div>
                    <span className="text-ink-muted mt-4 font-bold">~</span>
                    <div className="flex-1">
                      <label className="block text-[10px] text-ink-muted font-semibold mb-1">종료일</label>
                      <input
                        type="date"
                        value={searchEndDate}
                        onChange={(e) => setSearchEndDate(e.target.value)}
                        className="w-full text-xs p-2 border border-line-subtle bg-base text-ink-high rounded-lg outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={clearDateFilter} className="text-xs text-ink-muted font-semibold underline hover:text-red-400 transition-colors">
                      필터 초기화
                    </button>
                  </div>
                </div>
              )}

              {allMyLessons.length === 0 ? (
                <div className="text-center py-16 bg-white/[0.03] rounded-2xl border border-line-subtle">
                  <div className="bg-base w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-line-subtle">
                    <PlayCircle className="w-10 h-10 text-ink-muted" />
                  </div>
                  <h3 className="text-ink-high font-bold text-lg mb-2">{t('no_records')}</h3>
                  <p className="text-ink-muted text-sm px-4">
                    {(searchStartDate || searchEndDate) ? '검색 기간에 해당하는 기록이 없습니다.' : t('no_records_desc')}
                  </p>
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
                        onClick={(l) => { setSelectedLesson(l); setSubView('DETAIL'); }}
                        onShare={() => {}}
                        onDelete={lesson.createdBy === 'CLIENT' ? (l, e) => {
                          e.stopPropagation();
                          if (onDeleteLesson && window.confirm(t('lesson_delete_confirm'))) onDeleteLesson(l.id);
                        } : undefined}
                        showMedia={showMedia}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {effectiveSubView === 'SWING_ANALYSIS' && (
        <div className="fixed inset-0 z-50 bg-base overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 text-ink-high">
            <header className="pb-4 border-b border-line-subtle flex items-center gap-3">
              <BackButton
                onClick={handleBackToTab}
                tone="dark"
                ariaLabel={t('back')}
                className="flex-shrink-0"
                testId="swing-analysis-back-btn"
              />
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-ink-high flex items-center gap-2">
                  골프 스윙 분석 <span className="text-emerald-400 text-sm">BETA</span>
                </h1>
                <p className="text-xs sm:text-sm text-ink-muted mt-1 leading-relaxed">
                  스윙 mp4/mov를 업로드하면 이벤트 세그멘테이션 · 3D 바이오메카닉 지표 · 클럽 헤드 궤적을 즉시 계산합니다.
                </p>
              </div>
            </header>
            <SwingVideoAnalysis studentLessons={allMyLessons} />
            <footer className="pt-4 mt-6 border-t border-line-subtle text-[11px] text-ink-muted leading-relaxed space-y-1.5">
              <p>첫 실행 시 MediaPipe Heavy 모델(~30MB)이 CDN에서 다운로드된 뒤 브라우저에 캐시됩니다. Chrome / Edge 권장 (GPU 가속).</p>
              <p>권장 촬영: 720p+ · 30fps · 5초 이내 · 정면(FO) 또는 측면(DTL) · 단색 배경.</p>
            </footer>
          </div>
        </div>
      )}

      {!HIDE_RESERVATION_FEATURES && effectiveSubView === 'BAY_RESERVATION' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <ClientBayReservation
              clientProfile={clientProfile}
              onBack={handleBackToTab}
              onPointsUpdated={(updatedProfile) => {
                if (onUpdateProfile) onUpdateProfile(updatedProfile);
              }}
            />
          </main>
        </div>
      )}

      {!HIDE_RESERVATION_FEATURES && effectiveSubView === 'MY_BAY_RESERVATIONS' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <MyBayReservations
              clientProfile={clientProfile}
              onBack={handleBackToTab}
            />
          </main>
        </div>
      )}

      {effectiveSubView === 'POINT_PURCHASE' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <PointPurchase
              clientProfile={clientProfile}
              onBack={handleBackToTab}
            />
          </main>
        </div>
      )}

      {!HIDE_MEMBERSHIP_FEATURES && effectiveSubView === 'MEMBERSHIP_PURCHASE' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <MembershipPurchase
              clientProfile={clientProfile}
              onBack={handleBackToTab}
            />
          </main>
        </div>
      )}

      {effectiveSubView === 'PAYMENT_SUCCESS' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <PaymentSuccess
              clientProfile={clientProfile}
              onBack={handleBackToTab}
              onPointsUpdated={(updated) => {
                if (onUpdateProfile) onUpdateProfile(updated);
                handleBackToTab();
              }}
            />
          </main>
        </div>
      )}

      {!HIDE_MEMBERSHIP_FEATURES && effectiveSubView === 'MEMBERSHIP_PAYMENT_SUCCESS' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <MembershipPaymentSuccess
              clientProfile={clientProfile}
              onBack={handleBackToTab}
              onMembershipUpdated={(updated) => {
                if (onUpdateProfile) onUpdateProfile(updated);
                handleBackToTab();
              }}
            />
          </main>
        </div>
      )}

      {effectiveSubView === 'PAYMENT_FAIL' && (
        <div className="min-h-screen">
          <main className="max-w-md mx-auto px-4 py-6">
            <PaymentFail
              onBack={() => {
                const purchaseType = new URLSearchParams(window.location.search).get('purchase');
                if (purchaseType === 'membership') {
                  setSubView(HIDE_MEMBERSHIP_FEATURES ? null : 'MEMBERSHIP_PURCHASE');
                  return;
                }
                setSubView('POINT_PURCHASE');
              }}
            />
          </main>
        </div>
      )}

      {effectiveSubView === 'NEW' && (
        <div className="fixed inset-0 z-50 bg-base overflow-y-auto">
          <NewLessonForm
            existingClients={[clientProfile]}
            userRole="CLIENT"
            currentUser={clientProfile}
            onSave={handleSaveRecord}
            onCancel={() => {
              if (isEditingLesson) {
                setSubView('DETAIL');
                setIsEditingLesson(false);
              } else {
                setSubView(null);
              }
            }}
            initialData={isEditingLesson && selectedLesson ? selectedLesson : undefined}
          />
        </div>
      )}

      {/* ── Bottom tab nav (record CTA is the raised center button) ───────── */}
      {showBottomNav && (
        <StudentBottomNav
          activeTab={tab}
          onTabChange={(next) => {
            setSelectedLesson(null);
            setTab(next);
            // Growth relies on the freshest lesson list from the backend so a
            // lesson the coach just saved shows up without a page reload.
            if (next === 'GROWTH') {
              onRefreshLessons?.();
            }
          }}
        />
      )}

      {/* ── Global overlays ───────────────────────────────────────────────── */}
      {showHandoverFlow && (
        <CoachHandoverFlow
          clientProfile={clientProfile}
          pastLessons={allLessons}
          onCoachChanged={(updated) => {
            // Propagate the new coach + designated coach name upward so
            // sub-screens (passport, home cards, etc.) re-render against
            // the new relationship on the next tick.
            onUpdateProfile?.(updated);
          }}
          onClose={() => setShowHandoverFlow(false)}
        />
      )}

      {showPracticeUpload && (
        <PracticeUploadFlow
          clientProfile={clientProfile}
          homework={
            practiceUploadHomeworkId
              ? homeworkList.find((h) => h.id === practiceUploadHomeworkId)
              : undefined
          }
          onSaveLesson={async (lesson) => {
            // Persist through the app's existing lesson save path so the
            // record lands in the same store as coach-authored lessons.
            if (onSaveNewRecord) {
              await onSaveNewRecord(lesson);
            }
          }}
          onMarkHomeworkComplete={(id) => {
            setHomeworkList((prev) =>
              prev.map((h) => (h.id === id ? { ...h, isCompleted: true } : h))
            );
            storageService.updateHomeworkStatus(id, true);
            if (apiService.isAvailable()) {
              void firebaseService.updateHomeworkStatus?.(id, true).catch(() => {
                /* best-effort */
              });
            }
          }}
          onClose={() => {
            setShowPracticeUpload(false);
            setPracticeUploadHomeworkId(null);
            onRefreshLessons?.();
          }}
        />
      )}

      <StudentHamburgerMenu
        open={hamburgerOpen}
        onClose={() => setHamburgerOpen(false)}
        clientProfile={clientProfile}
        onAction={handleHamburgerAction}
        hideMembership={HIDE_MEMBERSHIP_FEATURES}
        hideReservation={HIDE_RESERVATION_FEATURES}
      />

      <AIToneSettings
        open={showToneModal}
        onClose={() => setShowToneModal(false)}
        profile={clientProfile}
        onSave={(updated) => {
          if (onUpdateProfile) onUpdateProfile(updated);
        }}
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

      <NotificationToast
        title={notification?.title || ''}
        message={notification?.message || ''}
        visible={!!notification}
        onClose={() => setNotification(null)}
      />
    </div>
  );
};

