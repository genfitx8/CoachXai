import React, { useState, useEffect, useMemo } from 'react';
import {
  ViewState,
  Lesson,
  CoachProfile,
  ClientProfile,
  Homework,
} from './types';
import { LessonCard } from './components/LessonCard';
import { LessonDetail } from './components/LessonDetail';
import { NewLessonForm } from './components/NewLessonForm';
import { ClientApp } from './components/ClientApp';
import { AuthScreen } from './components/AuthScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { SwingComparison } from './components/SwingComparison';
import { HomeworkModal } from './components/HomeworkModal';
import { CoachProfileModal } from './components/CoachProfileModal';
import { CoachClientManager } from './components/CoachClientManager';
import { ClientStats } from './components/ClientStats';
import { storageService } from './services/storage';
import { authService } from './services/authService';
import { firebaseService } from './services/firebase';
import { Button } from './components/Button';
import {
  Plus,
  Search,
  Filter,
  LogOut,
  User,
  Menu,
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
} from 'lucide-react';
import { LanguageProvider, useLanguage } from './components/LanguageContext';

const AppContent: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();

  // Session State
  const [userRole, setUserRole] = useState<'COACH' | 'CLIENT' | 'ADMIN' | null>(
    null
  );
  const [currentUser, setCurrentUser] = useState<
    CoachProfile | ClientProfile | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  // Data State
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]); // Added for Admin
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);

  // View State (Coach)
  const [coachView, setCoachView] = useState<ViewState>('LIST');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>(''); // '' or clientName
  
  // Media visibility toggle for Coach
  const [showMedia, setShowMedia] = useState<boolean>(() => {
    const saved = localStorage.getItem('coach_showMedia');
    return saved ? JSON.parse(saved) : false; // Default to hidden (false)
  });

  // Modals
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [homeworkTargetClient, setHomeworkTargetClient] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

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
          } else {
            // If no profile found, clear session and show login
            console.warn('Coach profile not found, clearing session');
            authService.logout();
            setUserRole(null);
          }
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
    role: 'COACH' | 'CLIENT' | 'ADMIN',
    data: any,
    isAutoLogin: boolean
  ) => {
    setUserRole(role);
    setCurrentUser(data);

    let clientIdentity = undefined;

    if (role === 'COACH') {
      setCoachProfile(data);
      // Save coach to DB if not exists (Simulation)
      if (firebaseService.isInitialized()) {
        await firebaseService.saveCoach(data);
      }
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

  const handleLogout = () => {
    authService.logout();
    setUserRole(null);
    setCurrentUser(null);
    setCoachView('LIST');
    setSelectedLesson(null);
  };

  const toggleLanguage = () => {
    const nextLang = language === 'ko' ? 'en' : language === 'en' ? 'ja' : 'ko';
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
    // Logic Update: Ensure Coach ID is set correctly
    // If Coach creates it -> Set coachId to their ID
    // If Client creates it -> coachId is already set by NewLessonForm (based on client profile)
    const lessonToSave: Lesson = {
      ...newLesson,
      coachId:
        userRole === 'COACH' && 'id' in currentUser
          ? currentUser.id
          : newLesson.coachId,
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
          setCoachView('DETAIL');
          setSelectedLesson(processedLesson);
        }
      } else {
        const updatedLessons = [lessonToSave, ...lessons];
        storageService.saveLessons(updatedLessons);

        if (userRole === 'COACH') {
          setCoachView('DETAIL');
          setSelectedLesson(lessonToSave);
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
      setCoachView('LIST');
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
    const updatedUser = { ...targetUser, isSubscribed: newStatus };
    await updateUserState(updatedUser);
  };

  const handleGrantTrial = async (targetUser: ClientProfile | CoachProfile) => {
    const now = new Date();
    now.setDate(now.getDate() + 7);
    const endDate = now.toISOString();
    const updatedUser = {
      ...targetUser,
      isSubscribed: true,
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  // --- Render Views ---

  if (!userRole) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (userRole === 'ADMIN') {
    return (
      <AdminDashboard
        clients={clients}
        lessons={lessons}
        coaches={coaches}
        coachProfile={coachProfile}
        onDeleteClient={handleDeleteClient}
        onDeleteLesson={handleDeleteLesson}
        onResetSystem={handleResetSystem}
        onLogout={handleLogout}
        onToggleSubscription={handleToggleSubscription}
        onGrantTrial={handleGrantTrial}
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
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              setCoachView('LIST');
              setSelectedLesson(null);
            }}
          >
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Menu className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl text-gray-900 tracking-tight">
              SwingNote
            </span>
            <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
              {t('coach')}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-200"
            >
              <Globe className="w-4 h-4" />
              {language.toUpperCase()}
            </button>

            {currentUser && 'id' in currentUser && (
              <div
                className="flex items-center gap-2 text-sm text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
                onClick={() => setShowProfileModal(true)}
              >
                <div className="bg-indigo-100 p-1 rounded-full text-indigo-600">
                  <User className="w-4 h-4" />
                </div>
                {/* Always visible Coach Name */}
                <span className="font-bold">
                  {currentUser.name} {t('coach')}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-500"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {coachView === 'LIST' && (
          <div className="space-y-6 animate-fade-in">
            {/* Main Action Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {t('coach_dashboard')}
                </h2>
                <p className="text-sm text-gray-500">
                  {t('coach_dashboard_desc')}
                </p>
              </div>
              <Button
                onClick={() => setCoachView('NEW')}
                className="w-full md:w-auto px-8 py-3 text-lg shadow-lg shadow-indigo-200 bg-indigo-600 hover:bg-indigo-700"
                icon={<Play className="w-5 h-5 fill-current" />}
              >
                {t('start_lesson')}
              </Button>
            </div>

            {/* Client Filter Section */}
            {userRole === 'COACH' && clients.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-indigo-600" />
                  <div className="flex-1">
                    <select
                      value={selectedClientFilter}
                      onChange={(e) => setSelectedClientFilter(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-gray-700"
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
                  
                  {/* 새로 추가: 통계 보기 버튼 */}
                  {selectedClientFilter && (
                    <button
                      onClick={() => setCoachView('CLIENT_STATS')}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 font-medium"
                    >
                      <BarChart3 className="w-4 h-4" />
                      통계 보기
                    </button>
                  )}
                  
                  {selectedClientFilter && (
                    <button
                      onClick={() => setSelectedClientFilter('')}
                      className="text-sm text-gray-500 hover:text-red-500 flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      초기화
                    </button>
                  )}
                </div>
                {selectedClientFilter && (
                  <div className="mt-2 text-sm text-gray-600">
                    <span className="font-bold text-indigo-600">{selectedClientFilter}</span>님의 레슨 {filteredLessons.length}개
                  </div>
                )}
              </div>
            )}

            {/* Media Toggle Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-indigo-600" />
                  <span className="font-medium text-gray-700 text-sm">레슨 미디어 표시</span>
                </div>
                <button
                  onClick={toggleShowMedia}
                  className={`p-2 rounded-lg transition-colors ${
                    showMedia
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  title={showMedia ? '미디어 숨기기' : '미디어 표시'}
                >
                  {showMedia ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Lesson Grid */}
            {filteredLessons.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Filter className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  {t('no_lessons')}
                </h3>
                <p className="text-gray-500">{t('no_lessons_desc')}</p>
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
              setCoachView('LIST');
              setSelectedLesson(null);
            }}
            onUpdate={handleUpdateLesson}
            onDelete={() => handleDeleteLesson(selectedLesson.id)}
          />
        )}

        {coachView === 'NEW' && (
          <NewLessonForm
            existingClients={clients}
            userRole="COACH"
            onSave={handleSaveLesson}
            onCancel={() => setCoachView('LIST')}
          />
        )}

        {coachView === 'COMPARE' && (
          <SwingComparison
            lessons={filteredLessons}
            onBack={() => setCoachView('LIST')}
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
          />
        )}

        {coachView === 'CLIENT_STATS' && selectedClientFilter && (
          <ClientStats
            lessons={filteredLessons.filter(l => l.clientName === selectedClientFilter)}
            onBack={() => setCoachView('LIST')}
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
