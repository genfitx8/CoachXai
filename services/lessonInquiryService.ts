/**
 * lessonInquiryService.ts
 *
 * Handles creation and retrieval of lesson inquiries sent from members to coaches.
 *
 * Persistence strategy:
 *   - Firebase mode  → 'lesson_inquiries' Firestore collection (via firebaseService)
 *   - Offline mode   → 'swingnote_lesson_inquiries' localStorage key
 *
 * The service is intentionally thin so it can be swapped to a real REST API
 * by replacing the persistence helpers below.
 */

import { firebaseService } from './firebase';
import { LessonInquiry } from '../types';

const LOCAL_STORAGE_KEY = 'swingnote_lesson_inquiries';

// ─── Service class ────────────────────────────────────────────────────────────

class LessonInquiryService {
  /** Submit a new lesson inquiry. */
  async createInquiry(
    inquiry: Omit<LessonInquiry, 'id' | 'status' | 'createdAt' | 'updatedAt'>
  ): Promise<LessonInquiry> {
    const now = Date.now();
    const full: LessonInquiry = {
      ...inquiry,
      id: crypto.randomUUID(),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    if (firebaseService.isInitialized()) {
      await firebaseService.saveLessonInquiry(full);
    } else {
      this._saveToStorage(full);
    }

    return full;
  }

  /** Retrieve all inquiries submitted by a specific client. */
  async getInquiriesByClient(clientId: string): Promise<LessonInquiry[]> {
    if (firebaseService.isInitialized()) {
      return firebaseService.getLessonInquiriesByClient(clientId);
    }
    return this._loadFromStorageByClient(clientId);
  }

  /** Retrieve all inquiries directed to a specific coach. */
  async getInquiriesByCoach(coachId: string): Promise<LessonInquiry[]> {
    if (firebaseService.isInitialized()) {
      return firebaseService.getLessonInquiriesByCoach(coachId);
    }
    return this._loadFromStorageByCoach(coachId);
  }

  // ─── LocalStorage helpers ──────────────────────────────────────────────────

  private _readFromStorage(): LessonInquiry[] {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LessonInquiry[]) : [];
    } catch {
      return [];
    }
  }

  private _writeToStorage(inquiries: LessonInquiry[]): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(inquiries));
  }

  private _saveToStorage(inquiry: LessonInquiry): void {
    const existing = this._readFromStorage();
    this._writeToStorage([inquiry, ...existing]);
  }

  private _loadFromStorageByClient(clientId: string): LessonInquiry[] {
    return this._readFromStorage()
      .filter((i) => i.clientId === clientId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private _loadFromStorageByCoach(coachId: string): LessonInquiry[] {
    return this._readFromStorage()
      .filter((i) => i.coachId === coachId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}

export const lessonInquiryService = new LessonInquiryService();
