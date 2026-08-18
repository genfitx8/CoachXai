
import { PointTransaction, ClientProfile, CoachProfile } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';
import { apiService } from './apiService';
import { createLogger } from '../utils/logger';

const log = createLogger('points');

const POINT_RULES = {
  HOMEWORK_COMPLETION: 50,
  LESSON_RECORDING: 100,
  ATTENDANCE: 10,
};

const STORAGE_KEYS = {
  POINTS: 'swingnote_points_history'
};

const POINTS_SYNC_FLAG = 'swingnote_points_synced_v1';

/** Builds the composite client ID used across the points system. */
const buildClientId = (client: ClientProfile): string =>
  `${client.name}_${client.phone}`;

/** Builds the composite ID for a coach used across the points system. */
const buildCoachId = (coach: CoachProfile): string =>
  `coach_${coach.id}`;

/**
 * Server-ledger mode (docs/DATA_ARCHITECTURE.md Phase 1): with a server
 * session, point_transactions in Postgres is the ledger and current_points
 * is a server-maintained derived balance.
 */
const isApiMode = (): boolean =>
  apiService.isAvailable() && !!apiService.getToken();

/**
 * One-time audit backfill of this device's local point history. Balances
 * are NOT re-applied server-side — they already reached profiles through
 * profile sync, so importing is history-only by design.
 */
let pointsSyncPromise: Promise<void> | null = null;
const syncLocalHistoryOnce = (client: ClientProfile): Promise<void> => {
  if (!pointsSyncPromise) {
    pointsSyncPromise = (async () => {
      const token = apiService.getToken() ?? '';
      try {
        if (localStorage.getItem(POINTS_SYNC_FLAG) === token) return;
      } catch {
        return;
      }
      const own = new Set([buildClientId(client), client.id]);
      const locals = pointService
        .getLocalHistory()
        .filter((t) => t.id && own.has(t.clientId));
      await apiService.importPointTransactions(locals);
      try {
        localStorage.setItem(POINTS_SYNC_FLAG, token);
      } catch { /* ignore */ }
    })().catch((e) => {
      log.warn('Local point history sync failed; will retry on next read:', e);
      pointsSyncPromise = null;
    });
  }
  return pointsSyncPromise;
};

