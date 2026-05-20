import { CoachProfile, ClientProfile } from '../types';
import { storageService } from './storage';
import { firebaseService } from './firebase';
import { apiService } from './apiService';
import { createLogger } from '../utils/logger';

const log = createLogger('auth');

const STORAGE_KEYS = {
  COACH_PROFILE: 'swingnote_coach_profile', // Database for coach accounts
  SESSION_ROLE: 'swingnote_session_role',
  SESSION_CLIENT_DATA: 'swingnote_session_client_data',
  SESSION_BRANCH_ADMIN_DATA: 'swingnote_session_branch_admin_data',
  AUTO_LOGIN_PREF: 'swingnote_auto_login_pref',
};

const createResetToken = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `fallback-${Date.now()}`;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const authService = {
  // Coach Signup
  signupCoach: async (
    name: string,
    email: string,
    password: string,
    phone: string
  ): Promise<CoachProfile> => {
    try {
      const { token, coach } = await apiService.signupCoach(
        name.trim(),
        normalizeEmail(email),
        password,
        phone.trim()
      );
      apiService.setToken(token);
      localStorage.setItem(STORAGE_KEYS.COACH_PROFILE, JSON.stringify(coach));
      return coach;
    } catch (error: any) {
      if (typeof error === 'string') throw error;
      throw '회원가입을 위해 서버 연결이 필요합니다.';
    }
  },

  // Client Signup
  signupClient: async (
    name: string,
    email: string,
    password: string,
    phone: string
  ): Promise<ClientProfile> => {
    try {
      const { token, client } = await apiService.signupClient(
        name.trim(),
        normalizeEmail(email),
        password,
        phone.trim()
      );
      apiService.setToken(token);
      return client;
    } catch (error: any) {
      if (typeof error === 'string') throw error;
      throw '회원가입을 위해 서버 연결이 필요합니다.';
    }
  },

  // Coach Authentication
  loginCoach: (email: string, password: string): Promise<CoachProfile> => {
    return new Promise(async (resolve, reject) => {
      const normalizedEmail = normalizeEmail(email);
      try {
        try {
          const { token, coach } = await apiService.loginCoach(normalizedEmail, password);
          apiService.setToken(token);
          localStorage.setItem(STORAGE_KEYS.COACH_PROFILE, JSON.stringify(coach));
          resolve(coach);
          return;
        } catch {}

        // localStorage fallback
        const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
        if (data) {
          const localProfile = JSON.parse(data);
          const fallbackEmail =
            typeof localProfile.email === 'string' ? normalizeEmail(localProfile.email) : '';
          if (fallbackEmail === normalizedEmail && localProfile.password === password) {
            resolve(localProfile);
            return;
          }
        }
        reject('이메일 또는 비밀번호가 일치하지 않습니다.');
      } catch (error: any) {
        log.error('Login error:', error);
        reject(typeof error === 'string' ? error : '로그인 중 오류가 발생했습니다.');
      }
    });
  },

  // Client Authentication
  loginClient: (email: string, password: string): Promise<ClientProfile> => {
    return new Promise(async (resolve, reject) => {
      const normalizedEmail = normalizeEmail(email);
      try {
        try {
          const { token, client } = await apiService.loginClient(normalizedEmail, password);
          apiService.setToken(token);
          resolve(client);
          return;
        } catch {}

        const clients = storageService.getClients();
        const client = clients.find((c) => {
          const clientEmail = typeof c.email === 'string' ? normalizeEmail(c.email) : '';
          return clientEmail === normalizedEmail && c.password === password;
        });
        if (client) {
          resolve(client);
        } else {
          reject('이메일 또는 비밀번호가 일치하지 않습니다.');
        }
      } catch (error: any) {
        log.error('Login error:', error);
        reject(typeof error === 'string' ? error : '로그인 중 오류가 발생했습니다.');
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
      log.error('Branch admin login error:', error);
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
        log.error('Find email error:', error);
        resolve(null);
      }
    });
  },

  findPassword: (
    email: string,
    phone: string,
    role: 'COACH' | 'CLIENT'
  ): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        if (apiService.isAvailable()) {
          await apiService.requestPasswordReset(role, email, phone);
          resolve();
          return;
        }

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

        if (found) {
          const resetToken = createResetToken();
          const resetUrl = `https://coachxai.local/reset-password?token=${resetToken}`;
          log.info('비밀번호 재설정 메일 발송(개발 모드 시뮬레이션)', {
            service: 'CoachXai',
            to: found.email,
            resetUrl,
            expiresInMinutes: 30,
          });
        }

        resolve();
      } catch (error) {
        log.error('Find password error:', error);
        resolve();
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

    // Persist auto-login preference so the login screen can restore it
    if (isAutoLogin) {
      localStorage.setItem(STORAGE_KEYS.AUTO_LOGIN_PREF, '1');
    } else {
      localStorage.removeItem(STORAGE_KEYS.AUTO_LOGIN_PREF);
    }

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

  getAutoLoginPref: (): boolean => {
    try {
      return localStorage.getItem(STORAGE_KEYS.AUTO_LOGIN_PREF) === '1';
    } catch {
      return false;
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
    apiService.clearToken();
    localStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
    localStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    localStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
    localStorage.removeItem(STORAGE_KEYS.AUTO_LOGIN_PREF);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
  },

  getCoachProfile: (): CoachProfile | null => {
    const data = localStorage.getItem(STORAGE_KEYS.COACH_PROFILE);
    return data ? JSON.parse(data) : null;
  },
};
