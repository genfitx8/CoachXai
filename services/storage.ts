
import { Lesson, ClientProfile, Homework, HomeworkTemplate, NotificationMessage, GolfCourse, CoachProfile, LessonReservation } from '../types';

const STORAGE_KEYS = {
  LESSONS: 'swingnote_lessons',
  CLIENTS: 'swingnote_clients',
  HOMEWORK: 'swingnote_homework',
  HOMEWORK_TEMPLATES: 'swingnote_homework_templates',
  NOTIFICATIONS: 'swingnote_notifications',
  GOLF_COURSES: 'swingnote_golf_courses',
  COACH_PROFILE: 'swingnote_coach_profile',
  RESERVATIONS: 'swingnote_reservations'
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
  }
};