export const pointService = {
  getRules: () => POINT_RULES,

  /**
   * Adds a transaction and updates client balance.
   */
  addTransaction: async (
    client: ClientProfile,
    amount: number,
    type: PointTransaction['type'],
    description: string
  ): Promise<ClientProfile> => {
    if (isApiMode()) {
      // Top-ups were already credited server-side at payment-confirm time
      // (server pointCredit). Inserting here would double-credit — just
      // refresh the authoritative balance instead.
      if (type.startsWith('POINT_TOPUP')) {
        try {
          const profile = await apiService.getMyClientProfile();
          return { ...client, currentPoints: profile.currentPoints ?? 0 };
        } catch (e) {
          log.warn('Balance refresh after top-up failed:', e);
          return { ...client, currentPoints: (client.currentPoints || 0) + amount };
        }
      }

      const transaction: PointTransaction = {
        id: crypto.randomUUID(),
        clientId: buildClientId(client),
        amount,
        type,
        description,
        createdAt: Date.now(),
      };
      const { balance } = await apiService.addPointTransaction(transaction);
      return {
        ...client,
        currentPoints: balance ?? (client.currentPoints || 0) + amount,
      };
    }

    const transaction: PointTransaction = {
      id: crypto.randomUUID(),
      clientId: buildClientId(client),
      amount,
      type,
      description,
      createdAt: Date.now()
    };

    const newBalance = (client.currentPoints || 0) + amount;
    const updatedClient = { ...client, currentPoints: newBalance };

    // Persist
    if (firebaseService.isInitialized()) {
      await firebaseService.addPointTransaction(transaction);
      await firebaseService.saveClients([updatedClient]); // This updates the profile in DB
    } else {
      // Local Storage Fallback
      const history = pointService.getLocalHistory();
      localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify([transaction, ...history]));

      // Update client in local storage list
      const clients = storageService.getClients();
      const updatedList = clients.map(c =>
        (c.name === client.name && c.phone === client.phone) ? updatedClient : c
      );
      storageService.saveClients(updatedList);
    }

    return updatedClient;
  },

  getHistory: async (client: ClientProfile): Promise<PointTransaction[]> => {
    if (isApiMode()) {
      await syncLocalHistoryOnce(client);
      const all = await apiService.getPointTransactions();
      const own = new Set([buildClientId(client), client.id]);
      return all
        .filter((t) => own.has(t.clientId))
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    if (firebaseService.isInitialized()) {
      return await firebaseService.getPointTransactions(buildClientId(client));
    } else {
      return pointService.getLocalHistory().filter(
        t => t.clientId === buildClientId(client)
      );
    }
  },

  getLocalHistory: (): PointTransaction[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.POINTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  /**
   * Deduct (or credit) points on a coach's own balance — used by coach bay
   * bookings. API mode goes through the server ledger; legacy modes keep the
   * old behavior of writing the balance straight onto the coach profile.
   */
  spendCoachPoints: async (
    coach: CoachProfile,
    amount: number, // negative for spending
    description: string
  ): Promise<CoachProfile> => {
    if (isApiMode()) {
      const transaction: PointTransaction = {
        id: crypto.randomUUID(),
        clientId: buildCoachId(coach),
        amount,
        type: 'PURCHASE',
        description,
        createdAt: Date.now(),
      };
      const { balance } = await apiService.addPointTransaction(transaction);
      return {
        ...coach,
        currentPoints: balance ?? (coach.currentPoints || 0) + amount,
      };
    }

    const updatedCoach = {
      ...coach,
      currentPoints: (coach.currentPoints || 0) + amount,
    };
    if (firebaseService.isInitialized()) {
      await firebaseService.saveCoach(updatedCoach);
    } else {
      storageService.saveCoach(updatedCoach);
    }
    return updatedCoach;
  },

  /**
   * Grants points to a regular member by a branch admin.
   * Records the granting admin username and optional memo for audit.
   */
  grantPoints: async (
    client: ClientProfile,
    amount: number,
    grantedBy: string,
    memo?: string
  ): Promise<ClientProfile> => {
    const description = memo
      ? `지점관리자 지급: ${memo}`
      : '지점관리자 포인트 지급';

    const transaction: PointTransaction = {
      id: crypto.randomUUID(),
      clientId: buildClientId(client),
      amount,
      type: 'BRANCH_ADMIN_GRANT',
      description,
      grantedBy,
      recipientType: 'MEMBER',
      ...(memo ? { memo } : {}),
      createdAt: Date.now(),
    };

    // Branch admins now hold a server session after the Phase 1 auth work —
    // grants go through the ledger so history and balance live server-side.
    if (isApiMode()) {
      const { balance } = await apiService.addPointTransaction(transaction);
      return {
        ...client,
        currentPoints: balance ?? (client.currentPoints || 0) + amount,
      };
    }

    const newBalance = (client.currentPoints || 0) + amount;
    const updatedClient = { ...client, currentPoints: newBalance };

    if (firebaseService.isInitialized()) {
      await firebaseService.addPointTransaction(transaction);
      await firebaseService.saveClients([updatedClient]);
    } else {
      const history = pointService.getLocalHistory();
      localStorage.setItem(
        STORAGE_KEYS.POINTS,
        JSON.stringify([transaction, ...history])
      );
      const clients = storageService.getClients();
      const updatedList = clients.map((c) =>
        c.name === client.name && c.phone === client.phone ? updatedClient : c
      );
      storageService.saveClients(updatedList);
    }

    return updatedClient;
  },

  /**
   * Grants points to a coach member by a branch admin.
   * Records the granting admin username and optional memo for audit.
   */
  grantPointsToCoach: async (
    coach: CoachProfile,
    amount: number,
    grantedBy: string,
    memo?: string
  ): Promise<CoachProfile> => {
    const description = memo
      ? `지점관리자 지급: ${memo}`
      : '지점관리자 포인트 지급';

    const transaction: PointTransaction = {
      id: crypto.randomUUID(),
      clientId: buildCoachId(coach),
      amount,
      type: 'BRANCH_ADMIN_GRANT',
      description,
      grantedBy,
      recipientType: 'COACH',
      ...(memo ? { memo } : {}),
      createdAt: Date.now(),
    };

    if (isApiMode()) {
      const { balance } = await apiService.addPointTransaction(transaction);
      return {
        ...coach,
        currentPoints: balance ?? (coach.currentPoints || 0) + amount,
      };
    }

    const newBalance = (coach.currentPoints || 0) + amount;
    const updatedCoach = { ...coach, currentPoints: newBalance };

    if (firebaseService.isInitialized()) {
      await firebaseService.addPointTransaction(transaction);
      await firebaseService.saveCoach(updatedCoach);
    } else {
      const history = pointService.getLocalHistory();
      localStorage.setItem(
        STORAGE_KEYS.POINTS,
        JSON.stringify([transaction, ...history])
      );
      storageService.saveCoach(updatedCoach);
    }

    return updatedCoach;
  },
};
