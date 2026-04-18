
import { PointTransaction, ClientProfile, CoachProfile } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';

const POINT_RULES = {
  HOMEWORK_COMPLETION: 50,
  LESSON_RECORDING: 100,
  ATTENDANCE: 10,
};

const STORAGE_KEYS = {
  POINTS: 'swingnote_points_history'
};

/** Builds the composite client ID used across the points system. */
const buildClientId = (client: ClientProfile): string =>
  `${client.name}_${client.phone}`;

/** Builds the composite ID for a coach used across the points system. */
const buildCoachId = (coach: CoachProfile): string =>
  `coach_${coach.id}`;

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
