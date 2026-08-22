import { Lesson, ClientProfile, Homework, HomeworkTemplate, NotificationMessage, GolfCourse, CoachProfile, LessonReservation, Branch, BranchAdminAccount, Bay, BayPriceRule, BayReservation, LessonPackage, TrainingProgram, QuickLogEntry, WeeklyInsight, HandoverSummary, PromptTemplate, PromptTarget, PromptAttachment, CoachStyleExemplar, AiCallLog, StudentContext } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('storage');

const STORAGE_KEYS = {
  LESSONS: 'swingnote_lessons',
  CLIENTS: 'swingnote_clients',
  HOMEWORK: 'swingnote_homework',
  HOMEWORK_TEMPLATES: 'swingnote_homework_templates',
  NOTIFICATIONS: 'swingnote_notifications',
  GOLF_COURSES: 'swingnote_golf_courses',
  COACH_PROFILE: 'swingnote_coach_profile',
  RESERVATIONS: 'swingnote_reservations',
  BRANCHES: 'swingnote_branches',
  BRANCH_ADMIN_ACCOUNTS: 'swingnote_branch_admin_accounts',
  BAYS: 'swingnote_bays',
  BAY_PRICE_RULES: 'swingnote_bay_price_rules',
  BAY_RESERVATIONS: 'swingnote_bay_reservations',
  LESSON_PACKAGES: 'swingnote_lesson_packages',
  TRAINING_PROGRAMS: 'swingnote_training_programs',
  QUICK_LOGS: 'swingnote_quick_logs',
  WEEKLY_INSIGHTS: 'swingnote_weekly_insights',
  HANDOVER_SUMMARIES: 'coachxai_handover_summaries',
  PROMPT_TEMPLATES: 'swingnote_prompt_templates',
  COACH_STYLE_EXEMPLARS: 'coachxai_style_exemplars',
  AI_CALL_LOGS: 'coachxai_ai_call_logs',
  STUDENT_CONTEXTS: 'coachxai_student_contexts',
  CACHE_OWNER: 'coachxai_cache_owner',
};

// Rolling cap so the localStorage bucket doesn't grow without bound. Firestore
// mode has no such limit — the whole collection is kept there. 1000 records
// covers roughly a week of heavy solo-coach usage.
const AI_CALL_LOGS_LOCAL_CAP = 1000;

/**
 * Keys holding data that belongs to ONE signed-in account. Everything here is
 * wiped when a different account signs in on the same device (see
 * `applyCacheOwner`). Facility-level data that is not tied to a single login
 * (branches, bays, price rules, golf courses) deliberately stays out.
 */
const USER_SCOPED_KEYS: string[] = [
  STORAGE_KEYS.LESSONS,
  STORAGE_KEYS.CLIENTS,
  STORAGE_KEYS.HOMEWORK,
  STORAGE_KEYS.HOMEWORK_TEMPLATES,
  STORAGE_KEYS.NOTIFICATIONS,
  STORAGE_KEYS.COACH_PROFILE,
  STORAGE_KEYS.RESERVATIONS,
  STORAGE_KEYS.BAY_RESERVATIONS,
  STORAGE_KEYS.LESSON_PACKAGES,
  STORAGE_KEYS.TRAINING_PROGRAMS,
  STORAGE_KEYS.QUICK_LOGS,
  STORAGE_KEYS.WEEKLY_INSIGHTS,
  STORAGE_KEYS.HANDOVER_SUMMARIES,
  STORAGE_KEYS.COACH_STYLE_EXEMPLARS,
  STORAGE_KEYS.AI_CALL_LOGS,
  STORAGE_KEYS.STUDENT_CONTEXTS,
];

