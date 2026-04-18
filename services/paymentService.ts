
import { CoachProfile, ClientProfile } from '../types';

export const paymentService = {
  /**
   * Simulates a payment process.
   * Returns true if payment is successful.
   */
  processPayment: async (role: 'COACH' | 'CLIENT'): Promise<boolean> => {
    return new Promise((resolve) => {
      // Simulate network delay
      setTimeout(() => {
        resolve(true);
      }, 2000);
    });
  },

  /**
   * Calculates the next billing date (1 month from now)
   */
  getNextBillingDate: (): string => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
  },

  getPricing: (role: 'COACH' | 'CLIENT') => {
    return role === 'COACH' 
      ? { price: 29900, name: '코치 프로 멤버십' }
      : { price: 4900, name: '골프 레슨 회원 멤버십' };
  }
};
