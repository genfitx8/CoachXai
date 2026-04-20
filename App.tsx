import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ViewState,
  Lesson,
  CoachProfile,
  ClientProfile,
  Homework,
  NotificationMessage,
  LessonPackage,
  TrainingProgram,
} from './types';
import { LessonCard } from './components/LessonCard';
import { LessonDetail } from './components/LessonDetail';
import { NewLessonForm } from './components/NewLessonForm';
import { ClientApp } from './components/ClientApp';
import { AuthScreen } from './components/AuthScreen';
import { CoachXLanding } from './components/CoachXLanding';
import { AdminDashboard } from './components/AdminDashboard';
import { BranchAdminDashboard } from './components/BranchAdminDashboard';
import { SwingComparison } from './components/SwingComparison';
import { HomeworkModal } from './components/HomeworkModal';
import { CoachProfileModal } from './components/CoachProfileModal';
import { CoachClientManager } from './components/CoachClientManager';
import { ClientStats } from './components/ClientStats';
import { ReservationManager } from './components/ReservationManager';
import { CoachBayReservation } from './components/CoachBayReservation';
import { MyBayReservations } from './components/MyBayReservations';
import { CoachReservationNotificationModal } from './components/CoachReservationNotificationModal';
import { CoachLessonReservationModal } from './components/CoachLessonReservationModal';
import { LessonPackageManager } from './components/LessonPackageManager';
import { TrainingProgramGenerator } from './components/TrainingProgramGenerator';
import { LessonStartPromptModal } from './components/LessonStartPromptModal';
import { storageService } from './services/storage';
import { authService } from './services/authService';
import { firebaseService } from './services/firebase';
import {
  getUnreadReservationNotificationsForCoach,
  markNotificationsAsRead,
} from './services/coachNotificationService';
import { reservationService } from './services/reservationService';
import {
  findUpcomingLesson,
  markRemindLater,
  markSkippedToday,
  pruneStaleDismissal,
  LessonSuggestion,
} from './services/lessonStartSuggestionService';
import { Button } from './components/Button';
import { CoachXHub } from './components/CoachXHub';
import { CoachXChat } from './components/CoachXChat';
import { buildMemberGrowthReports } from './services/coachXService';
import {
  Plus,
  Search,
  Filter,
  LogOut,
  User,
  ListChecks,
  X,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Play,
  Globe,
  Eye,
  EyeOff,
  BarChart3,
  Target,
  BookOpen,
  Users,
  CheckCircle,
  Clock,
  ChevronRight,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { LanguageProvider, useLanguage } from './components/LanguageContext';

const AppContent: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();

  // Session State
  const [userRole, setUserRole] = useState<'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN' | null>(
    null
  );
  const [currentUser, setCurrentUser] = useState<
    CoachProfile | ClientProfile | null
  >(null);
  const [branchAdminData, setBranchAdminData] = useState<{
    branchId: string;
    branchName: string;
    username: string;
    adminId: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authEntryMode, setAuthEntryMode] = useState<'LOGIN' | 'SIGNUP' | null>(
    null
  );

  // Data State
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]); // Added for Admin
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);

  // View State (Coach)
  const [coachView, setCoachView] = useState<ViewState | 'RESERVATIONS' | 'BAY_RESERVATION' | 'MY_BAY_RESERVATIONS'>('LIST');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>(''); // '' or clientName
  const [isEditingLesson, setIsEditingLesson] = useState(false); // Track editing mode
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | undefined>(undefined); // Pre-fill date from calendar click
  const [coachLessonModalDate, setCoachLessonModalDate] = useState<string | undefined>(undefined);
  const [coachLessonModalHour, setCoachLessonModalHour] = useState<number>(9);
  const [showCoachLessonModal, setShowCoachLessonModal] = useState(false);

  // Lesson Package State
  const [lessonPackages, setLessonPackages] = useState<LessonPackage[]>([]);
  const [selectedClientForPackage, setSelectedClientForPackage] = useState<ClientProfile | null>(null);
  /** When creating a new lesson via a package session, pre-fill this context. */
  const [pendingPackageSession, setPendingPackageSession] = useState<{ pkg: LessonPackage; sessionNumber: number } | null>(null);

  // Training Program State
  const [trainingPrograms, setTrainingPrograms] = useState<TrainingProgram[]>([]);
  const [selectedClientForTraining, setSelectedClientForTraining] = useState<ClientProfile | null>(null);

  // CoachX chat initial query (set when opening chat from a member card)
  const [coachXChatInitialQuery, setCoachXChatInitialQuery] = useState<string | undefined>(undefined);
  
  // Media visibility toggle for Coach
  const [showMedia, setShowMedia] = useState<boolean>(() => {
    const saved = localStorage.getItem('coach_showMedia');
    return saved ? JSON.parse(saved) : false; // Default to hidden (false)
  });

  // ── Lesson-start suggestion ─────────────────────────────────────────────────
  /** Active lesson-start suggestion to show in the prompt modal. */
  const [lessonSuggestion, setLessonSuggestion] = useState<LessonSuggestion | null>(null);
  /**
   * Client pre-filled from the lesson-start suggestion.  Passed to
   * `NewLessonForm` so the CLIENT_SELECT step is skipped.
   */
  const [prefilledSuggestionClient, setPrefilledSuggestionClient] = useState<ClientProfile | null>(null);

  // Modals
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [homeworkTargetClient, setHomeworkTargetClient] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Coach reservation-request notification popup
  const [pendingReservationNotifications, setPendingReservationNotifications] = useState<NotificationMessage[]>([]);
  const [showReservationNotificationModal, setShowReservationNotificationModal] = useState(false);

  /**
   * Check whether there is an upcoming CONFIRMED lesson reservation for the
   * given coach and show the prompt modal if one is found.
   * Fire-and-forget; errors are caught internally.
   */
  const checkAndShowLessonSuggestion = useCallback((coachId: string) => {
    pruneStaleDismissal();
    reservationService.getCoachReservations(coachId).then((reservations) => {
      const suggestion = findUpcomingLesson(reservations);
      if (suggestion) {
        setLessonSuggestion(suggestion);
      }
    }).catch((e) => {
      console.error('[App] Failed to check lesson suggestions:', e);
    });
  }, []);

  /**
   * Fetch unread reservation-request notifications for a coach and show the
   * popup if any exist.  Fire-and-forget: errors are caught internally.
   */
  const loadAndShowCoachNotifications = (coachId: string) => {
    getUnreadReservationNotificationsForCoach(coachId).then((notifications) => {
      if (notifications.length > 0) {
        setPendingReservationNotifications(notifications);
        setShowReservationNotificationModal(true);
      }
    }).catch((e) => {
      console.error('[App] Failed to load coach notifications:', e);
    });
  };

  // Initial Load
  useEffect(() => {
    const initApp = async () => {
      // 1. Try Initialize Firebase
      // Priority: Environment variables (.env) > localStorage
      const savedConfig = firebaseService.getSavedConfig();
      let isFirebaseReady = false;
      if (savedConfig) {
        try {
          isFirebaseReady = firebaseService.init(savedConfig);
          if (!isFirebaseReady) {
            console.warn(
              'Firebase 초기화 실패. 로컬 스토리지 모드로 전환합니다.'
            );
          }
        } catch (e) {
          console.error('Firebase 초기화 중 오류 발생:', e);
          console.warn('로컬 스토리지 모드로 전환합니다.');
          isFirebaseReady = false;
        }
      } else {
        console.log(
          'Firebase 설정이 없습니다. 로컬 스토리지 모드를 사용합니다.'
        );
      }

      // 2. Restore Session
      const session = authService.restoreSession();
      if (session) {
        setUserRole(session.role);
        if (session.role === 'CLIENT' && session.clientData) {
          // Determine identifying info
          const { name, phone } = session.clientData;

          // Fetch full profile
          let foundClient: ClientProfile | undefined;
          if (isFirebaseReady) {
            const allClients = await firebaseService.getClients();
            foundClient = allClients.find(
              (c) => c.name === name && c.phone === phone
            );
          } else {
            const allClients = storageService.getClients();
            foundClient = allClients.find(
              (c) => c.name === name && c.phone === phone
            );
          }
          setCurrentUser(foundClient || session.clientData);
        } else if (session.role === 'COACH') {
          // Try to get coach profile from Firebase first, then localStorage
          let profile: CoachProfile | null = null;
          if (isFirebaseReady) {
            const allCoaches = await firebaseService.getCoaches();
            // Try to find coach by email from localStorage first
            const localProfile = authService.getCoachProfile();
            if (localProfile?.email) {
              profile =
                allCoaches.find((c) => c.email === localProfile.email) || null;
            }
            // If not found by email, try to get the first coach (if only one exists)
            if (!profile && allCoaches.length === 1) {
              profile = allCoaches[0];
            }
          }
          // Fallback to localStorage
          if (!profile) {
            profile = authService.getCoachProfile();
          }

          if (profile) {
            setCurrentUser(profile);
            setCoachProfile(profile);
            loadAndShowCoachNotifications(profile.id);
            checkAndShowLessonSuggestion(profile.id);
          } else {
            // If no profile found, clear session and show login
            console.warn('Coach profile not found, clearing session');
            authService.logout();
            setUserRole(null);
          }
        } else if (session.role === 'BRANCH_ADMIN' && session.branchAdminData) {
          setBranchAdminData(session.branchAdminData);
        }
      }

      // 3. Load Data
      await loadData(isFirebaseReady);
      setIsLoading(false);
    };

    initApp();
  }, []);

  const loadData = async (useFirebase: boolean) => {
    let fetchedClients: ClientProfile[] = [];
    let fetchedCoaches: CoachProfile[] = [];

    if (useFirebase) {
      const [fetchedLessons, clients, coachesData] = await Promise.all([
        firebaseService.getLessons(),
        firebaseService.getClients(),
        firebaseService.getCoaches(),
      ]);
      setLessons(fetchedLessons);
      fetchedClients = clients;
      fetchedCoaches = coachesData;
      setCoaches(fetchedCoaches);
    } else {
      setLessons(storageService.getLessons());
      fetchedClients = storageService.getClients();
      fetchedCoaches = storageService.getCoaches();
      setCoaches(fetchedCoaches);
    }

    // Load lesson packages
    const currentCoachId = authService.getCoachProfile()?.id;
    if (currentCoachId) {
      if (useFirebase) {
        try {
          const pkgs = await firebaseService.getLessonPackages(currentCoachId);
          setLessonPackages(pkgs);
        } catch {
          setLessonPackages(storageService.getLessonPackages());
        }
      } else {
        setLessonPackages(storageService.getLessonPackages());
      }

      // Load training programs
      if (useFirebase) {
        try {
          const programs = await firebaseService.getTrainingPrograms(currentCoachId);
          setTrainingPrograms(programs);
        } catch {
          setTrainingPrograms(storageService.getTrainingPrograms());
        }
      } else {
        setTrainingPrograms(storageService.getTrainingPrograms());
      }
    }

    // Coach profile is local only for this demo unless we sync it
    const localCoachProfile = authService.getCoachProfile();
    setCoachProfile(localCoachProfile);

    // Sync designatedCoach for all clients based on coachId
    // Ensure data consistency: coachId와 designatedCoach는 항상 함께 있어야 함
    const syncedClients = fetchedClients.map((client) => {
      // Case 1: coachId가 있으면 designatedCoach도 반드시 설정
      if (client.coachId) {
        const coachName =
          fetchedCoaches.find((c) => c.id === client.coachId)?.name ||
          (localCoachProfile?.id === client.coachId
            ? localCoachProfile.name
            : undefined);

        return {
          ...client,
          designatedCoach: coachName || undefined, // coachId가 있으면 이름 찾기
        };
      }

      // Case 2: coachId가 없으면 designatedCoach도 제거 (불일치 방지)
      // Case 3: designatedCoach만 있고 coachId가 없는 경우 (레거시 데이터) - coachId 제거
      const cleanedClient = { ...client };
      if (!client.coachId && client.designatedCoach) {
        // 레거시 데이터: designatedCoach만 있는 경우 제거
        delete cleanedClient.designatedCoach;
      } else if (!client.coachId) {
        // 명시적으로 undefined 설정
        cleanedClient.designatedCoach = undefined;
      }

      return cleanedClient;
    });

    // 데이터 일관성 검증 및 자동 수정된 클라이언트 저장
    const needsUpdate = syncedClients.some((client, idx) => {
      const original = fetchedClients[idx];
      return (
        client.designatedCoach !== original.designatedCoach ||
        client.coachId !== original.coachId
      );
    });

    if (needsUpdate && useFirebase) {
      // Firebase에 수정된 데이터 저장
      try {
        await firebaseService.saveClients(syncedClients);
        console.log('✅ Client data consistency fixed and saved to Firebase');
      } catch (e) {
        console.error('Failed to save fixed client data:', e);
      }
    } else if (needsUpdate) {
      // 로컬 스토리지에 수정된 데이터 저장
      storageService.saveClients(syncedClients);
      console.log(
        '✅ Client data consistency fixed and saved to local storage'
      );
    }

    setClients(syncedClients);
  };

  const handleLoginSuccess = async (
    role: 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN',
    data: any,
    isAutoLogin: boolean
  ) => {
    setUserRole(role);

    let clientIdentity = undefined;

    if (role === 'BRANCH_ADMIN') {
      setBranchAdminData(data);
      authService.saveSession('BRANCH_ADMIN', undefined, isAutoLogin, data);
      return;
    }

    setCurrentUser(data);

    if (role === 'COACH') {
      setCoachProfile(data);
      // Save coach to DB if not exists (Simulation)
      if (firebaseService.isInitialized()) {
        await firebaseService.saveCoach(data);
      }
      loadAndShowCoachNotifications(data.id);
      checkAndShowLessonSuggestion(data.id);
    } else if (role === 'CLIENT') {
      clientIdentity = { name: data.name, phone: data.phone };
      // Ensure client is in our list (for new signups)
      const exists = clients.some(
        (c) => c.name === data.name && c.phone === data.phone
      );
      if (!exists) {
        setClients((prev) => [...prev, data]);
      }
    }

    authService.saveSession(role, clientIdentity, isAutoLogin);

    // Reload data to ensure freshness
    const isFb = firebaseService.isInitialized();
    await loadData(isFb);
  };

  // Deep-link: when the URL contains #lesson=<id> (e.g. from a KakaoTalk share),
  // navigate a coach directly to that lesson record once data is loaded.
  useEffect(() => {
    if (userRole !== 'COACH' || lessons.length === 0 || isLoading) return;

    const hash = window.location.hash; // e.g. "#lesson=abc123"
    const match = hash.match(/^#lesson=(.+)$/);
    if (!match) return;

    const lessonId = decodeURIComponent(match[1]);
    const target = lessons.find((l) => l.id === lessonId);
    if (target) {
      setSelectedLesson(target);
      setCoachView('DETAIL');
      // Clear the hash so navigating back doesn't re-trigger
      window.history.replaceState(
        null,
        '',
        window.location.origin + window.location.pathname + window.location.search
      );
    }
  }, [userRole, lessons, isLoading]);

  // Re-check lesson suggestions when the coach returns to the tab (page focus).
  useEffect(() => {
    if (userRole !== 'COACH' || !currentUser || !('id' in currentUser)) return;
    const coachId = (currentUser as CoachProfile).id;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndShowLessonSuggestion(coachId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userRole, currentUser, checkAndShowLessonSuggestion]);

  const handleLogout = () => {
    authService.logout();
    setUserRole(null);
    setCurrentUser(null);
    setBranchAdminData(null);
    setAuthEntryMode(null);
    setCoachView('LIST');
    setSelectedLesson(null);
  };

  const toggleLanguage = () => {
    const nextLang = language === 'ko' ? 'en' : language === 'en' ? 'ja' : language === 'ja' ? 'th' : 'ko';
    setLanguage(nextLang);
  };

  const toggleShowMedia = () => {
    const newValue = !showMedia;
    setShowMedia(newValue);
    localStorage.setItem('coach_showMedia', JSON.stringify(newValue));
  };

  // Helper to get local date
  const getLocalISODate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // --- CRUD Handlers ---

  const handleSaveLesson = async (
    newLesson: Lesson,
    homeworkBatch?: Homework[]
  ) => {
    // If editing, update the existing lesson
    if (isEditingLesson) {
      await handleUpdateLesson(newLesson);
      setIsEditingLesson(false);
      setCoachView('DETAIL');
      setSelectedLesson(newLesson);
      return;
    }

    // Logic Update: Ensure Coach ID is set correctly
    // If Coach creates it -> Set coachId to their ID
    // If Client creates it -> coachId is already set by NewLessonForm (based on client profile)
    const lessonToSave: Lesson = {
      ...newLesson,
      coachId:
        userRole === 'COACH' && 'id' in currentUser
          ? currentUser.id
          : newLesson.coachId,
      // Attach package session info if this lesson was created from a package
      ...(pendingPackageSession
        ? {
            lessonPackageId: pendingPackageSession.pkg.id,
            sessionNumber: pendingPackageSession.sessionNumber,
          }
        : {}),
    };

    // Optimistic Update
    setLessons((prev) => [lessonToSave, ...prev]);

    const isFb = firebaseService.isInitialized();
    try {
      // 1. Save Lesson
      if (isFb) {
        // Upload media first if needed (Blob -> Storage)
        const processedLesson = await firebaseService.processLessonMedia(
          lessonToSave
        );
        await firebaseService.saveLesson(processedLesson);
        // Update local state with processed URLs
        setLessons((prev) =>
          prev.map((l) => (l.id === lessonToSave.id ? processedLesson : l))
        );

        if (userRole === 'COACH') {
          if (pendingPackageSession) {
            setPendingPackageSession(null);
            setCoachView('LESSON_PACKAGE');
          } else {
            setCoachView('DETAIL');
            setSelectedLesson(processedLesson);
          }
        }
      } else {
        const updatedLessons = [lessonToSave, ...lessons];
        storageService.saveLessons(updatedLessons);

        if (userRole === 'COACH') {
          if (pendingPackageSession) {
            setPendingPackageSession(null);
            setCoachView('LESSON_PACKAGE');
          } else {
            setCoachView('DETAIL');
            setSelectedLesson(lessonToSave);
          }
        }
      }

      // 2. Handle Assigned Homework (Saved to Homework collection)
      if (homeworkBatch && homeworkBatch.length > 0) {
        if (isFb) {
          await firebaseService.saveHomeworkBatch(homeworkBatch);
        } else {
          storageService.saveHomeworkBatch(homeworkBatch);
        }
      }
    } catch (e) {
      console.error('Save failed', e);
      alert('저장에 실패했습니다.');
    }
  };

  const handleUpdateLesson = async (updatedLesson: Lesson) => {
    setLessons((prev) =>
      prev.map((l) => (l.id === updatedLesson.id ? updatedLesson : l))
    );
    if (selectedLesson?.id === updatedLesson.id) {
      setSelectedLesson(updatedLesson);
    }

    const isFb = firebaseService.isInitialized();
    if (isFb) {
      const processedLesson = await firebaseService.processLessonMedia(
        updatedLesson
      );
      await firebaseService.saveLesson(processedLesson);
    } else {
      const updatedList = lessons.map((l) =>
        l.id === updatedLesson.id ? updatedLesson : l
      );
      storageService.saveLessons(updatedList);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    // 1. Optimistic UI Update
    setLessons((prev) => prev.filter((l) => l.id !== lessonId));

    if (selectedLesson?.id === lessonId) {
      setSelectedLesson(null);
      setCoachView('LESSON_LIST');
    }

    // 2. Persistence
    const isFb = firebaseService.isInitialized();
    if (isFb) {
      const lessonToDelete = lessons.find((l) => l.id === lessonId);
      try {
        await firebaseService.deleteLesson(lessonId, lessonToDelete);
      } catch (e) {
        console.error('Failed to delete lesson from Firebase', e);
      }
    } else {
      const updatedList = lessons.filter((l) => l.id !== lessonId);
      storageService.saveLessons(updatedList);
    }
  };

  const handleEditLesson = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setIsEditingLesson(true);
    setCoachView('NEW');
  };

  // Helper: Get coach name by coachId
  const getCoachNameById = (coachId?: string): string | undefined => {
    if (!coachId) return undefined;
    // Check in coaches list first
    const coach = coaches.find((c) => c.id === coachId);
    if (coach) return coach.name;
    // Check current coach profile
    if (coachProfile?.id === coachId) return coachProfile.name;
    // Check auth service (local storage)
    const localCoach = authService.getCoachProfile();
    if (localCoach?.id === coachId) return localCoach.name;
    return undefined;
  };

  const handleAddClient = async (newClient: ClientProfile) => {
    // Sync designatedCoach with coachId - 데이터 일관성 보장
    // 규칙: coachId가 있으면 designatedCoach도 설정, 없으면 둘 다 undefined
    const clientWithCoach: ClientProfile = {
      ...newClient,
      designatedCoach: newClient.coachId
        ? getCoachNameById(newClient.coachId) || undefined
        : undefined,
    };

    setClients((prev) => [...prev, clientWithCoach]);
    const isFb = firebaseService.isInitialized();
    if (isFb) {
      await firebaseService.saveClients([clientWithCoach]);
    } else {
      storageService.saveClients([...clients, clientWithCoach]);
    }

    // If coachId is set, update ALL existing lessons for this client
    // This ensures the coach can see all of the client's existing lessons
    if (clientWithCoach.coachId) {
      const clientLessons = lessons.filter(
        (l) =>
          l.clientName === clientWithCoach.name &&
          l.clientPhone === clientWithCoach.phone &&
          l.coachId !== clientWithCoach.coachId // Only update lessons that don't already have this coachId
      );

      if (clientLessons.length > 0) {
        // Update coachId for ALL existing lessons of this client
        const updatedLessons = clientLessons.map((lesson) => ({
          ...lesson,
          coachId: clientWithCoach.coachId, // Assign to the coach
        }));

        // Update lessons in state
        setLessons((prev) =>
          prev.map((l) => {
            const updated = updatedLessons.find((ul) => ul.id === l.id);
            return updated || l;
          })
        );

        // Save updated lessons
        if (isFb) {
          try {
            await Promise.all(
              updatedLessons.map((lesson) => firebaseService.saveLesson(lesson))
            );
            console.log(
              `✅ Updated ${updatedLessons.length} existing lessons for client ${clientWithCoach.name} to coach ${clientWithCoach.coachId}`
            );
          } catch (e) {
            console.error('Failed to update lessons in Firebase:', e);
          }
        } else {
          const allLessons = storageService.getLessons();
          const finalLessons = allLessons.map((l) => {
            const updated = updatedLessons.find((ul) => ul.id === l.id);
            return updated || l;
          });
          storageService.saveLessons(finalLessons);
          console.log(
            `✅ Updated ${updatedLessons.length} existing lessons for client ${clientWithCoach.name} to coach ${clientWithCoach.coachId}`
          );
        }
      }
    }
  };

  const handleDeleteClient = async (client: ClientProfile) => {
    // 1. Delete Client
    setClients((prev) =>
      prev.filter((c) => !(c.name === client.name && c.phone === client.phone))
    );

    const isFb = firebaseService.isInitialized();
    if (isFb) {
      await firebaseService.deleteClient(client);
    } else {
      const updated = clients.filter(
        (c) => !(c.name === client.name && c.phone === client.phone)
      );
      storageService.saveClients(updated);
    }
  };

  const handleDeleteCoach = async (coach: CoachProfile) => {
    console.log(`🗑️ Deleting coach: ${coach.name} (${coach.id})`);
    
    // Prepare updated data first
    // 1. Remove coachId and designatedCoach from all clients managed by this coach
    const updatedClients = clients.map((c) => {
      if (c.coachId === coach.id || c.designatedCoach === coach.name) {
        console.log(`  - Removing coach assignment from client: ${c.name}`);
        return { ...c, coachId: undefined, designatedCoach: undefined };
      }
      return c;
    });

    // 2. Remove coachId from all lessons created by this coach (keep lessons)
    const updatedLessons = lessons.map((l) => {
      if (l.coachId === coach.id) {
        console.log(`  - Removing coachId from lesson: ${l.id}`);
        return { ...l, coachId: undefined };
      }
      return l;
    });

    // 3. Handle Firebase or LocalStorage deletion
    const isFb = firebaseService.isInitialized();
    try {
      if (isFb) {
        // Firebase: delete coach document and update related data
        await firebaseService.deleteCoach(coach);
        
        // Update clients in Firebase
        await firebaseService.saveClients(updatedClients);
        
        // Update lessons in Firebase that had this coach
        // Use a Set for O(1) lookup instead of O(n) find operation
        const originalLessonIds = new Set(
          lessons.filter(l => l.coachId === coach.id).map(l => l.id)
        );
        const lessonsToUpdate = updatedLessons.filter(l => originalLessonIds.has(l.id));
        for (const lesson of lessonsToUpdate) {
          await firebaseService.saveLesson(lesson);
        }
        
        console.log(`✅ Coach ${coach.name} deleted from Firebase`);
      } else {
        // LocalStorage: remove local coach profile if it matches
        const localCoachData = localStorage.getItem('swingnote_coach_profile');
        if (localCoachData) {
          try {
            const localCoach = JSON.parse(localCoachData);
            if (localCoach && localCoach.id === coach.id) {
              localStorage.removeItem('swingnote_coach_profile');
              console.log(`🧹 Removed local coach profile for ${coach.name}`);
            }
          } catch (e) {
            console.error('Failed to parse local coach profile:', e);
          }
        }
        
        // Update clients in LocalStorage
        storageService.saveClients(updatedClients);
        
        // Update lessons in LocalStorage
        storageService.saveLessons(updatedLessons);
        
        console.log(`✅ Coach ${coach.name} deleted from LocalStorage`);
      }

      // Only update state after successful database operations
      setClients(updatedClients);
      setLessons(updatedLessons);
      setCoaches((prev) => prev.filter((c) => c.id !== coach.id));
    } catch (error) {
      console.error('❌ Failed to delete coach:', error);
      alert('코치 삭제 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  const handleUpdateClientProfile = async (updatedProfile: ClientProfile) => {
    // Find the old profile to check if coachId changed
    const oldProfile = clients.find(
      (c) => c.name === updatedProfile.name && c.phone === updatedProfile.phone
    );

    // Sync designatedCoach with coachId (ensure consistency)
    // 데이터 일관성 규칙:
    // 1. coachId가 있으면 designatedCoach도 반드시 설정
    // 2. coachId가 없으면 designatedCoach도 undefined
    // 3. designatedCoach만 있고 coachId가 없으면 제거 (레거시 데이터 정리)
    const profileWithCoach: ClientProfile = {
      ...updatedProfile,
      designatedCoach: updatedProfile.coachId
        ? getCoachNameById(updatedProfile.coachId) || undefined
        : undefined,
    };

    // Update in list
    setClients((prev) =>
      prev.map((c) =>
        c.name === profileWithCoach.name && c.phone === profileWithCoach.phone
          ? profileWithCoach
          : c
      )
    );

    // Update current user if it's the client themselves
    if (
      userRole === 'CLIENT' &&
      currentUser.name === profileWithCoach.name &&
      currentUser.phone === profileWithCoach.phone
    ) {
      setCurrentUser(profileWithCoach);
    }

    // If coachId changed (or newly assigned), update ALL existing lessons for this client
    // This ensures the new coach can see all of the client's lessons
    const coachIdChanged =
      !oldProfile || oldProfile.coachId !== profileWithCoach.coachId;

    if (coachIdChanged && profileWithCoach.coachId !== undefined) {
      // Find all lessons for this client (by name and phone)
      const clientLessons = lessons.filter(
        (l) =>
          l.clientName === profileWithCoach.name &&
          l.clientPhone === profileWithCoach.phone
      );

      if (clientLessons.length > 0) {
        // Update coachId for ALL lessons of this client
        const updatedLessons = clientLessons.map((lesson) => ({
          ...lesson,
          coachId: profileWithCoach.coachId, // Assign to new coach
        }));

        // Update lessons in state
        setLessons((prev) =>
          prev.map((l) => {
            const updated = updatedLessons.find((ul) => ul.id === l.id);
            return updated || l;
          })
        );

        // Save updated lessons
        const isFb = firebaseService.isInitialized();
        if (isFb) {
          try {
            // Save all updated lessons to Firebase
            await Promise.all(
              updatedLessons.map((lesson) => firebaseService.saveLesson(lesson))
            );
            console.log(
              `✅ Updated ${updatedLessons.length} lessons for client ${profileWithCoach.name} to coach ${profileWithCoach.coachId}`
            );
          } catch (e) {
            console.error('Failed to update lessons in Firebase:', e);
          }
        } else {
          const allLessons = storageService.getLessons();
          const finalLessons = allLessons.map((l) => {
            const updated = updatedLessons.find((ul) => ul.id === l.id);
            return updated || l;
          });
          storageService.saveLessons(finalLessons);
          console.log(
            `✅ Updated ${updatedLessons.length} lessons for client ${profileWithCoach.name} to coach ${profileWithCoach.coachId}`
          );
        }
      }
    } else if (coachIdChanged && profileWithCoach.coachId === undefined) {
      // Coach was removed - clear coachId from all lessons
      const clientLessons = lessons.filter(
        (l) =>
          l.clientName === profileWithCoach.name &&
          l.clientPhone === profileWithCoach.phone &&
          l.coachId !== undefined // Only update lessons that have a coachId
      );

      if (clientLessons.length > 0) {
        const updatedLessons = clientLessons.map((lesson) => ({
          ...lesson,
          coachId: undefined, // Remove coach assignment
        }));

        // Update lessons in state
        setLessons((prev) =>
          prev.map((l) => {
            const updated = updatedLessons.find((ul) => ul.id === l.id);
            return updated || l;
          })
        );

        // Save updated lessons
        const isFb = firebaseService.isInitialized();
        if (isFb) {
          try {
            await Promise.all(
              updatedLessons.map((lesson) => firebaseService.saveLesson(lesson))
            );
            console.log(
              `✅ Removed coach assignment from ${updatedLessons.length} lessons for client ${profileWithCoach.name}`
            );
          } catch (e) {
            console.error('Failed to update lessons in Firebase:', e);
          }
        } else {
          const allLessons = storageService.getLessons();
          const finalLessons = allLessons.map((l) => {
            const updated = updatedLessons.find((ul) => ul.id === l.id);
            return updated || l;
          });
          storageService.saveLessons(finalLessons);
          console.log(
            `✅ Removed coach assignment from ${updatedLessons.length} lessons for client ${profileWithCoach.name}`
          );
        }
      }
    }

    const isFb = firebaseService.isInitialized();
    if (isFb) {
      await firebaseService.saveClients([profileWithCoach]);
    } else {
      const updatedList = clients.map((c) =>
        c.name === profileWithCoach.name && c.phone === profileWithCoach.phone
          ? profileWithCoach
          : c
      );
      storageService.saveClients(updatedList);
    }
  };

  const handleUpdateCoachProfile = (updated: CoachProfile) => {
    setCoachProfile(updated);
    setCurrentUser(updated);
    localStorage.setItem('swingnote_coach_profile', JSON.stringify(updated));
    // Also update in global list if using Firebase
    if (firebaseService.isInitialized()) {
      firebaseService.saveCoach(updated);
    }
  };

  const handleSaveLessonPackage = async (pkg: LessonPackage) => {
    setLessonPackages((prev) => {
      const idx = prev.findIndex((p) => p.id === pkg.id);
      return idx >= 0 ? [...prev.slice(0, idx), pkg, ...prev.slice(idx + 1)] : [...prev, pkg];
    });
    if (firebaseService.isInitialized()) {
      try {
        await firebaseService.saveLessonPackage(pkg);
      } catch (e) {
        console.error('Failed to save lesson package to Firebase:', e);
        storageService.saveLessonPackage(pkg);
      }
    } else {
      storageService.saveLessonPackage(pkg);
    }
  };

  const handleDeleteLessonPackage = async (packageId: string) => {
    setLessonPackages((prev) => prev.filter((p) => p.id !== packageId));
    if (firebaseService.isInitialized()) {
      try {
        await firebaseService.deleteLessonPackage(packageId);
      } catch (e) {
        console.error('Failed to delete lesson package from Firebase:', e);
        storageService.deleteLessonPackage(packageId);
      }
    } else {
      storageService.deleteLessonPackage(packageId);
    }
  };

  const handleSaveTrainingProgram = async (program: TrainingProgram) => {
    setTrainingPrograms((prev) => {
      const idx = prev.findIndex((p) => p.id === program.id);
      return idx >= 0 ? [...prev.slice(0, idx), program, ...prev.slice(idx + 1)] : [...prev, program];
    });
    if (firebaseService.isInitialized()) {
      try {
        await firebaseService.saveTrainingProgram(program);
      } catch (e) {
        console.error('Failed to save training program to Firebase:', e);
        storageService.saveTrainingProgram(program);
      }
    } else {
      storageService.saveTrainingProgram(program);
    }
  };

  const handleDeleteTrainingProgram = async (programId: string) => {
    setTrainingPrograms((prev) => prev.filter((p) => p.id !== programId));
    if (firebaseService.isInitialized()) {
      try {
        await firebaseService.deleteTrainingProgram(programId);
      } catch (e) {
        console.error('Failed to delete training program from Firebase:', e);
        storageService.deleteTrainingProgram(programId);
      }
    } else {
      storageService.deleteTrainingProgram(programId);
    }
  };

  const handleResetSystem = () => {
    storageService.clearAllData();
    window.location.reload();
  };

  const handleSearchCoach = async (name: string, phone: string) => {
    if (firebaseService.isInitialized()) {
      return await firebaseService.findCoach(name, phone);
    } else {
      // Mock local check
      const localCoach = authService.getCoachProfile();
      if (
        localCoach &&
        localCoach.name === name &&
        localCoach.phone === phone
      ) {
        return localCoach;
      }
      return null;
    }
  };

  const handleToggleSubscription = async (
    targetUser: ClientProfile | CoachProfile
  ) => {
    const newStatus = !targetUser.isSubscribed;
    const updatedUser = {
      ...targetUser,
      isSubscribed: newStatus,
      subscriptionPlan: newStatus ? 'PRO' : 'FREE',
      subscriptionEndDate: newStatus ? targetUser.subscriptionEndDate : undefined,
    };
    await updateUserState(updatedUser);
  };

  const handleChangeSubscriptionPlan = async (
    targetUser: ClientProfile | CoachProfile,
    plan: 'FREE' | 'PRO'
  ) => {
    const updatedUser = {
      ...targetUser,
      subscriptionPlan: plan,
      isSubscribed: plan === 'PRO',
      subscriptionEndDate:
        plan === 'PRO' ? targetUser.subscriptionEndDate : undefined,
    };
    await updateUserState(updatedUser);
    alert(
      `${'name' in targetUser ? targetUser.name : '사용자'}님의 구독 플랜이 ${plan}(으)로 변경되었습니다.`
    );
  };

  const handleGrantTrial = async (targetUser: ClientProfile | CoachProfile) => {
    const now = new Date();
    now.setDate(now.getDate() + 7);
    const endDate = now.toISOString();
    const updatedUser = {
      ...targetUser,
      isSubscribed: true,
      subscriptionPlan: 'PRO',
      subscriptionEndDate: endDate,
    };
    await updateUserState(updatedUser);
    alert(
      `${
        'name' in targetUser ? targetUser.name : '사용자'
      }님께 1주일 무료 체험이 지급되었습니다.`
    );
  };

  const updateUserState = async (user: ClientProfile | CoachProfile) => {
    // Check if Coach (has id)
    if ('id' in user) {
      const coach = user as CoachProfile;
      setCoaches((prev) => prev.map((c) => (c.id === coach.id ? coach : c)));
      if (coachProfile?.id === coach.id) setCoachProfile(coach);
      if (currentUser && 'id' in currentUser && currentUser.id === coach.id)
        setCurrentUser(coach);

      if (firebaseService.isInitialized()) {
        await firebaseService.saveCoach(coach);
      } else {
        // Local storage coach update
        if (authService.getCoachProfile()?.id === coach.id) {
          localStorage.setItem(
            'swingnote_coach_profile',
            JSON.stringify(coach)
          );
        }
      }
    } else {
      // Client
      const client = user as ClientProfile;
      setClients((prev) =>
        prev.map((c) =>
          c.name === client.name && c.phone === client.phone ? client : c
        )
      );

      if (firebaseService.isInitialized()) {
        await firebaseService.saveClients([client]);
      } else {
        const all = storageService.getClients();
        const updated = all.map((c) =>
          c.name === client.name && c.phone === client.phone ? client : c
        );
        storageService.saveClients(updated);
      }
    }
  };

  // --- Filter Logic ---
  const filteredLessons = useMemo(() => {
    let result = lessons;

    // Filter for Coach: Only show lessons that are either:
    // 1. Explicitly assigned to this coach (lesson.coachId)
    // 2. Created by this coach (lesson.createdBy === 'COACH' && coachId matches)
    if (userRole === 'COACH') {
      // If currentUser is null or doesn't have id, show no lessons (safety)
      if (!currentUser || !('id' in currentUser)) {
        console.warn(
          'Coach user not properly loaded, filtering out all lessons'
        );
        return [];
      }

      const coachId = currentUser.id;
      if (!coachId) {
        console.warn('Coach ID is missing, filtering out all lessons');
        return [];
      }

      result = lessons.filter((l) => {
        // Check direct assignment on the lesson record (Primary)
        if (l.coachId === coachId) return true;

        // Fallback for legacy data or if coachId wasn't stamped:
        // Check if the client is CURRENTLY assigned to this coach in the client list
        const client = clients.find(
          (c) => c.name === l.clientName && c.phone === l.clientPhone
        );
        if (client && client.coachId === coachId) return true;

        return false;
      });

      // Filter by selected client if specified
      if (selectedClientFilter) {
        result = result.filter(l => l.clientName === selectedClientFilter);
      }
    }

    return result.sort((a, b) => b.createdAt - a.createdAt);
  }, [lessons, userRole, currentUser, clients, selectedClientFilter]);

  /** All lessons for this coach regardless of client filter – used for dashboard stats */
  const allCoachLessons = useMemo(() => {
    if (userRole !== 'COACH' || !currentUser || !('id' in currentUser)) return [];
    const coachId = (currentUser as CoachProfile).id;
    return lessons
      .filter((l) => {
        if (l.coachId === coachId) return true;
        const client = clients.find(c => c.name === l.clientName && c.phone === l.clientPhone);
        return client?.coachId === coachId;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [lessons, userRole, currentUser, clients]);

  /** Dashboard-specific computed values */
  const dashboardData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const coachId = currentUser && 'id' in currentUser ? (currentUser as CoachProfile).id : '';

    const todayLessons = allCoachLessons.filter(l => l.date === today);
    const recentLessons = allCoachLessons.slice(0, 5);
    const coachClients = clients.filter(c => c.coachId === coachId);
    const coachPackages = lessonPackages.filter(p => p.coachId === coachId);

    /** Packages where the number of recorded sessions is below totalSessions */
    const packagesWithProgress = coachPackages.map(pkg => {
      const recorded = allCoachLessons.filter(l => l.lessonPackageId === pkg.id).length;
      return { pkg, recorded, remaining: pkg.totalSessions - recorded };
    });
    const incompletePackages = packagesWithProgress.filter(p => p.remaining > 0);

    return {
      todayLessons,
      recentLessons,
      coachClients,
      coachPackages,
      packagesWithProgress,
      incompletePackages,
    };
  }, [allCoachLessons, clients, lessonPackages, currentUser]);

  /** CoachX member growth reports – derived from lesson data for urgency badge and client list badges */
  const coachXMemberReports = useMemo(
    () => buildMemberGrowthReports(allCoachLessons, clients),
    [allCoachLessons, clients]
  );

  /**
   * Count of members whose trendIndicator is 'inactive' or 'plateau' – these are
   * the members that need coaching attention, used for the urgency badge on the CoachX entry.
   */
  const coachXUrgentCount = coachXMemberReports.filter(
    r => r.trendIndicator === 'inactive' || r.trendIndicator === 'plateau'
  ).length;
  const latestLesson = dashboardData?.recentLessons?.[0];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070A]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
      </div>
    );
  }

  // --- Render Views ---

  if (!userRole) {
    if (!authEntryMode) {
      return (
        <CoachXLanding
          onLogin={() => setAuthEntryMode('LOGIN')}
          onSignup={() => setAuthEntryMode('SIGNUP')}
        />
      );
    }
    return (
      <AuthScreen
        onLoginSuccess={handleLoginSuccess}
        initialMode={authEntryMode}
      />
    );
  }

  if (userRole === 'ADMIN') {
    return (
      <AdminDashboard
        clients={clients}
        lessons={lessons}
        coaches={coaches}
        coachProfile={coachProfile}
        onDeleteClient={handleDeleteClient}
        onDeleteCoach={handleDeleteCoach}
        onDeleteLesson={handleDeleteLesson}
        onResetSystem={handleResetSystem}
        onLogout={handleLogout}
        onToggleSubscription={handleToggleSubscription}
        onGrantTrial={handleGrantTrial}
        onChangeSubscriptionPlan={handleChangeSubscriptionPlan}
      />
    );
  }

  if (userRole === 'BRANCH_ADMIN' && branchAdminData) {
    return (
      <BranchAdminDashboard
        branchId={branchAdminData.branchId}
        branchName={branchAdminData.branchName}
        username={branchAdminData.username}
        onLogout={handleLogout}
      />
    );
  }

  if (userRole === 'CLIENT' && currentUser && !('id' in currentUser)) {
    return (
      <ClientApp
        clientProfile={currentUser}
        allLessons={lessons}
        onLogout={handleLogout}
        onUpdateLesson={handleUpdateLesson}
        onSaveNewRecord={handleSaveLesson}
        onDeleteLesson={handleDeleteLesson}
        onUpdateProfile={handleUpdateClientProfile}
      />
    );
  }

  // --- COACH VIEW ---

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#070b12] to-[#0B1220] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-[#0A0F1A]/95 border-b border-slate-800 shadow-lg shadow-black/30 sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {currentUser && 'id' in currentUser && (
            <div
              className="flex items-center gap-2 text-sm text-slate-200 hover:bg-slate-800 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
              onClick={() => setShowProfileModal(true)}
            >
              <div className="bg-indigo-500/20 p-1 rounded-full text-indigo-300">
                <User className="w-4 h-4" />
              </div>
              {/* Always visible Coach Name */}
              <span className="font-bold">
                {currentUser.name} {t('coach')}
              </span>
            </div>
          )}

          <div className="flex items-center gap-4 ml-auto">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1 text-sm font-bold text-slate-300 hover:text-cyan-200 transition-colors bg-slate-900 px-2 py-1.5 rounded-lg border border-slate-700"
            >
              <Globe className="w-4 h-4" />
              {language.toUpperCase()}
            </button>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>


      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {coachView === 'LIST' && (
          <div className="space-y-6 animate-fade-in">

            {/* ── Home actions ─────────────────────────────────────────────── */}
            <Button
              onClick={() => setCoachView('NEW')}
              data-testid="start-lesson-btn"
              className="w-full py-4 text-base shadow-lg shadow-indigo-900/40 bg-indigo-600 hover:bg-indigo-500 justify-center"
              icon={<Play className="w-5 h-5 fill-current" />}
            >
              Lesson start
            </Button>

            <Button
              onClick={() => setCoachView('COACHX')}
              data-testid="coachx-entry-btn"
              className="w-full py-4 text-base shadow-lg shadow-slate-900/40 bg-slate-800 hover:bg-slate-700 justify-center"
              icon={<Sparkles className="w-5 h-5" />}
            >
              Coachx
            </Button>

            <Button
              onClick={() => setCoachView('CLIENTS')}
              data-testid="students-entry-btn"
              className="w-full py-4 text-base shadow-lg shadow-slate-900/40 bg-slate-900 hover:bg-slate-800 justify-center"
              icon={<User className="w-5 h-5" />}
            >
              Student
            </Button>

          </div>
        )}

        {coachView === 'LESSON_LIST' && (
          <div className="space-y-6 animate-fade-in">
            {/* Back to Dashboard */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCoachView('LIST')}
                className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors px-3 py-2 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
                대시보드로 돌아가기
              </button>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-300" />
                레슨 기록
              </h2>
            </div>

            {/* Client Filter Section */}
            {userRole === 'COACH' && clients.length > 0 && (
              <div className="bg-slate-900/70 rounded-xl shadow-sm border border-slate-800 p-4">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-indigo-300" />
                  <div className="flex-1">
                    <select
                      value={selectedClientFilter}
                      onChange={(e) => setSelectedClientFilter(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-700 bg-slate-900 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-200"
                    >
                      <option value="">전체 회원 보기</option>
                      {clients
                        .filter(c => c.coachId === (currentUser as CoachProfile)?.id)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(client => (
                          <option key={`${client.name}_${client.phone}`} value={client.name}>
                            {client.name}
                          </option>
                        ))
                      }
                    </select>
                  </div>
                  
                  {selectedClientFilter && (
                    <button
                      onClick={() => setCoachView('CLIENT_STATS')}
                       className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors flex items-center gap-2 font-medium"
                    >
                      <BarChart3 className="w-4 h-4" />
                      통계 보기
                    </button>
                  )}
                  
                  {selectedClientFilter && (
                    <button
                      onClick={() => setSelectedClientFilter('')}
                      className="text-sm text-slate-400 hover:text-red-400 flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      초기화
                    </button>
                  )}
                </div>
                {selectedClientFilter && (
                  <div className="mt-2 text-sm text-slate-300">
                    <span className="font-bold text-indigo-300">{selectedClientFilter}</span>님의 레슨 {filteredLessons.length}개
                  </div>
                )}
              </div>
            )}

            {/* Media Toggle Section */}
            <div className="bg-slate-900/70 rounded-xl shadow-sm border border-slate-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-indigo-300" />
                  <span className="font-medium text-slate-200 text-sm">레슨 미디어 표시</span>
                </div>
                <button
                  onClick={toggleShowMedia}
                  className={`p-2 rounded-lg transition-colors ${
                    showMedia
                      ? 'bg-indigo-500/20 text-indigo-200'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                  title={showMedia ? '미디어 숨기기' : '미디어 표시'}
                >
                  {showMedia ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Lesson Grid */}
            {filteredLessons.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/70 rounded-2xl border border-dashed border-slate-700">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Filter className="w-8 h-8 text-slate-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-100">
                  {t('no_lessons')}
                </h3>
                <p className="text-slate-400">{t('no_lessons_desc')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredLessons.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    onClick={(l) => {
                      setSelectedLesson(l);
                      setCoachView('DETAIL');
                    }}
                    onShare={() => {}} // Removed manual sharing
                    onDelete={(l, e) => {
                      e.stopPropagation();
                      handleDeleteLesson(l.id);
                    }}
                    showMedia={showMedia}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {coachView === 'DETAIL' && selectedLesson && (
          <LessonDetail
            lesson={selectedLesson}
            allLessons={lessons}
            role="COACH"
            onBack={() => {
              if (selectedLesson.lessonPackageId && selectedClientForPackage) {
                setCoachView('LESSON_PACKAGE');
              } else {
                setCoachView('LESSON_LIST');
              }
              setSelectedLesson(null);
            }}
            onUpdate={handleUpdateLesson}
            onDelete={() => handleDeleteLesson(selectedLesson.id)}
            onEdit={handleEditLesson}
          />
        )}

        {coachView === 'NEW' && (
          <NewLessonForm
            existingClients={clients}
            packages={lessonPackages}
            lessons={lessons}
            userRole="COACH"
            onSave={handleSaveLesson}
            onCancel={() => {
              if (pendingPackageSession) {
                setPendingPackageSession(null);
                setCoachView('LESSON_PACKAGE');
              } else {
                setCoachView('LIST');
              }
              setIsEditingLesson(false);
              setSelectedLesson(null);
              setPrefilledSuggestionClient(null);
            }}
            initialData={isEditingLesson ? selectedLesson ?? undefined : undefined}
            prefilledClient={prefilledSuggestionClient ?? undefined}
          />
        )}

        {coachView === 'COMPARE' && (
          <SwingComparison
            lessons={filteredLessons}
            onBack={() => setCoachView('LESSON_LIST')}
          />
        )}

        {coachView === 'CLIENTS' && (
          <CoachClientManager
            clients={clients}
            onAdd={handleAddClient}
            onUpdate={handleUpdateClientProfile}
            onDelete={handleDeleteClient}
            onBack={() => setCoachView('LIST')}
            coachId={
              currentUser && 'id' in currentUser ? currentUser.id : undefined
            }
            onManagePackages={(client) => {
              setSelectedClientForPackage(client);
              setCoachView('LESSON_PACKAGE');
            }}
            onViewLessons={(client) => {
              setSelectedClientFilter(client.name);
              setCoachView('LESSON_LIST');
            }}
            onGenerateProgram={(client) => {
              setSelectedClientForTraining(client);
              setCoachView('TRAINING_PROGRAM');
            }}
            memberReports={coachXMemberReports}
            onOpenCoachX={(query) => {
              setCoachXChatInitialQuery(query);
              setCoachView('COACHX_CHAT');
            }}
          />
        )}

        {coachView === 'LESSON_PACKAGE' && selectedClientForPackage && currentUser && 'id' in currentUser && (
          <LessonPackageManager
            client={selectedClientForPackage}
            packages={lessonPackages}
            lessons={lessons}
            coachId={(currentUser as CoachProfile).id}
            onBack={() => {
              setCoachView('CLIENTS');
              setSelectedClientForPackage(null);
            }}
            onSavePackage={handleSaveLessonPackage}
            onDeletePackage={handleDeleteLessonPackage}
            onRecordSession={(pkg, sessionNumber) => {
              setPendingPackageSession({ pkg, sessionNumber });
              setIsEditingLesson(false);
              setSelectedLesson(null);
              setCoachView('NEW');
            }}
            onViewLesson={(lesson) => {
              setSelectedLesson(lesson);
              setCoachView('DETAIL');
            }}
          />
        )}

        {coachView === 'RESERVATIONS' && currentUser && 'id' in currentUser && (
          <ReservationManager
            coachProfile={currentUser as CoachProfile}
            onBack={() => {
              setCalendarSelectedDate(undefined);
              setCoachView('LIST');
            }}
            initialDate={calendarSelectedDate}
            onCoachUpdated={handleUpdateCoachProfile}
          />
        )}

        {coachView === 'BAY_RESERVATION' && currentUser && 'id' in currentUser && (
          <CoachBayReservation
            coachProfile={currentUser as CoachProfile}
            onBack={() => setCoachView('LIST')}
            onCoachUpdated={handleUpdateCoachProfile}
          />
        )}

        {coachView === 'MY_BAY_RESERVATIONS' && currentUser && 'id' in currentUser && (
          <MyBayReservations
            clientProfile={{
              name: (currentUser as CoachProfile).name,
              phone: (currentUser as CoachProfile).phone ?? '',
            }}
            overrideClientId={(currentUser as CoachProfile).id}
            onBack={() => setCoachView('LIST')}
          />
        )}

        {coachView === 'CLIENT_STATS' && selectedClientFilter && (
          <ClientStats
            lessons={filteredLessons.filter(l => l.clientName === selectedClientFilter)}
            onBack={() => setCoachView('LESSON_LIST')}
          />
        )}

        {coachView === 'TRAINING_PROGRAM' && selectedClientForTraining && currentUser && 'id' in currentUser && (
          <TrainingProgramGenerator
            client={selectedClientForTraining}
            lessons={lessons}
            coachId={(currentUser as CoachProfile).id}
            programs={trainingPrograms}
            onBack={() => {
              setCoachView('CLIENTS');
              setSelectedClientForTraining(null);
            }}
            onSaveProgram={handleSaveTrainingProgram}
            onDeleteProgram={handleDeleteTrainingProgram}
          />
        )}

        {coachView === 'COACHX' && currentUser && 'id' in currentUser && (
          <CoachXHub
            coachProfile={currentUser as CoachProfile}
            allLessons={allCoachLessons}
            clients={clients}
            onBack={() => setCoachView('LIST')}
            onOpenChat={(initialQuery) => {
              setCoachXChatInitialQuery(initialQuery);
              setCoachView('COACHX_CHAT');
            }}
          />
        )}

        {coachView === 'COACHX_CHAT' && currentUser && 'id' in currentUser && (
          <CoachXChat
            coachProfile={currentUser as CoachProfile}
            allLessons={allCoachLessons}
            clients={clients}
            onBack={() => {
              setCoachXChatInitialQuery(undefined);
              setCoachView('COACHX');
            }}
            initialQuery={coachXChatInitialQuery}
          />
        )}
      </main>

      {/* Homework Modal */}
      {showHomeworkModal && homeworkTargetClient && (
        <HomeworkModal
          isOpen={showHomeworkModal}
          onClose={() => setShowHomeworkModal(false)}
          clientId={homeworkTargetClient.id}
          clientName={homeworkTargetClient.name}
          isFirebaseMode={firebaseService.isInitialized()}
          onAssign={() => {}}
        />
      )}

      {/* Coach Profile Modal */}
      {showProfileModal && coachProfile && (
        <CoachProfileModal
          isOpen={showProfileModal}
          coachProfile={coachProfile}
          onClose={() => setShowProfileModal(false)}
          onUpdate={handleUpdateCoachProfile}
          onManageMembers={() => {
            setShowProfileModal(false);
            setCoachView('CLIENTS');
          }}
          onLogout={handleLogout}
        />
      )}

      {/* Coach reservation-request notification popup */}
      {showReservationNotificationModal && (
        <CoachReservationNotificationModal
          notifications={pendingReservationNotifications}
          onClose={() => {
            setShowReservationNotificationModal(false);
            markNotificationsAsRead(
              pendingReservationNotifications.map((n) => n.id)
            ).catch((e) =>
              console.error('[App] Failed to mark notifications as read:', e)
            );
            setPendingReservationNotifications([]);
          }}
          onGoToReservations={() => {
            setCoachView('RESERVATIONS');
          }}
        />
      )}

      {/* Coach-created member lesson reservation modal */}
      {showCoachLessonModal && coachLessonModalDate !== undefined && currentUser && 'id' in currentUser && (
        <CoachLessonReservationModal
          coachProfile={currentUser as CoachProfile}
          initialDate={coachLessonModalDate}
          initialHour={coachLessonModalHour}
          onClose={() => setShowCoachLessonModal(false)}
          onSaved={() => {
            setShowCoachLessonModal(false);
          }}
        />
      )}

      {/* Lesson-start suggestion prompt */}
      {lessonSuggestion && (
        <LessonStartPromptModal
          suggestion={lessonSuggestion}
          onStart={(s) => {
            setLessonSuggestion(null);
            // Pre-fill the matching client in the new-lesson form
            const matchedClient = clients.find(
              (c) =>
                c.name === s.reservation.clientName &&
                c.phone === (s.reservation.clientPhone ?? '')
            ) ?? null;
            setPrefilledSuggestionClient(matchedClient);
            setIsEditingLesson(false);
            setSelectedLesson(null);
            setCoachView('NEW');
          }}
          onRemindLater={(s) => {
            markRemindLater(s.reservation.id);
            setLessonSuggestion(null);
          }}
          onSkipToday={(s) => {
            markSkippedToday(s.reservation.id);
            setLessonSuggestion(null);
          }}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
};

export default App;
