import { Homework } from '../types';
import { apiService } from './apiService';
import { firebaseService } from './firebase';
import { storageService } from './storage';
import { createLogger } from '../utils/logger';

const log = createLogger('homework');

const HOMEWORK_SYNC_FLAG = 'swingnote_homework_synced_v1';

/**
 * Homework persistence facade (docs/DATA_ARCHITECTURE.md Phase 1).
 *
 * Components used to talk to firebaseService/storageService directly; this
 * service is now the single choke point so the backend can switch by
 * priority: server API → Firebase (legacy) → localStorage (cache/offline).
 */
class HomeworkService {
  private isApiMode(): boolean {
    return apiService.isAvailable() && !!apiService.getToken();
  }

  private isFirebaseMode(): boolean {
    return firebaseService.isInitialized();
  }

  /**
   * One-time promotion of homework this device accumulated while it was
   * localStorage-only. Same pattern as reservationService: id-keyed upserts
   * make re-runs harmless; rows the current account can't write are skipped
   * and sync when their owner logs in.
   */
  private localSyncPromise: Promise<void> | null = null;

  private syncLocalHomeworkOnce(): Promise<void> {
    if (!this.localSyncPromise) {
      this.localSyncPromise = this.uploadLocalHomework().catch((e) => {
        log.warn('Local homework sync failed; will retry on next read:', e);
        this.localSyncPromise = null;
      });
    }
    return this.localSyncPromise;
  }

  private async uploadLocalHomework(): Promise<void> {
    const token = apiService.getToken() ?? '';
    try {
      if (localStorage.getItem(HOMEWORK_SYNC_FLAG) === token) return;
    } catch {
      return;
    }
    const locals = storageService.getHomework().filter((h) => h.id && h.clientId);
    let transientFailure = false;
    // Upload one-by-one so a single unauthorized row (another account's data
    // on a shared device) doesn't block the rest of the batch.
    for (const h of locals) {
      try {
        await apiService.saveHomeworkBatch([h]);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === undefined || status === 0 || status >= 500) transientFailure = true;
        log.warn(`Skipping local homework ${h.id} during sync:`, e);
      }
    }
    if (transientFailure) throw new Error('transient homework sync failure');
    try {
      localStorage.setItem(HOMEWORK_SYNC_FLAG, token);
    } catch { /* ignore */ }
  }

  /** Homework for one student (both roles use this; server scopes access). */
  async listByClient(clientId: string): Promise<Homework[]> {
    if (this.isApiMode()) {
      await this.syncLocalHomeworkOnce();
      return apiService.getHomework(clientId);
    }
    if (this.isFirebaseMode()) {
      return firebaseService.getHomework(clientId);
    }
    return storageService.getHomework().filter((h) => h.clientId === clientId);
  }

  async add(homework: Homework): Promise<void> {
    if (this.isApiMode()) {
      await apiService.saveHomeworkBatch([homework]);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.saveHomework(homework);
      return;
    }
    const all = storageService.getHomework();
    storageService.saveHomework([...all, homework]);
  }

  async addBatch(batch: Homework[]): Promise<void> {
    if (batch.length === 0) return;
    if (this.isApiMode()) {
      await apiService.saveHomeworkBatch(batch);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.saveHomeworkBatch(batch);
      return;
    }
    storageService.saveHomeworkBatch(batch);
  }

  async setCompleted(homeworkId: string, isCompleted: boolean): Promise<void> {
    if (this.isApiMode()) {
      await apiService.updateHomeworkStatus(homeworkId, isCompleted);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.updateHomeworkStatus(homeworkId, isCompleted);
      return;
    }
    storageService.updateHomeworkStatus(homeworkId, isCompleted);
  }

  async remove(homeworkId: string): Promise<void> {
    if (this.isApiMode()) {
      await apiService.deleteHomework(homeworkId);
      return;
    }
    if (this.isFirebaseMode()) {
      await firebaseService.deleteHomework(homeworkId);
      return;
    }
    storageService.deleteHomework(homeworkId);
  }
}

export const homeworkService = new HomeworkService();
