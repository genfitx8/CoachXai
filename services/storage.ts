
import { Lesson, ClientProfile, Homework, HomeworkTemplate, NotificationMessage, GolfCourse, CoachProfile, LessonReservation, CalendarIntegration, Branch, BranchAdminAccount, Bay, BayPriceRule, BayReservation, LessonPackage, TrainingProgram } from '../types';

const STORAGE_KEYS = {
  LESSONS: 'swingnote_lessons',
  CLIENTS: 'swingnote_clients',
  HOMEWORK: 'swingnote_homework',
  HOMEWORK_TEMPLATES: 'swingnote_homework_templates',
  NOTIFICATIONS: 'swingnote_notifications',
  GOLF_COURSES: 'swingnote_golf_courses',
  COACH_PROFILE: 'swingnote_coach_profile',
  RESERVATIONS: 'swingnote_reservations',
  CALENDAR_INTEGRATIONS: 'swingnote_calendar_integrations',
  BRANCHES: 'swingnote_branches',
  BRANCH_ADMIN_ACCOUNTS: 'swingnote_branch_admin_accounts',
  BAYS: 'swingnote_bays',
  BAY_PRICE_RULES: 'swingnote_bay_price_rules',
  BAY_RESERVATIONS: 'swingnote_bay_reservations',
  LESSON_PACKAGES: 'swingnote_lesson_packages',
  TRAINING_PROGRAMS: 'swingnote_training_programs',
};