export const storageService = {
  /**
   * Who the localStorage cache currently belongs to, e.g. `COACH:<id>`.
   * Null when the device has never been claimed (fresh install, or a cache
   * written before this scoping existed).
   */
  getCacheOwner: (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEYS.CACHE_OWNER);
    } catch (e) {
      log.error('Failed to read cache owner', e);
      return null;
    }
  },

  /**
   * Claim the local cache for `ownerKey`, wiping every per-account bucket
   * when the device was last used by somebody else.
   *
   * Why this exists: the cache keys are device-global and the app falls back
   * to them whenever the API is unreachable. Without an owner stamp, a second
   * account signing in on the same phone/PC gets served the previous
   * account's lessons and members — records the signed-in user never saved.
   *
   * An *unstamped* device (every install from before this stamp existed) is
   * ambiguous: the cache may be this account's own offline data or the last
   * user's. `unstampedBelongsToOwner` lets the caller resolve that from
   * whatever identity it can still see — e.g. the cached coach profile id.
   * When it can't, the cache is dropped: re-fetching from the server costs a
   * round trip, showing someone else's records costs trust.
   *
   * @returns true when foreign data was found and cleared.
   */
  applyCacheOwner: (ownerKey: string, unstampedBelongsToOwner = false): boolean => {
    if (!ownerKey) return false;
    try {
      const previous = localStorage.getItem(STORAGE_KEYS.CACHE_OWNER);
      if (previous === ownerKey) return false;
      const isForeign = previous !== null || !unstampedBelongsToOwner;
      if (isForeign) {
        storageService.clearUserScopedData();
      }
      localStorage.setItem(STORAGE_KEYS.CACHE_OWNER, ownerKey);
      return isForeign;
    } catch (e) {
      log.error('Failed to apply cache owner', e);
      return false;
    }
  },

  /** Drop every per-account cache bucket, keeping facility/config data. */
  clearUserScopedData: () => {
    try {
      for (const key of USER_SCOPED_KEYS) {
        localStorage.removeItem(key);
      }
    } catch (e) {
      log.error('Failed to clear user-scoped data', e);
    }
  },

  saveLessons: (lessons: Lesson[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.LESSONS, JSON.stringify(lessons));
    } catch (e) {
      log.error('Failed to save lessons', e);
    }
  },

  getLessons: (): Lesson[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LESSONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load lessons', e);
      return [];
    }
  },

  saveClients: (clients: ClientProfile[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    } catch (e) {
      log.error('Failed to save clients', e);
    }
  },

  getClients: (): ClientProfile[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        return parsed.map((name: string) => ({ name, phone: '0000' }));
      }
      return parsed;
    } catch (e) {
      log.error('Failed to load clients', e);
      return [];
    }
  },

  // Coach Methods
  getCoaches: (): CoachProfile[] => {
      try {
          // In local mode, we often only have one coach logged in/saved.
          // We can return that single profile as a list for Admin view.
          const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
          return data ? [JSON.parse(data)] : [];
      } catch (e) {
          return [];
      }
  },

  searchCoachesByName: (name: string): CoachProfile[] => {
      try {
          const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
          if (data) {
              const profile = JSON.parse(data);
              if (profile.name.toLowerCase().includes(name.toLowerCase())) return [profile];
          }
          return [];
      } catch { return []; }
  },

  getCoachById: (coachId: string): CoachProfile | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
      if (data) {
        const profile: CoachProfile = JSON.parse(data);
        if (profile.id === coachId) return profile;
      }
      return null;
    } catch { return null; }
  },

  saveCoach: (coach: CoachProfile): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.COACH_PROFILE, JSON.stringify(coach));
    } catch (e) {
      log.error('Failed to save coach', e);
    }
  },

  // Homework Methods
  getHomework: (): Homework[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HOMEWORK);
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  },

  saveHomework: (homeworkList: Homework[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.HOMEWORK, JSON.stringify(homeworkList));
    } catch (e) { log.error('storage operation failed', e); }
  },

  // Added: Batch save for homework
  saveHomeworkBatch: (newHomeworkList: Homework[]) => {
    try {
      const existing = storageService.getHomework();
      // Filter out potential duplicates if IDs clash, though unlikely with UUIDs
      const updated = [...existing, ...newHomeworkList];
      localStorage.setItem(STORAGE_KEYS.HOMEWORK, JSON.stringify(updated));
    } catch (e) { log.error('storage operation failed', e); }
  },

  // Added: Update status
  updateHomeworkStatus: (id: string, isCompleted: boolean) => {
    try {
      const all = storageService.getHomework();
      const updated = all.map(h => h.id === id ? { ...h, isCompleted } : h);
      localStorage.setItem(STORAGE_KEYS.HOMEWORK, JSON.stringify(updated));
    } catch (e) { log.error('storage operation failed', e); }
  },

  // Added: Delete
  deleteHomework: (id: string) => {
    try {
      const all = storageService.getHomework();
      const updated = all.filter(h => h.id !== id);
      localStorage.setItem(STORAGE_KEYS.HOMEWORK, JSON.stringify(updated));
    } catch (e) { log.error('storage operation failed', e); }
  },

  getHomeworkTemplates: (): HomeworkTemplate[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HOMEWORK_TEMPLATES);
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  },

  saveHomeworkTemplates: (templates: HomeworkTemplate[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.HOMEWORK_TEMPLATES, JSON.stringify(templates));
    } catch (e) { log.error('storage operation failed', e); }
  },

  // Notification Methods
  getNotifications: (): NotificationMessage[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  },

  saveNotification: (notification: NotificationMessage) => {
    try {
      const all = storageService.getNotifications();
      const updated = [notification, ...all];
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
    } catch (e) { log.error('storage operation failed', e); }
  },

  updateNotification: (id: string, changes: Partial<NotificationMessage>) => {
    try {
      const all = storageService.getNotifications();
      const updated = all.map((n) => (n.id === id ? { ...n, ...changes } : n));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
    } catch (e) { log.error('storage operation failed', e); }
  },

  // Golf Course Methods
  getGolfCourses: (): GolfCourse[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GOLF_COURSES);
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  },

  saveGolfCourse: (course: GolfCourse) => {
    try {
      const courses = storageService.getGolfCourses();
      // Update if exists, else add
      const idx = courses.findIndex(c => c.id === course.id);
      let updated;
      if (idx >= 0) {
        updated = [...courses];
        updated[idx] = course;
      } else {
        updated = [...courses, course];
      }
      localStorage.setItem(STORAGE_KEYS.GOLF_COURSES, JSON.stringify(updated));
    } catch (e) { log.error('storage operation failed', e); }
  },

  deleteGolfCourse: (id: string) => {
    try {
      const courses = storageService.getGolfCourses();
      const updated = courses.filter(c => c.id !== id);
      localStorage.setItem(STORAGE_KEYS.GOLF_COURSES, JSON.stringify(updated));
    } catch (e) { log.error('storage operation failed', e); }
  },

  // --- Reservation Methods ---

  getReservations: (): LessonReservation[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RESERVATIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load reservations', e);
      return [];
    }
  },

  saveReservation: (reservation: LessonReservation): void => {
    try {
      const reservations = storageService.getReservations();
      const updated = [...reservations, reservation];
      localStorage.setItem(STORAGE_KEYS.RESERVATIONS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save reservation', e);
    }
  },

  updateReservation: (reservation: LessonReservation): void => {
    try {
      const reservations = storageService.getReservations();
      const updated = reservations.map(r => r.id === reservation.id ? reservation : r);
      localStorage.setItem(STORAGE_KEYS.RESERVATIONS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to update reservation', e);
    }
  },

  deleteReservation: (reservationId: string): void => {
    try {
      const reservations = storageService.getReservations();
      const updated = reservations.filter(r => r.id !== reservationId);
      localStorage.setItem(STORAGE_KEYS.RESERVATIONS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to delete reservation', e);
    }
  },

  clearAllData: () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      log.error('Failed to clear data', e);
    }
  },

  // Branch Methods
  getBranches: (): Branch[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BRANCHES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load branches', e);
      return [];
    }
  },

  saveBranch: (branch: Branch) => {
    try {
      const branches = storageService.getBranches();
      const idx = branches.findIndex((b) => b.id === branch.id);
      let updated;
      if (idx >= 0) {
        updated = [...branches];
        updated[idx] = branch;
      } else {
        updated = [...branches, branch];
      }
      localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save branch', e);
    }
  },

  updateBranch: (branchId: string, fields: Partial<Omit<Branch, 'id'>>) => {
    try {
      const branches = storageService.getBranches();
      const updated = branches.map((b) =>
        b.id === branchId ? { ...b, ...fields, updatedAt: Date.now() } : b
      );
      localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to update branch', e);
    }
  },

  deleteBranch: (branchId: string) => {
    try {
      const branches = storageService.getBranches();
      // Soft-delete: set isActive = false
      const updated = branches.map((b) =>
        b.id === branchId ? { ...b, isActive: false, updatedAt: Date.now() } : b
      );
      localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to delete branch', e);
    }
  },

  // BranchAdminAccount Methods
  getBranchAdminAccounts: (branchId?: string): BranchAdminAccount[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BRANCH_ADMIN_ACCOUNTS);
      const all: BranchAdminAccount[] = data ? JSON.parse(data) : [];
      return branchId ? all.filter((a) => a.branchId === branchId) : all;
    } catch (e) {
      log.error('Failed to load branch admin accounts', e);
      return [];
    }
  },

  saveBranchAdminAccount: (account: BranchAdminAccount) => {
    try {
      const accounts = storageService.getBranchAdminAccounts();
      const idx = accounts.findIndex((a) => a.id === account.id);
      let updated;
      if (idx >= 0) {
        updated = [...accounts];
        updated[idx] = account;
      } else {
        updated = [...accounts, account];
      }
      localStorage.setItem(
        STORAGE_KEYS.BRANCH_ADMIN_ACCOUNTS,
        JSON.stringify(updated)
      );
    } catch (e) {
      log.error('Failed to save branch admin account', e);
    }
  },

  deleteBranchAdminAccount: (accountId: string) => {
    try {
      const accounts = storageService.getBranchAdminAccounts();
      // Soft-delete: set isActive = false
      const updated = accounts.map((a) =>
        a.id === accountId
          ? { ...a, isActive: false, updatedAt: Date.now() }
          : a
      );
      localStorage.setItem(
        STORAGE_KEYS.BRANCH_ADMIN_ACCOUNTS,
        JSON.stringify(updated)
      );
    } catch (e) {
      log.error('Failed to delete branch admin account', e);
    }
  },

  // Bay Methods
  getBays: (branchId?: string): Bay[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAYS);
      const all: Bay[] = data ? JSON.parse(data) : [];
      return branchId ? all.filter((b) => b.branchId === branchId) : all;
    } catch (e) {
      log.error('Failed to load bays', e);
      return [];
    }
  },

  saveBay: (bay: Bay): void => {
    try {
      const bays = storageService.getBays();
      const idx = bays.findIndex((b) => b.id === bay.id);
      let updated;
      if (idx >= 0) {
        updated = [...bays];
        updated[idx] = bay;
      } else {
        updated = [...bays, bay];
      }
      localStorage.setItem(STORAGE_KEYS.BAYS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save bay', e);
    }
  },

  updateBay: (bayId: string, fields: Partial<Omit<Bay, 'id'>>): void => {
    try {
      const bays = storageService.getBays();
      const updated = bays.map((b) =>
        b.id === bayId ? { ...b, ...fields, updatedAt: Date.now() } : b
      );
      localStorage.setItem(STORAGE_KEYS.BAYS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to update bay', e);
    }
  },

  deleteBay: (bayId: string): void => {
    try {
      const bays = storageService.getBays();
      // Soft-delete: set isActive = false
      const updated = bays.map((b) =>
        b.id === bayId ? { ...b, isActive: false, updatedAt: Date.now() } : b
      );
      localStorage.setItem(STORAGE_KEYS.BAYS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to delete bay', e);
    }
  },

  // BayPriceRule Methods
  getBayPriceRules: (branchId?: string): BayPriceRule[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAY_PRICE_RULES);
      const all: BayPriceRule[] = data ? JSON.parse(data) : [];
      return branchId ? all.filter((r) => r.branchId === branchId) : all;
    } catch (e) {
      log.error('Failed to load bay price rules', e);
      return [];
    }
  },

  saveBayPriceRule: (rule: BayPriceRule): void => {
    try {
      const rules = storageService.getBayPriceRules();
      const idx = rules.findIndex((r) => r.id === rule.id);
      let updated;
      if (idx >= 0) {
        updated = [...rules];
        updated[idx] = rule;
      } else {
        updated = [...rules, rule];
      }
      localStorage.setItem(STORAGE_KEYS.BAY_PRICE_RULES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save bay price rule', e);
    }
  },

  deleteBayPriceRule: (ruleId: string): void => {
    try {
      const rules = storageService.getBayPriceRules();
      // Soft-delete: set isActive = false
      const updated = rules.map((r) =>
        r.id === ruleId ? { ...r, isActive: false, updatedAt: Date.now() } : r
      );
      localStorage.setItem(STORAGE_KEYS.BAY_PRICE_RULES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to delete bay price rule', e);
    }
  },

  // BayReservation Methods
  getBayReservationsByBranch: (branchId: string, dateFrom?: string, dateTo?: string): BayReservation[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAY_RESERVATIONS);
      const all: BayReservation[] = data ? JSON.parse(data) : [];
      let results = all.filter((r) => r.branchId === branchId);
      if (dateFrom) {
        results = results.filter((r) => r.startTime >= dateFrom);
      }
      if (dateTo) {
        results = results.filter((r) => r.startTime <= dateTo + 'T23:59:59');
      }
      return results;
    } catch (e) {
      log.error('Failed to load bay reservations by branch', e);
      return [];
    }
  },

  getBayReservationsByClient: (clientId: string): BayReservation[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAY_RESERVATIONS);
      const all: BayReservation[] = data ? JSON.parse(data) : [];
      return all.filter((r) => r.clientId === clientId);
    } catch (e) {
      log.error('Failed to load bay reservations by client', e);
      return [];
    }
  },

  saveBayReservation: (reservation: BayReservation): void => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAY_RESERVATIONS);
      const all: BayReservation[] = data ? JSON.parse(data) : [];
      const idx = all.findIndex((r) => r.id === reservation.id);
      let updated;
      if (idx >= 0) {
        updated = [...all];
        updated[idx] = reservation;
      } else {
        updated = [...all, reservation];
      }
      localStorage.setItem(STORAGE_KEYS.BAY_RESERVATIONS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save bay reservation', e);
    }
  },

  updateBayReservation: (reservationId: string, fields: Partial<BayReservation>): void => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAY_RESERVATIONS);
      const all: BayReservation[] = data ? JSON.parse(data) : [];
      const updated = all.map((r) =>
        r.id === reservationId ? { ...r, ...fields, updatedAt: Date.now() } : r
      );
      localStorage.setItem(STORAGE_KEYS.BAY_RESERVATIONS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to update bay reservation', e);
    }
  },

  // ── Lesson Package Methods ──────────────────────────────────────────────────

  getLessonPackages: (): LessonPackage[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LESSON_PACKAGES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load lesson packages', e);
      return [];
    }
  },

  saveLessonPackage: (pkg: LessonPackage): void => {
    try {
      const all = storageService.getLessonPackages();
      const idx = all.findIndex((p) => p.id === pkg.id);
      const updated = idx >= 0 ? [...all.slice(0, idx), pkg, ...all.slice(idx + 1)] : [...all, pkg];
      localStorage.setItem(STORAGE_KEYS.LESSON_PACKAGES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save lesson package', e);
    }
  },

  deleteLessonPackage: (packageId: string): void => {
    try {
      const all = storageService.getLessonPackages();
      localStorage.setItem(STORAGE_KEYS.LESSON_PACKAGES, JSON.stringify(all.filter((p) => p.id !== packageId)));
    } catch (e) {
      log.error('Failed to delete lesson package', e);
    }
  },

  // ── Training Program Methods ────────────────────────────────────────────────

  getTrainingPrograms: (): TrainingProgram[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRAINING_PROGRAMS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load training programs', e);
      return [];
    }
  },

  saveTrainingProgram: (program: TrainingProgram): void => {
    try {
      const all = storageService.getTrainingPrograms();
      const idx = all.findIndex((p) => p.id === program.id);
      const updated = idx >= 0
        ? [...all.slice(0, idx), program, ...all.slice(idx + 1)]
        : [...all, program];
      localStorage.setItem(STORAGE_KEYS.TRAINING_PROGRAMS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save training program', e);
    }
  },

  deleteTrainingProgram: (programId: string): void => {
    try {
      const all = storageService.getTrainingPrograms();
      localStorage.setItem(
        STORAGE_KEYS.TRAINING_PROGRAMS,
        JSON.stringify(all.filter((p) => p.id !== programId))
      );
    } catch (e) {
      log.error('Failed to delete training program', e);
    }
  },

  // ── Quick Log Methods ───────────────────────────────────────────────────────

  getQuickLogs: (): QuickLogEntry[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.QUICK_LOGS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load quick logs', e);
      return [];
    }
  },

  saveQuickLog: (entry: QuickLogEntry): void => {
    try {
      const all = storageService.getQuickLogs();
      const idx = all.findIndex((q) => q.id === entry.id);
      const updated = idx >= 0
        ? [...all.slice(0, idx), entry, ...all.slice(idx + 1)]
        : [...all, entry];
      localStorage.setItem(STORAGE_KEYS.QUICK_LOGS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save quick log', e);
    }
  },

  getQuickLogsByClient: (clientId: string): QuickLogEntry[] => {
    return storageService.getQuickLogs().filter((q) => q.clientId === clientId);
  },

  deleteQuickLog: (logId: string): void => {
    try {
      const all = storageService.getQuickLogs();
      localStorage.setItem(STORAGE_KEYS.QUICK_LOGS, JSON.stringify(all.filter((q) => q.id !== logId)));
    } catch (e) {
      log.error('Failed to delete quick log', e);
    }
  },

  // ── Student Context Methods (local cache) ───────────────────────────────────

  getStudentContext: (clientId: string): StudentContext | null => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEYS.STUDENT_CONTEXTS}:${clientId}`);
      return raw ? (JSON.parse(raw) as StudentContext) : null;
    } catch (e) {
      log.error('Failed to load student context', e);
      return null;
    }
  },

  saveStudentContext: (ctx: StudentContext): void => {
    try {
      localStorage.setItem(
        `${STORAGE_KEYS.STUDENT_CONTEXTS}:${ctx.clientId}`,
        JSON.stringify(ctx)
      );
    } catch (e) {
      log.error('Failed to save student context', e);
    }
  },

  // ── Weekly Insight Methods ──────────────────────────────────────────────────

  getWeeklyInsights: (): WeeklyInsight[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WEEKLY_INSIGHTS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load weekly insights', e);
      return [];
    }
  },

  saveWeeklyInsight: (insight: WeeklyInsight): void => {
    try {
      const all = storageService.getWeeklyInsights();
      const idx = all.findIndex((w) => w.id === insight.id);
      const updated = idx >= 0
        ? [...all.slice(0, idx), insight, ...all.slice(idx + 1)]
        : [...all, insight];
      localStorage.setItem(STORAGE_KEYS.WEEKLY_INSIGHTS, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save weekly insight', e);
    }
  },

  getWeeklyInsightsByClient: (clientId: string): WeeklyInsight[] => {
    return storageService.getWeeklyInsights()
      .filter((w) => w.clientId === clientId)
      .sort((a, b) => b.generatedAt - a.generatedAt);
  },

  // ── 7a · Handover Summary Methods ─────────────────────────────────────────
  //
  // Local-storage backed only for now. When a proper server table lands, the
  // apiService will overlay these methods without changing call sites.

  getHandoverSummaries: (): HandoverSummary[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HANDOVER_SUMMARIES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load handover summaries', e);
      return [];
    }
  },

  saveHandoverSummary: (summary: HandoverSummary): void => {
    try {
      const all = storageService.getHandoverSummaries();
      const idx = all.findIndex((s) => s.id === summary.id);
      const updated = idx >= 0
        ? [...all.slice(0, idx), summary, ...all.slice(idx + 1)]
        : [...all, summary];
      localStorage.setItem(
        STORAGE_KEYS.HANDOVER_SUMMARIES,
        JSON.stringify(updated)
      );
    } catch (e) {
      log.error('Failed to save handover summary', e);
    }
  },

  getHandoverSummariesForCoach: (coachId: string): HandoverSummary[] => {
    return storageService
      .getHandoverSummaries()
      .filter((s) => s.toCoachId === coachId)
      .sort((a, b) => b.generatedAt - a.generatedAt);
  },

  markHandoverSummaryRead: (id: string): void => {
    try {
      const all = storageService.getHandoverSummaries();
      const idx = all.findIndex((s) => s.id === id);
      if (idx < 0) return;
      if (all[idx].readAt) return; // idempotent
      const updated: HandoverSummary[] = [
        ...all.slice(0, idx),
        { ...all[idx], readAt: Date.now() },
        ...all.slice(idx + 1),
      ];
      localStorage.setItem(
        STORAGE_KEYS.HANDOVER_SUMMARIES,
        JSON.stringify(updated)
      );
    } catch (e) {
      log.error('Failed to mark handover summary read', e);
    }
  },

  // ── Prompt Template Methods ─────────────────────────────────────────────────

  getPromptTemplates: (): PromptTemplate[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROMPT_TEMPLATES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to load prompt templates', e);
      return [];
    }
  },

  savePromptTemplate: (template: PromptTemplate): void => {
    try {
      const all = storageService.getPromptTemplates();
      // If marking this template active, deactivate siblings in the SAME
      // (target, coachId) scope. Global templates (coachId=undefined) and
      // coach-scoped templates live on separate layers and don't collide.
      let updated = all.map((t) =>
        t.id !== template.id &&
        t.target === template.target &&
        (t.coachId ?? null) === (template.coachId ?? null) &&
        template.isActive
          ? { ...t, isActive: false }
          : t
      );
      const idx = updated.findIndex((t) => t.id === template.id);
      if (idx >= 0) {
        updated[idx] = template;
      } else {
        updated = [...updated, template];
      }
      localStorage.setItem(STORAGE_KEYS.PROMPT_TEMPLATES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save prompt template', e);
    }
  },

  deletePromptTemplate: (templateId: string): void => {
    try {
      const all = storageService.getPromptTemplates();
      localStorage.setItem(
        STORAGE_KEYS.PROMPT_TEMPLATES,
        JSON.stringify(all.filter((t) => t.id !== templateId))
      );
    } catch (e) {
      log.error('Failed to delete prompt template', e);
    }
  },

  getActivePromptTemplate: (
    target: PromptTarget,
    coachId?: string
  ): PromptTemplate | null => {
    try {
      const all = storageService.getPromptTemplates();
      // Coach-scoped active first; if none, fall back to a global active one.
      if (coachId) {
        const coachScoped = all.find(
          (t) => t.target === target && t.coachId === coachId && t.isActive
        );
        if (coachScoped) return coachScoped;
      }
      return all.find((t) => t.target === target && !t.coachId && t.isActive) ?? null;
    } catch (e) {
      return null;
    }
  },

  /** Save an attachment record onto an existing prompt template. */
  savePromptAttachment: (attachment: PromptAttachment): void => {
    try {
      const all = storageService.getPromptTemplates();
      const updated = all.map((t) => {
        if (t.id !== attachment.promptId) return t;
        const existing = t.attachments.findIndex((a) => a.id === attachment.id);
        const newAttachments =
          existing >= 0
            ? t.attachments.map((a) => (a.id === attachment.id ? attachment : a))
            : [...t.attachments, attachment];
        return { ...t, attachments: newAttachments, updatedAt: Date.now() };
      });
      localStorage.setItem(STORAGE_KEYS.PROMPT_TEMPLATES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to save prompt attachment', e);
    }
  },

  deletePromptAttachment: (promptId: string, attachmentId: string): void => {
    try {
      const all = storageService.getPromptTemplates();
      const updated = all.map((t) => {
        if (t.id !== promptId) return t;
        return {
          ...t,
          attachments: t.attachments.filter((a) => a.id !== attachmentId),
          updatedAt: Date.now(),
        };
      });
      localStorage.setItem(STORAGE_KEYS.PROMPT_TEMPLATES, JSON.stringify(updated));
    } catch (e) {
      log.error('Failed to delete prompt attachment', e);
    }
  },

  // ── Coach Style Exemplar Methods (Phase C) ──────────────────────────────────

  getCoachStyleExemplars: (): CoachStyleExemplar[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.COACH_STYLE_EXEMPLARS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to read coach style exemplars', e);
      return [];
    }
  },

  saveCoachStyleExemplar: (exemplar: CoachStyleExemplar): void => {
    try {
      const all = storageService.getCoachStyleExemplars();
      const idx = all.findIndex((x) => x.id === exemplar.id);
      if (idx >= 0) all[idx] = exemplar;
      else all.push(exemplar);
      localStorage.setItem(
        STORAGE_KEYS.COACH_STYLE_EXEMPLARS,
        JSON.stringify(all)
      );
    } catch (e) {
      log.error('Failed to save coach style exemplar', e);
    }
  },

  deleteCoachStyleExemplar: (exemplarId: string): void => {
    try {
      const all = storageService.getCoachStyleExemplars();
      localStorage.setItem(
        STORAGE_KEYS.COACH_STYLE_EXEMPLARS,
        JSON.stringify(all.filter((x) => x.id !== exemplarId))
      );
    } catch (e) {
      log.error('Failed to delete coach style exemplar', e);
    }
  },

  // ── AI Call Log Methods (Observability) ────────────────────────────────────

  getAiCallLogs: (): AiCallLog[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_CALL_LOGS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      log.error('Failed to read AI call logs', e);
      return [];
    }
  },

  saveAiCallLog: (entry: AiCallLog): void => {
    try {
      const existing = storageService.getAiCallLogs();
      // Newest first; drop the tail when we exceed the rolling cap so a busy
      // coach doesn't blow past the localStorage quota.
      const next = [entry, ...existing].slice(0, AI_CALL_LOGS_LOCAL_CAP);
      localStorage.setItem(STORAGE_KEYS.AI_CALL_LOGS, JSON.stringify(next));
    } catch (e) {
      log.error('Failed to save AI call log', e);
    }
  },

  clearAiCallLogs: (): void => {
    try {
      localStorage.removeItem(STORAGE_KEYS.AI_CALL_LOGS);
    } catch (e) {
      log.error('Failed to clear AI call logs', e);
    }
  },
};
