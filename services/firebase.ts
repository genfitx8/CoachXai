/// <reference types="vite/client" />

import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
  Firestore,
  query,
  orderBy,
  where,
  updateDoc,
  writeBatch,
  startAt,
  endAt,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  FirebaseStorage,
  deleteObject,
} from 'firebase/storage';
import {
  FirebaseConfig,
  Lesson,
  ClientProfile,
  CoachProfile,
  Homework,
  HomeworkTemplate,
  PointTransaction,
  NotificationMessage,
  GolfCourse,
  LessonReservation,
  CalendarIntegration,
  Branch,
  BranchAdminAccount,
  Bay,
  BayPriceRule,
  BayReservation,
} from '../types';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

const STORAGE_KEYS = {
  FIREBASE_CONFIG: 'swingnote_firebase_config',
};

// Helper: Remove undefined fields from object (Firebase doesn't support undefined)
const removeUndefinedFields = <T extends Record<string, any>>(
  obj: T
): Partial<T> => {
  const cleaned: any = { ...obj };
  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    } else if (Array.isArray(cleaned[key])) {
      // Recursively clean array items
      cleaned[key] = cleaned[key].map((item: any) =>
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        !(item instanceof Date)
          ? removeUndefinedFields(item)
          : item
      );
    } else if (
      typeof cleaned[key] === 'object' &&
      cleaned[key] !== null &&
      !(cleaned[key] instanceof Date) &&
      !Array.isArray(cleaned[key])
    ) {
      // Recursively clean nested objects
      cleaned[key] = removeUndefinedFields(cleaned[key]);
    }
  });
  return cleaned as T;
};