export const storageService = {
  saveLessons: (lessons: Lesson[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.LESSONS, JSON.stringify(lessons));
    } catch (e) {
      console.error('Failed to save lessons', e);
    }
  },

  getLessons: (): Lesson[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LESSONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load lessons', e);
      return [];
    }
  },

  saveClients: (clients: ClientProfile[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    } catch (e) {
      console.error('Failed to save clients', e);
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
      console.error('Failed to load clients', e);
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
      console.error('Failed to save coach', e);
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
    } catch (e) { console.error(e); }
  },

  // Added: Batch save for homework
  saveHomeworkBatch: (newHomeworkList: Homework[]) => {
    try {
      const existing = storageService.getHomework();
      // Filter out potential duplicates if IDs clash, though unlikely with UUIDs
      const updated = [...existing, ...newHomeworkList];
      localStorage.setItem(STORAGE_KEYS.HOMEWORK, JSON.stringify(updated));
    } catch (e) { console.error(e); }
  },

  // Added: Update status
  updateHomeworkStatus: (id: string, isCompleted: boolean) => {
    try {
      const all = storageService.getHomework();
      const updated = all.map(h => h.id === id ? { ...h, isCompleted } : h);
      localStorage.setItem(STORAGE_KEYS.HOMEWORK, JSON.stringify(updated));
    } catch (e) { console.error(e); }
  },

  // Added: Delete
  deleteHomework: (id: string) => {
    try {
      const all = storageService.getHomework();
      const updated = all.filter(h => h.id !== id);
      localStorage.setItem(STORAGE_KEYS.HOMEWORK, JSON.stringify(updated));
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
  },

  updateNotification: (id: string, changes: Partial<NotificationMessage>) => {
    try {
      const all = storageService.getNotifications();
      const updated = all.map((n) => (n.id === id ? { ...n, ...changes } : n));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
  },

  deleteGolfCourse: (id: string) => {
    try {
      const courses = storageService.getGolfCourses();
      const updated = courses.filter(c => c.id !== id);
      localStorage.setItem(STORAGE_KEYS.GOLF_COURSES, JSON.stringify(updated));
    } catch (e) { console.error(e); }
  },

  // --- Reservation Methods ---

  getReservations: (): LessonReservation[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RESERVATIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load reservations', e);
      return [];
    }
  },

  saveReservation: (reservation: LessonReservation): void => {
    try {
      const reservations = storageService.getReservations();
      const updated = [...reservations, reservation];
      localStorage.setItem(STORAGE_KEYS.RESERVATIONS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save reservation', e);
    }
  },

  updateReservation: (reservation: LessonReservation): void => {
    try {
      const reservations = storageService.getReservations();
      const updated = reservations.map(r => r.id === reservation.id ? reservation : r);
      localStorage.setItem(STORAGE_KEYS.RESERVATIONS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to update reservation', e);
    }
  },

  deleteReservation: (reservationId: string): void => {
    try {
      const reservations = storageService.getReservations();
      const updated = reservations.filter(r => r.id !== reservationId);
      localStorage.setItem(STORAGE_KEYS.RESERVATIONS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to delete reservation', e);
    }
  },

  clearAllData: () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error('Failed to clear data', e);
    }
  },

  // Calendar Integration Methods
  saveCalendarIntegration: (integration: CalendarIntegration) => {
    try {
      const integrations = storageService.getCalendarIntegrations();
      const idx = integrations.findIndex((i) => i.id === integration.id);
      let updated;
      if (idx >= 0) {
        updated = [...integrations];
        updated[idx] = integration;
      } else {
        updated = [...integrations, integration];
      }
      localStorage.setItem(
        STORAGE_KEYS.CALENDAR_INTEGRATIONS,
        JSON.stringify(updated)
      );
    } catch (e) {
      console.error('Failed to save calendar integration', e);
    }
  },

  getCalendarIntegrations: (): CalendarIntegration[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CALENDAR_INTEGRATIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load calendar integrations', e);
      return [];
    }
  },

  updateCalendarIntegration: (integration: CalendarIntegration) => {
    storageService.saveCalendarIntegration(integration);
  },

  deleteCalendarIntegration: (integrationId: string) => {
    try {
      const integrations = storageService.getCalendarIntegrations();
      const updated = integrations.filter((i) => i.id !== integrationId);
      localStorage.setItem(
        STORAGE_KEYS.CALENDAR_INTEGRATIONS,
        JSON.stringify(updated)
      );
    } catch (e) {
      console.error('Failed to delete calendar integration', e);
    }
  },

  // Branch Methods
  getBranches: (): Branch[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BRANCHES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load branches', e);
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
      console.error('Failed to save branch', e);
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
      console.error('Failed to update branch', e);
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
      console.error('Failed to delete branch', e);
    }
  },

  // BranchAdminAccount Methods
  getBranchAdminAccounts: (branchId?: string): BranchAdminAccount[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BRANCH_ADMIN_ACCOUNTS);
      const all: BranchAdminAccount[] = data ? JSON.parse(data) : [];
      return branchId ? all.filter((a) => a.branchId === branchId) : all;
    } catch (e) {
      console.error('Failed to load branch admin accounts', e);
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
      console.error('Failed to save branch admin account', e);
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
      console.error('Failed to delete branch admin account', e);
    }
  },

  // Bay Methods
  getBays: (branchId?: string): Bay[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAYS);
      const all: Bay[] = data ? JSON.parse(data) : [];
      return branchId ? all.filter((b) => b.branchId === branchId) : all;
    } catch (e) {
      console.error('Failed to load bays', e);
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
      console.error('Failed to save bay', e);
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
      console.error('Failed to update bay', e);
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
      console.error('Failed to delete bay', e);
    }
  },

  // BayPriceRule Methods
  getBayPriceRules: (branchId?: string): BayPriceRule[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAY_PRICE_RULES);
      const all: BayPriceRule[] = data ? JSON.parse(data) : [];
      return branchId ? all.filter((r) => r.branchId === branchId) : all;
    } catch (e) {
      console.error('Failed to load bay price rules', e);
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
      console.error('Failed to save bay price rule', e);
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
      console.error('Failed to delete bay price rule', e);
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
      console.error('Failed to load bay reservations by branch', e);
      return [];
    }
  },

  getBayReservationsByClient: (clientId: string): BayReservation[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BAY_RESERVATIONS);
      const all: BayReservation[] = data ? JSON.parse(data) : [];
      return all.filter((r) => r.clientId === clientId);
    } catch (e) {
      console.error('Failed to load bay reservations by client', e);
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
      console.error('Failed to save bay reservation', e);
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
      console.error('Failed to update bay reservation', e);
    }
  },

  // ── Lesson Package Methods ──────────────────────────────────────────────────

  getLessonPackages: (): LessonPackage[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LESSON_PACKAGES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load lesson packages', e);
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
      console.error('Failed to save lesson package', e);
    }
  },

  deleteLessonPackage: (packageId: string): void => {
    try {
      const all = storageService.getLessonPackages();
      localStorage.setItem(STORAGE_KEYS.LESSON_PACKAGES, JSON.stringify(all.filter((p) => p.id !== packageId)));
    } catch (e) {
      console.error('Failed to delete lesson package', e);
    }
  },

  // ── Training Program Methods ────────────────────────────────────────────────

  getTrainingPrograms: (): TrainingProgram[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRAINING_PROGRAMS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load training programs', e);
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
      console.error('Failed to save training program', e);
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
      console.error('Failed to delete training program', e);
    }
  },
};
