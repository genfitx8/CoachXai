import { CoachProfile, ClientProfile } from '../types';
import { storageService } from './storage';
import { firebaseService } from './firebase';

const STORAGE_KEYS = {
  COACH_PROFILE: 'swingnote_coach_profile', // Database for coach accounts
  SESSION_ROLE: 'swingnote_session_role',
  SESSION_CLIENT_DATA: 'swingnote_session_client_data',
};

export const authService = {
  // Coach Authentication
  signupCoach: (
    name: string,
    email: string,
    password: string,
    phone: string
  ): Promise<CoachProfile> => {
    return new Promise(async (resolve, reject) => {
      try {
        // Simple validation
        if (!name || !email || !password || !phone) {
          reject('모든 필드를 입력해주세요.');
          return;
        }

        // Check if already exists - Firebase first, then local
        if (firebaseService.isInitialized()) {
          const coaches = await firebaseService.getCoaches();
          if (coaches.some((c) => c.email === email)) {
            reject('이미 가입된 이메일입니다.');
            return;
          }
        }

        // Check local storage
        const existingData = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
        if (existingData) {
          const profile = JSON.parse(existingData);
          if (profile.email === email) {
            reject('이미 가입된 이메일입니다.');
            return;
          }
        }

        const newProfile: CoachProfile = {
          id: crypto.randomUUID(),
          name,
          email,
          phone,
          password, // In a real app, never store plain text passwords!
          isSubscribed: false, // Default to false for new signups
        };

        // Save to Firebase if connected
        if (firebaseService.isInitialized()) {
          await firebaseService.saveCoach(newProfile);
        }

        // Also save to local storage
        localStorage.setItem(
          STORAGE_KEYS.COACH_PROFILE,
          JSON.stringify(newProfile)
        );
        resolve(newProfile);
      } catch (error) {
        console.error('Signup error:', error);
        reject('회원가입 중 오류가 발생했습니다.');
      }
    });
  },

  loginCoach: (email: string, password: string): Promise<CoachProfile> => {
    return new Promise(async (resolve, reject) => {
      try {
        let profile: CoachProfile | null = null;

        // Check Firebase first if connected
        if (firebaseService.isInitialized()) {
          const coaches = await firebaseService.getCoaches();
          profile =
            coaches.find((c) => c.email === email && c.password === password) ||
            null;

          // If found in Firebase, also save to localStorage for session restoration
          if (profile) {
            localStorage.setItem(
              STORAGE_KEYS.COACH_PROFILE,
              JSON.stringify(profile)
            );
          }
        }

        // Fallback to local storage
        if (!profile) {
          const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
          if (data) {
            const localProfile = JSON.parse(data);
            if (
              localProfile.email === email &&
              localProfile.password === password
            ) {
              profile = localProfile;
            }
          }
        }

        if (profile) {
          resolve(profile);
        } else {
          reject('이메일 또는 비밀번호가 일치하지 않습니다.');
        }
      } catch (error) {
        console.error('Login error:', error);
        reject('로그인 중 오류가 발생했습니다.');
      }
    });
  },

  // Client Authentication
  signupClient: (
    name: string,
    email: string,
    password: string,
    phone: string
  ): Promise<ClientProfile> => {
    return new Promise(async (resolve, reject) => {
      setTimeout(async () => {
        if (!name || !email || !password || !phone) {
          reject('모든 필드를 입력해주세요.');
          return;
        }

        // Get existing clients - Firebase first, then local
        let existingClients: ClientProfile[] = [];
        if (firebaseService.isInitialized()) {
          existingClients = await firebaseService.getClients();
        } else {
          existingClients = storageService.getClients();
        }

        // Check for duplicates
        if (existingClients.some((c) => c.email === email)) {
          reject('이미 가입된 이메일입니다.');
          return;
        }

        // Check if phone number already exists (could be a legacy user without email)
        const existingByPhone = existingClients.find(
          (c) => c.phone === phone && c.name === name
        );

        let newProfile: ClientProfile;

        if (existingByPhone) {
          // Upgrade existing legacy profile to Full Account
          newProfile = { ...existingByPhone, email, password };
          const updatedList = existingClients.map((c) =>
            c.phone === phone && c.name === name ? newProfile : c
          );
          storageService.saveClients(updatedList);
        } else {
          // Create new profile
          newProfile = {
            name,
            phone,
            email,
            password,
            isSubscribed: false,
            currentPoints: 0,
          };
          storageService.saveClients([...existingClients, newProfile]);
        }

        // Sync with Firebase if connected (handled in App.tsx usually, but safe to try here)
        if (firebaseService.isInitialized()) {
          await firebaseService.saveClients([newProfile]);
        }

        resolve(newProfile);
      }, 500);
    });
  },

  loginClient: (email: string, password: string): Promise<ClientProfile> => {
    return new Promise(async (resolve, reject) => {
      try {
        let clients: ClientProfile[] = [];

        // Check Firebase first if connected
        if (firebaseService.isInitialized()) {
          clients = await firebaseService.getClients();
        } else {
          // Fallback to local storage
          clients = storageService.getClients();
        }

        const client = clients.find(
          (c) => c.email === email && c.password === password
        );

        if (client) {
          resolve(client);
        } else {
          reject('이메일 또는 비밀번호가 일치하지 않습니다.');
        }
      } catch (error) {
        console.error('Login error:', error);
        reject('로그인 중 오류가 발생했습니다.');
      }
    });
  },

  loginAdmin: (email: string, password: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (email === 'admin@swingnote.com' && password === 'admin1234') {
          resolve(true);
        } else {
          reject('관리자 로그인 정보가 일치하지 않습니다.');
        }
      }, 500);
    });
  },

  // --- Account Recovery ---

  findEmail: (
    name: string,
    phone: string,
    role: 'COACH' | 'CLIENT'
  ): Promise<string | null> => {
    return new Promise(async (resolve) => {
      try {
        let profiles: any[] = [];

        if (role === 'COACH') {
          // Check Firebase first if connected
          if (firebaseService.isInitialized()) {
            profiles = await firebaseService.getCoaches();
          } else {
            const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
            if (data) profiles = [JSON.parse(data)];
          }
        } else {
          // Check Firebase first if connected
          if (firebaseService.isInitialized()) {
            profiles = await firebaseService.getClients();
          } else {
            profiles = storageService.getClients();
          }
        }

        const found = profiles.find(
          (p) => p.name === name && p.phone === phone
        );
        resolve(found ? found.email : null);
      } catch (error) {
        console.error('Find email error:', error);
        resolve(null);
      }
    });
  },

  findPassword: (
    email: string,
    phone: string,
    role: 'COACH' | 'CLIENT'
  ): Promise<string | null> => {
    return new Promise(async (resolve) => {
      try {
        let profiles: any[] = [];

        if (role === 'COACH') {
          // Check Firebase first if connected
          if (firebaseService.isInitialized()) {
            profiles = await firebaseService.getCoaches();
          } else {
            const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
            if (data) profiles = [JSON.parse(data)];
          }
        } else {
          // Check Firebase first if connected
          if (firebaseService.isInitialized()) {
            profiles = await firebaseService.getClients();
          } else {
            profiles = storageService.getClients();
          }
        }

        const found = profiles.find(
          (p) => p.email === email && p.phone === phone
        );
        // In a real application, we would trigger a password reset email here.
        // For this simulation, we will return the password to the user.
        resolve(found ? found.password : null);
      } catch (error) {
        console.error('Find password error:', error);
        resolve(null);
      }
    });
  },

  updateCoachSubscription: (isSubscribed: boolean, endDate: string) => {
    const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
    if (data) {
      const profile: CoachProfile = JSON.parse(data);
      profile.isSubscribed = isSubscribed;
      profile.subscriptionEndDate = endDate;
      localStorage.setItem(STORAGE_KEYS.COACH_PROFILE, JSON.stringify(profile));
    }
  },

  // Session Management
  saveSession: (
    role: 'COACH' | 'CLIENT' | 'ADMIN',
    clientData?: { name: string; phone: string },
    isAutoLogin: boolean = false
  ) => {
    const storage = isAutoLogin ? localStorage : sessionStorage;

    // Clear other storage to avoid conflicts
    if (isAutoLogin) {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
      localStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    }

    storage.setItem(STORAGE_KEYS.SESSION_ROLE, role);
    if (role === 'CLIENT' && clientData) {
      storage.setItem(
        STORAGE_KEYS.SESSION_CLIENT_DATA,
        JSON.stringify(clientData)
      );
    }
  },

  restoreSession: (): {
    role: 'COACH' | 'CLIENT' | 'ADMIN';
    clientData?: { name: string; phone: string };
  } | null => {
    // Check localStorage first (Auto Login), then sessionStorage
    let role = localStorage.getItem(STORAGE_KEYS.SESSION_ROLE);
    let clientDataStr = localStorage.getItem(STORAGE_KEYS.SESSION_CLIENT_DATA);

    if (!role) {
      role = sessionStorage.getItem(STORAGE_KEYS.SESSION_ROLE);
      clientDataStr = sessionStorage.getItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    }

    if (role === 'COACH') {
      return { role: 'COACH' };
    }

    if (role === 'ADMIN') {
      return { role: 'ADMIN' };
    }

    if (role === 'CLIENT' && clientDataStr) {
      return { role: 'CLIENT', clientData: JSON.parse(clientDataStr) };
    }

    return null;
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
    localStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
  },

  getCoachProfile: (): CoachProfile | null => {
    const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
    return data ? JSON.parse(data) : null;
  },
};