export const firebaseService = {
  /**
   * Initialize Firebase with the provided config.
   * Returns true if successful.
   */
  init: (config: FirebaseConfig): boolean => {
    try {
      if (!config.apiKey || !config.projectId) return false;

      app = initializeApp(config);
      db = getFirestore(app);
      storage = getStorage(app);

      localStorage.setItem(
        STORAGE_KEYS.FIREBASE_CONFIG,
        JSON.stringify(config)
      );
      return true;
    } catch (e) {
      console.error('Firebase Initialization Error:', e);
      return false;
    }
  },

  /**
   * Get Firebase config from environment variables or localStorage.
   * Priority: 1. Environment variables (.env) 2. localStorage
   */
  getSavedConfig: (): FirebaseConfig | null => {
    // 1. Try to get from environment variables first
    const envConfig: FirebaseConfig | null = (() => {
      const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
      const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
      const messagingSenderId = import.meta.env
        .VITE_FIREBASE_MESSAGING_SENDER_ID;
      const appId = import.meta.env.VITE_FIREBASE_APP_ID;

      if (apiKey && projectId) {
        return {
          apiKey,
          authDomain: authDomain || '',
          projectId,
          storageBucket: storageBucket || '',
          messagingSenderId: messagingSenderId || '',
          appId: appId || '',
        };
      }
      return null;
    })();

    if (envConfig) {
      return envConfig;
    }

    // 2. Fall back to localStorage
    const data = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
    return data ? JSON.parse(data) : null;
  },

  isInitialized: (): boolean => {
    return !!app && !!db && !!storage;
  },

  // --- Firestore Operations ---

  getLessons: async (): Promise<Lesson[]> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      const q = query(collection(db, 'lessons'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => doc.data() as Lesson);
    } catch (e) {
      console.error('Failed to fetch lessons:', e);
      return [];
    }
  },

  saveLesson: async (lesson: Lesson): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      // Remove undefined fields before saving (Firebase doesn't support undefined)
      const cleanedLesson = removeUndefinedFields(lesson);
      await setDoc(doc(db, 'lessons', lesson.id), cleanedLesson);
    } catch (e) {
      console.error('Failed to save lesson:', e);
      throw e;
    }
  },

  deleteLesson: async (
    lessonId: string,
    lessonData?: Lesson
  ): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      await deleteDoc(doc(db, 'lessons', lessonId));

      // Attempt to delete media if exists (Best effort)
      if (storage && lessonData) {
        if (lessonData.videoUrl && !lessonData.videoUrl.startsWith('blob:')) {
          // Logic to extract path from URL would go here
        }
      }
    } catch (e) {
      console.error('Failed to delete lesson:', e);
      throw e;
    }
  },

  // --- Client Operations ---

  getClients: async (): Promise<ClientProfile[]> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      const snapshot = await getDocs(collection(db, 'clients'));
      return snapshot.docs.map((doc) => doc.data() as ClientProfile);
    } catch (e) {
      console.error('Failed to fetch clients:', e);
      return [];
    }
  },

  saveClients: async (clients: ClientProfile[]): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      const batch = writeBatch(db);
      clients.forEach((client) => {
        const docRef = doc(db, 'clients', `${client.name}_${client.phone}`);
        // Remove undefined fields before saving (Firebase doesn't support undefined)
        const cleanedClient = removeUndefinedFields(client);
        batch.set(docRef, cleanedClient);
      });
      await batch.commit();
    } catch (e) {
      console.error('Failed to save clients:', e);
      throw e;
    }
  },

  deleteClient: async (client: ClientProfile): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      await deleteDoc(doc(db, 'clients', `${client.name}_${client.phone}`));
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  // --- Coach Operations (New) ---

  getCoaches: async (): Promise<CoachProfile[]> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      const snapshot = await getDocs(collection(db, 'coaches'));
      return snapshot.docs.map((doc) => doc.data() as CoachProfile);
    } catch (e) {
      console.error('Failed to fetch coaches:', e);
      return [];
    }
  },

  saveCoach: async (coach: CoachProfile): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      // Remove undefined fields before saving (Firebase doesn't support undefined)
      const cleanedCoach = removeUndefinedFields(coach);
      await setDoc(doc(db, 'coaches', coach.id), cleanedCoach);
    } catch (e) {
      console.error('Failed to save coach:', e);
      throw e;
    }
  },

  findCoach: async (
    name: string,
    phone: string
  ): Promise<CoachProfile | null> => {
    if (!db) return null;
    const q = query(
      collection(db, 'coaches'),
      where('name', '==', name),
      where('phone', '==', phone)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].data() as CoachProfile;
    return null;
  },

  getCoachById: async (coachId: string): Promise<CoachProfile | null> => {
    if (!db) return null;
    try {
      const snap = await getDocs(
        query(collection(db, 'coaches'), where('id', '==', coachId))
      );
      if (!snap.empty) return snap.docs[0].data() as CoachProfile;
      return null;
    } catch (e) {
      console.error('Failed to fetch coach by id:', e);
      return null;
    }
  },

  searchCoachesByName: async (name: string): Promise<CoachProfile[]> => {
    if (!db) return [];
    const q = query(
      collection(db, 'coaches'),
      where('name', '>=', name),
      where('name', '<=', name + '\uf8ff')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CoachProfile);
  },

  deleteCoach: async (coach: CoachProfile): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      await deleteDoc(doc(db, 'coaches', coach.id));
      console.log(`✅ Firebase: Coach ${coach.name} (${coach.id}) deleted`);
    } catch (e) {
      console.error('Failed to delete coach:', e);
      throw e;
    }
  },

  // --- Homework Operations ---

  getHomework: async (clientId: string): Promise<Homework[]> => {
    if (!db) throw new Error('Firebase not initialized');
    const q = query(
      collection(db, 'homework'),
      where('clientId', '==', clientId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Homework);
  },

  saveHomework: async (homework: Homework): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    // Remove undefined fields before saving (Firebase doesn't support undefined)
    const cleanedHomework = removeUndefinedFields(homework);
    await setDoc(doc(db, 'homework', homework.id), cleanedHomework);
  },

  saveHomeworkBatch: async (list: Homework[]): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const batch = writeBatch(db);
    list.forEach((h) => {
      // Remove undefined fields before saving (Firebase doesn't support undefined)
      const cleanedHomework = removeUndefinedFields(h);
      batch.set(doc(db, 'homework', h.id), cleanedHomework);
    });
    await batch.commit();
  },

  updateHomeworkStatus: async (
    id: string,
    isCompleted: boolean
  ): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    await updateDoc(doc(db, 'homework', id), { isCompleted });
  },

  deleteHomework: async (id: string): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    await deleteDoc(doc(db, 'homework', id));
  },

  // --- Homework Templates ---

  getHomeworkTemplates: async (): Promise<HomeworkTemplate[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, 'homework_templates'));
    return snap.docs.map((d) => d.data() as HomeworkTemplate);
  },

  saveHomeworkTemplate: async (template: HomeworkTemplate): Promise<void> => {
    if (!db) return;
    // Remove undefined fields before saving (Firebase doesn't support undefined)
    const cleanedTemplate = removeUndefinedFields(template);
    await setDoc(doc(db, 'homework_templates', template.id), cleanedTemplate);
  },

  deleteHomeworkTemplate: async (id: string): Promise<void> => {
    if (!db) return;
    await deleteDoc(doc(db, 'homework_templates', id));
  },

  // --- Point System ---

  addPointTransaction: async (transaction: PointTransaction): Promise<void> => {
    if (!db) return;
    await setDoc(doc(db, 'points', transaction.id), transaction);
  },

  getPointTransactions: async (
    clientId: string
  ): Promise<PointTransaction[]> => {
    if (!db) return [];
    const q = query(
      collection(db, 'points'),
      where('clientId', '==', clientId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as PointTransaction);
  },

  // --- Notifications ---

  sendNotification: async (msg: NotificationMessage): Promise<void> => {
    if (!db) return;
    await setDoc(doc(db, 'notifications', msg.id), msg);
  },

  updateNotification: async (id: string, changes: Partial<NotificationMessage>): Promise<void> => {
    if (!db) return;
    await updateDoc(doc(db, 'notifications', id), changes as Record<string, unknown>);
  },

  getNotifications: async (): Promise<NotificationMessage[]> => {
    if (!db) return [];
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as NotificationMessage);
  },

  // --- Golf Courses ---

  getGolfCourses: async (): Promise<GolfCourse[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, 'golf_courses'));
    return snap.docs.map((d) => d.data() as GolfCourse);
  },

  saveGolfCourse: async (course: GolfCourse): Promise<void> => {
    if (!db) return;
    // Remove undefined fields before saving (Firebase doesn't support undefined)
    const cleanedCourse = removeUndefinedFields(course);
    await setDoc(doc(db, 'golf_courses', course.id), cleanedCourse);
  },

  deleteGolfCourse: async (id: string): Promise<void> => {
    if (!db) return;
    await deleteDoc(doc(db, 'golf_courses', id));
  },

  searchGolfCourses: async (term: string): Promise<GolfCourse[]> => {
    if (!db) return [];
    // Simple client-side filtering for now as Firestore full-text search requires Algolia/Elastic
    const snap = await getDocs(collection(db, 'golf_courses'));
    const all = snap.docs.map((d) => d.data() as GolfCourse);
    return all.filter((c) => c.name.includes(term));
  },

  // --- Storage Helper ---

  processLessonMedia: async (lesson: Lesson): Promise<Lesson> => {
    if (!storage) return lesson;

    // Helper to upload blob url
    const uploadBlob = async (
      blobUrl: string,
      path: string
    ): Promise<string> => {
      if (!blobUrl.startsWith('blob:')) return blobUrl; // Already remote

      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const storageRef = ref(storage!, path);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    };

    const updatedLesson = { ...lesson };
    const timestamp = Date.now();

    // Main Video/Image
    if (updatedLesson.videoUrl && updatedLesson.videoUrl.startsWith('blob:')) {
      const ext =
        updatedLesson.mediaType === 'image'
          ? 'jpg'
          : updatedLesson.mediaType === 'audio'
          ? 'mp4'
          : 'mp4';
      updatedLesson.videoUrl = await uploadBlob(
        updatedLesson.videoUrl,
        `lessons/${updatedLesson.id}/main.${ext}`
      );
    }

    // Additional Media
    if (updatedLesson.additionalMedia) {
      updatedLesson.additionalMedia = await Promise.all(
        updatedLesson.additionalMedia.map(async (m, idx) => {
          if (m.url.startsWith('blob:')) {
            const ext =
              m.type === 'image' ? 'jpg' : m.type === 'audio' ? 'mp4' : 'mp4';
            const newUrl = await uploadBlob(
              m.url,
              `lessons/${updatedLesson.id}/additional_${idx}_${timestamp}.${ext}`
            );
            return { ...m, url: newUrl };
          }
          return m;
        })
      );
    }

    // Hole Voice
    if (updatedLesson.scorecardDetail) {
      updatedLesson.scorecardDetail.holes = await Promise.all(
        updatedLesson.scorecardDetail.holes.map(async (h) => {
          if (h.voiceUrl && h.voiceUrl.startsWith('blob:')) {
            const newUrl = await uploadBlob(
              h.voiceUrl,
              `lessons/${updatedLesson.id}/hole_${h.holeNumber}_${timestamp}.mp4`
            );
            return { ...h, voiceUrl: newUrl };
          }
          return h;
        })
      );
    }

    // Client Voice Feedback
    if (
      updatedLesson.clientFeedback?.voiceUrl &&
      updatedLesson.clientFeedback.voiceUrl.startsWith('data:')
    ) {
      // Data URLs (Base64) from FileReader
      const res = await fetch(updatedLesson.clientFeedback.voiceUrl);
      const blob = await res.blob();
      const storageRef = ref(
        storage!,
        `lessons/${updatedLesson.id}/feedback_${timestamp}.mp4`
      );
      await uploadBytes(storageRef, blob);
      updatedLesson.clientFeedback.voiceUrl = await getDownloadURL(storageRef);
    }

    return updatedLesson;
  },

  /**
   * Upload edited video to Firebase Storage
   */
  uploadEditedVideo: async (
    videoBlob: Blob,
    lessonId: string,
    userId: string
  ): Promise<string> => {
    if (!storage) {
      throw new Error('Firebase Storage not initialized');
    }

    const timestamp = Date.now();
    const path = `edited-videos/${userId}/${lessonId}_${timestamp}.mp4`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, videoBlob);
    const downloadUrl = await getDownloadURL(storageRef);

    return downloadUrl;
  },

  // --- Reservation Methods ---

  /**
   * Save a reservation to Firestore
   */
  saveReservation: async (reservation: LessonReservation): Promise<void> => {
    if (!db) return;
    const cleaned = removeUndefinedFields(reservation);
    await setDoc(doc(db, 'reservations', reservation.id), cleaned);
  },

  /**
   * Get reservations by coach or client
   */
  getReservations: async (coachId?: string, clientId?: string): Promise<LessonReservation[]> => {
    if (!db) return [];
    
    let q;
    if (coachId) {
      q = query(collection(db, 'reservations'), where('coachId', '==', coachId));
    } else if (clientId) {
      q = query(collection(db, 'reservations'), where('clientId', '==', clientId));
    } else {
      q = query(collection(db, 'reservations'));
    }

    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LessonReservation);
  },

  /**
   * Update a reservation
   */
  updateReservation: async (reservation: LessonReservation): Promise<void> => {
    if (!db) return;
    const cleaned = removeUndefinedFields(reservation);
    await setDoc(doc(db, 'reservations', reservation.id), cleaned);
  },

  /**
   * Delete a reservation
   */
  deleteReservation: async (id: string): Promise<void> => {
    if (!db) return;
    await deleteDoc(doc(db, 'reservations', id));
  },

  // --- Calendar Integration Operations ---

  saveCalendarIntegration: async (
    integration: CalendarIntegration
  ): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      const cleanedIntegration = removeUndefinedFields(integration);
      await setDoc(
        doc(db, 'calendar_integrations', integration.id),
        cleanedIntegration
      );
    } catch (e) {
      console.error('Failed to save calendar integration:', e);
      throw e;
    }
  },

  getCalendarIntegrations: async (
    userId: string
  ): Promise<CalendarIntegration[]> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      const q = query(
        collection(db, 'calendar_integrations'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as CalendarIntegration);
    } catch (e) {
      console.error('Failed to fetch calendar integrations:', e);
      return [];
    }
  },

  updateCalendarIntegration: async (
    integrationId: string,
    updates: Partial<CalendarIntegration>
  ): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      const cleanedUpdates = removeUndefinedFields(updates);
      await updateDoc(
        doc(db, 'calendar_integrations', integrationId),
        cleanedUpdates
      );
    } catch (e) {
      console.error('Failed to update calendar integration:', e);
      throw e;
    }
  },

  deleteCalendarIntegration: async (integrationId: string): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    try {
      await deleteDoc(doc(db, 'calendar_integrations', integrationId));
    } catch (e) {
      console.error('Failed to delete calendar integration:', e);
      throw e;
    }
  },

  saveSyncLog: async (log: {
    integrationId: string;
    syncedAt: number;
    status: 'SUCCESS' | 'FAILED';
    itemsSynced: number;
    errors?: string[];
  }): Promise<void> => {
    if (!db) return;
    const logId = `${log.integrationId}_${log.syncedAt}`;
    await setDoc(doc(db, 'calendar_sync_logs', logId), log);
  },

  // --- Branch Operations ---

  getBranches: async (): Promise<Branch[]> => {
    if (!db) return [];
    try {
      const snap = await getDocs(collection(db, 'branches'));
      return snap.docs.map((d) => d.data() as Branch);
    } catch (e) {
      console.error('Failed to fetch branches:', e);
      return [];
    }
  },

  saveBranch: async (branch: Branch): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const cleaned = removeUndefinedFields(branch);
    await setDoc(doc(db, 'branches', branch.id), cleaned);
  },

  updateBranch: async (branchId: string, fields: Partial<Omit<Branch, 'id'>>): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const cleaned = removeUndefinedFields({ ...fields, updatedAt: Date.now() });
    await updateDoc(doc(db, 'branches', branchId), cleaned);
  },

  deleteBranch: async (branchId: string): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    // Soft-delete: set isActive = false
    await updateDoc(doc(db, 'branches', branchId), {
      isActive: false,
      updatedAt: Date.now(),
    });
  },

  // --- BranchAdminAccount Operations ---

  getBranchAdminAccounts: async (branchId?: string): Promise<BranchAdminAccount[]> => {
    if (!db) return [];
    try {
      let q;
      if (branchId) {
        q = query(
          collection(db, 'branch_admin_accounts'),
          where('branchId', '==', branchId)
        );
      } else {
        q = query(collection(db, 'branch_admin_accounts'));
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as BranchAdminAccount);
    } catch (e) {
      console.error('Failed to fetch branch admin accounts:', e);
      return [];
    }
  },

  saveBranchAdminAccount: async (account: BranchAdminAccount): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const cleaned = removeUndefinedFields(account);
    await setDoc(doc(db, 'branch_admin_accounts', account.id), cleaned);
  },

  deleteBranchAdminAccount: async (accountId: string): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    // Soft-delete: set isActive = false
    await updateDoc(doc(db, 'branch_admin_accounts', accountId), {
      isActive: false,
      updatedAt: Date.now(),
    });
  },

  // --- Bay Operations ---

  getBays: async (branchId?: string): Promise<Bay[]> => {
    if (!db) return [];
    try {
      let q;
      if (branchId) {
        q = query(collection(db, 'bays'), where('branchId', '==', branchId));
      } else {
        q = query(collection(db, 'bays'));
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as Bay);
    } catch (e) {
      console.error('Failed to fetch bays:', e);
      return [];
    }
  },

  saveBay: async (bay: Bay): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const cleaned = removeUndefinedFields(bay);
    await setDoc(doc(db, 'bays', bay.id), cleaned);
  },

  updateBay: async (bayId: string, fields: Partial<Omit<Bay, 'id'>>): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const cleaned = removeUndefinedFields({ ...fields, updatedAt: Date.now() });
    await updateDoc(doc(db, 'bays', bayId), cleaned);
  },

  deleteBay: async (bayId: string): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    // Soft-delete: set isActive = false
    await updateDoc(doc(db, 'bays', bayId), {
      isActive: false,
      updatedAt: Date.now(),
    });
  },

  // --- BayPriceRule Operations ---

  getBayPriceRules: async (branchId?: string): Promise<BayPriceRule[]> => {
    if (!db) return [];
    try {
      let q;
      if (branchId) {
        q = query(collection(db, 'bay_price_rules'), where('branchId', '==', branchId));
      } else {
        q = query(collection(db, 'bay_price_rules'));
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as BayPriceRule);
    } catch (e) {
      console.error('Failed to fetch bay price rules:', e);
      return [];
    }
  },

  saveBayPriceRule: async (rule: BayPriceRule): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const cleaned = removeUndefinedFields(rule);
    await setDoc(doc(db, 'bay_price_rules', rule.id), cleaned);
  },

  deleteBayPriceRule: async (ruleId: string): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    // Soft-delete: set isActive = false
    await updateDoc(doc(db, 'bay_price_rules', ruleId), {
      isActive: false,
      updatedAt: Date.now(),
    });
  },

  // --- BayReservation Operations ---

  getBayReservationsByBranch: async (
    branchId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<BayReservation[]> => {
    if (!db) return [];
    try {
      let q = query(
        collection(db, 'bay_reservations'),
        where('branchId', '==', branchId)
      );
      const snap = await getDocs(q);
      let results = snap.docs.map((d) => d.data() as BayReservation);
      if (dateFrom) {
        results = results.filter((r) => r.startTime >= dateFrom);
      }
      if (dateTo) {
        // dateTo is a date string "YYYY-MM-DD", include whole day
        results = results.filter((r) => r.startTime <= dateTo + 'T23:59:59');
      }
      return results;
    } catch (e) {
      console.error('Failed to fetch bay reservations by branch:', e);
      return [];
    }
  },

  getBayReservationsByClient: async (
    clientId: string
  ): Promise<BayReservation[]> => {
    if (!db) return [];
    try {
      const q = query(
        collection(db, 'bay_reservations'),
        where('clientId', '==', clientId)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as BayReservation);
    } catch (e) {
      console.error('Failed to fetch bay reservations by client:', e);
      return [];
    }
  },

  saveBayReservation: async (reservation: BayReservation): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const cleaned = removeUndefinedFields(reservation);
    await setDoc(doc(db, 'bay_reservations', reservation.id), cleaned);
  },

  updateBayReservation: async (
    reservationId: string,
    fields: Partial<BayReservation>
  ): Promise<void> => {
    if (!db) throw new Error('Firebase not initialized');
    const cleaned = removeUndefinedFields({ ...fields, updatedAt: Date.now() });
    await updateDoc(doc(db, 'bay_reservations', reservationId), cleaned);
  },
};
