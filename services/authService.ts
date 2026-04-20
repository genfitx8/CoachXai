import { CoachProfile, ClientProfile } from '../types';
import { storageService } from './storage';
import { firebaseService } from './firebase';

const STORAGE_KEYS = {
  COACH_PROFILE: 'swingnote_coach_profile', // Database for coach accounts
  SESSION_ROLE: 'swingnote_session_role',
  SESSION_CLIENT_DATA: 'swingnote_session_client_data',
  SESSION_BRANCH_ADMIN_DATA: 'swingnote_session_branch_admin_data',
};

const normalizePhoneNumber = (phone: string): string => {
  const digitsOnly = phone.replace(/\D/g, '');

  // Normalize +82 mobile format to local 0-prefixed format
  if (digitsOnly.startsWith('82')) {
    return `0${digitsOnly.slice(2)}`;
  }

  return digitsOnly;
};

export const authService = {
  signup: (
    role: 'COACH' | 'CLIENT',
    name: string,
    email: string,
    password: string,
    phone: string
  ): Promise<CoachProfile | ClientProfile> => {
    return role === 'COACH'
      ? authService.signupCoach(name, email, password, phone)
      : authService.signupClient(name, email, password, phone);
  },

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

        const normalizedPhone = normalizePhoneNumber(phone);
        if (!normalizedPhone) {
          reject('모든 필드를 입력해주세요.');
          return;
        }

        // Check if already exists - Firebase first, then local
        const existingCoaches: CoachProfile[] = [];
        if (firebaseService.isInitialized()) {
          existingCoaches.push(...(await firebaseService.getCoaches()));
        }

        // Check local storage
        const existingData = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
        if (existingData) {
          existingCoaches.push(JSON.parse(existingData));
        }

        if (existingCoaches.some((c) => c.email === email)) {
          reject('이미 가입된 이메일입니다.');
          return;
        }

        if (
          existingCoaches.some(
            (c) => normalizePhoneNumber(c.phone ?? '') === normalizedPhone
          )
        ) {
          reject('이미 가입된 휴대폰 번호입니다.');
          return;
        }

        const newProfile: CoachProfile = {
          id: crypto.randomUUID(),
          name,
          email,
          phone,
          password, // In a real app, never store plain text passwords!
          isSubscribed: false, // Default to false for new signups
          subscriptionPlan: 'FREE',
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

        const normalizedPhone = normalizePhoneNumber(phone);
        if (!normalizedPhone) {
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
          (c) => normalizePhoneNumber(c.phone) === normalizedPhone
        );

        let newProfile: ClientProfile;

        if (
          existingByPhone &&
          !existingByPhone.email &&
          !existingByPhone.password &&
          existingByPhone.name === name
        ) {
          // Upgrade existing legacy profile to Full Account
          newProfile = { ...existingByPhone, email, password };
          const updatedList = existingClients.map((c) =>
            c === existingByPhone ? newProfile : c
          );
          storageService.saveClients(updatedList);
        } else if (existingByPhone) {
          reject('이미 가입된 휴대폰 번호입니다.');
          return;
        } else {
          // Create new profile
          newProfile = {
            name,
            phone,
            email,
            password,
            isSubscribed: false,
            subscriptionPlan: 'FREE',
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

  /**
   * Sign in (or sign up) via Google OAuth.
   * - Opens a Google popup via Firebase Auth.
   * - Looks up an existing Coach/Client profile by email and returns it.
   * - If no profile exists yet, creates a minimal one from the Google account info.
   * Returns the resolved profile.
   */
  loginWithGoogle: async (
    role: 'COACH' | 'CLIENT'
  ): Promise<CoachProfile | ClientProfile> => {
    if (!firebaseService.isInitialized()) {
      throw 'Firebase가 연결되지 않았습니다. 먼저 Firebase 설정을 완료해주세요.';
    }

    let credential;
    try {
      credential = await firebaseService.signInWithGoogle();
    } catch (err: any) {
      // User dismissed the popup or it was blocked
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        throw '구글 로그인이 취소되었습니다.';
      }
      if (err?.code === 'auth/popup-blocked') {
        throw '팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제한 후 다시 시도해주세요.';
      }
      console.error('Google sign-in error:', err);
      throw '구글 로그인 중 오류가 발생했습니다.';
    }

    const { displayName, email, phoneNumber } = credential.user;
    const googleEmail = email ?? '';
    const googleName = displayName ?? googleEmail;
    const googlePhone = phoneNumber ?? '';

    if (role === 'COACH') {
      // Try to find existing coach by email
      let coaches: CoachProfile[] = [];
      if (firebaseService.isInitialized()) {
        coaches = await firebaseService.getCoaches();
      } else {
        const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
        if (data) coaches = [JSON.parse(data)];
      }

      let profile = coaches.find((c) => c.email === googleEmail) ?? null;

      if (!profile) {
        // First-time Google login — create a new coach profile
        profile = {
          id: crypto.randomUUID(),
          name: googleName,
          email: googleEmail,
          phone: googlePhone,
          isSubscribed: false,
          subscriptionPlan: 'FREE',
        };
        if (firebaseService.isInitialized()) {
          await firebaseService.saveCoach(profile);
        }
      }

      localStorage.setItem(STORAGE_KEYS.COACH_PROFILE, JSON.stringify(profile));
      return profile;
    } else {
      // CLIENT
      let clients: ClientProfile[] = [];
      if (firebaseService.isInitialized()) {
        clients = await firebaseService.getClients();
      } else {
        clients = storageService.getClients();
      }

      let profile = clients.find((c) => c.email === googleEmail) ?? null;

      if (!profile) {
        // First-time Google login — create a new client profile
        profile = {
          name: googleName,
          phone: googlePhone,
          email: googleEmail,
          isSubscribed: false,
          subscriptionPlan: 'FREE',
          currentPoints: 0,
        };
        if (firebaseService.isInitialized()) {
          await firebaseService.saveClients([profile]);
          // Also persist locally so future local lookups find the profile
          storageService.saveClients([...clients, profile]);
        } else {
          storageService.saveClients([...clients, profile]);
        }
      }

      return profile;
    }
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

  // --- Branch Admin Authentication ---

  /**
   * Parse a branch admin login ID in the format "지점이름:유저이름".
   * Returns { branchName, username } or null if the format is invalid.
   */
  parseBranchAdminLoginId: (
    loginId: string
  ): { branchName: string; username: string } | null => {
    const colonIdx = loginId.indexOf(':');
    if (colonIdx <= 0 || colonIdx === loginId.length - 1) return null;
    const branchName = loginId.slice(0, colonIdx).trim();
    const username = loginId.slice(colonIdx + 1).trim();
    if (!branchName || !username) return null;
    return { branchName, username };
  },

  loginBranchAdmin: async (
    loginId: string,
    password: string
  ): Promise<{
    branchId: string;
    branchName: string;
    username: string;
    adminId: string;
  }> => {
    // 1. Parse loginId
    const parsed = authService.parseBranchAdminLoginId(loginId);
    if (!parsed) {
      throw '로그인 아이디 형식이 올바르지 않습니다. "지점이름:유저이름" 형식으로 입력해주세요.';
    }
    const { branchName, username } = parsed;

    try {
      // 2. Look up branch by name
      const branches = firebaseService.isInitialized()
        ? await firebaseService.getBranches()
        : storageService.getBranches();

      const branch = branches.find((b) => b.name === branchName && b.isActive);
      if (!branch) {
        throw '존재하지 않거나 비활성화된 지점입니다.';
      }

      // 3. Find account by composite id
      const accountId = `${branch.id}:${username}`;
      const accounts = firebaseService.isInitialized()
        ? await firebaseService.getBranchAdminAccounts(branch.id)
        : storageService.getBranchAdminAccounts(branch.id);

      const account = accounts.find((a) => a.id === accountId);
      if (!account) {
        throw '아이디 또는 비밀번호가 일치하지 않습니다.';
      }

      // 4. Verify password and isActive
      if (!account.isActive) {
        throw '비활성화된 계정입니다. 시스템 관리자에게 문의하세요.';
      }
      if (account.password !== password) {
        throw '아이디 또는 비밀번호가 일치하지 않습니다.';
      }

      return {
        branchId: branch.id,
        branchName: branch.name,
        username: account.username,
        adminId: account.id,
      };
    } catch (error) {
      if (typeof error === 'string') throw error;
      console.error('Branch admin login error:', error);
      throw '로그인 중 오류가 발생했습니다.';
    }
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
    role: 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN',
    clientData?: { name: string; phone: string },
    isAutoLogin: boolean = false,
    branchAdminData?: {
      branchId: string;
      branchName: string;
      username: string;
      adminId: string;
    }
  ) => {
    const storage = isAutoLogin ? localStorage : sessionStorage;

    // Clear other storage to avoid conflicts
    if (isAutoLogin) {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
      localStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
      localStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
    }

    storage.setItem(STORAGE_KEYS.SESSION_ROLE, role);
    if (role === 'CLIENT' && clientData) {
      storage.setItem(
        STORAGE_KEYS.SESSION_CLIENT_DATA,
        JSON.stringify(clientData)
      );
    }
    if (role === 'BRANCH_ADMIN' && branchAdminData) {
      storage.setItem(
        STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA,
        JSON.stringify(branchAdminData)
      );
    }
  },

  restoreSession: (): {
    role: 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN';
    clientData?: { name: string; phone: string };
    branchAdminData?: {
      branchId: string;
      branchName: string;
      username: string;
      adminId: string;
    };
  } | null => {
    // Check localStorage first (Auto Login), then sessionStorage
    let role = localStorage.getItem(STORAGE_KEYS.SESSION_ROLE);
    let clientDataStr = localStorage.getItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    let branchAdminDataStr = localStorage.getItem(
      STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA
    );

    if (!role) {
      role = sessionStorage.getItem(STORAGE_KEYS.SESSION_ROLE);
      clientDataStr = sessionStorage.getItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
      branchAdminDataStr = sessionStorage.getItem(
        STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA
      );
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

    if (role === 'BRANCH_ADMIN' && branchAdminDataStr) {
      return {
        role: 'BRANCH_ADMIN',
        branchAdminData: JSON.parse(branchAdminDataStr),
      };
    }

    return null;
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
    localStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    localStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
  },

  getCoachProfile: (): CoachProfile | null => {
    const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
    return data ? JSON.parse(data) : null;
  },
};
