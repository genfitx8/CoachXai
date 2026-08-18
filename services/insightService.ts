import { WeeklyInsight, HandoverSummary } from '../types';
import { apiService } from './apiService';
import { firebaseService } from './firebase';
import { storageService } from './storage';
import { createLogger } from '../utils/logger';

const log = createLogger('insight');

/**
 * Weekly insights + handover summaries persistence facade
 * (docs/DATA_ARCHITECTURE.md Phase 1). Backend priority:
 * server API → Firebase (weekly insights only — handover never had a
 * Firestore path) → localStorage.
 */
const isApiMode = (): boolean => apiService.isAvailable() && !!apiService.getToken();

export const insightService = {
  async getWeeklyInsightsByClient(clientId: string): Promise<WeeklyInsight[]> {
    if (isApiMode()) {
      try {
        return await apiService.getWeeklyInsights(clientId);
      } catch (e) {
        log.warn('Server weekly-insight read failed, falling back to local:', e);
      }
    }
    if (firebaseService.isInitialized()) {
      return firebaseService.getWeeklyInsightsByClient(clientId);
    }
    return storageService.getWeeklyInsightsByClient(clientId);
  },

  async saveWeeklyInsight(insight: WeeklyInsight): Promise<void> {
    if (isApiMode()) {
      await apiService.saveWeeklyInsight(insight);
      return;
    }
    if (firebaseService.isInitialized()) {
      await firebaseService.saveWeeklyInsight(insight);
      return;
    }
    storageService.saveWeeklyInsight(insight);
  },

  async getHandoverSummariesForCoach(coachId: string): Promise<HandoverSummary[]> {
    if (isApiMode()) {
      try {
        // Server scopes by token: involved coach sees their summaries.
        const all = await apiService.getHandoverSummaries();
        return all.filter((s) => s.toCoachId === coachId || s.fromCoachId === coachId);
      } catch (e) {
        log.warn('Server handover read failed, falling back to local:', e);
      }
    }
    return storageService.getHandoverSummariesForCoach(coachId);
  },

  async saveHandoverSummary(summary: HandoverSummary): Promise<void> {
    if (isApiMode()) {
      await apiService.saveHandoverSummary(summary);
      return;
    }
    storageService.saveHandoverSummary(summary);
  },

  /** Stamp readAt so a dismissed handover briefing stays dismissed. */
  async markHandoverSummaryRead(summary: HandoverSummary): Promise<void> {
    if (isApiMode()) {
      try {
        await apiService.saveHandoverSummary({ ...summary, readAt: Date.now() });
        return;
      } catch (e) {
        log.warn('Server handover read-stamp failed, stamping locally:', e);
      }
    }
    storageService.markHandoverSummaryRead(summary.id);
  },
};
