
import { PointTransaction, ClientProfile } from '../types';
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
      clientId: `${client.name}_${client.phone}`,
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
      const clientId = `${client.name}_${client.phone}`;
      return await firebaseService.getPointTransactions(clientId);
    } else {
      return pointService.getLocalHistory().filter(
        t => t.clientId === `${client.name}_${client.phone}`
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
  }
};
