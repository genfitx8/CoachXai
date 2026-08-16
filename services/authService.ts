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

// Only used by the offline/demo path, where there is no backend to
// authenticate against. Server-backed deployments verify against
// ADMIN_EMAIL / ADMIN_PASSWORD instead.
const LEGACY_ADMIN_EMAIL = 'admin@swingnote.com';
const LEGACY_ADMIN_PASSWORD = 'admin1234';

/**
 * Safely read a JSON-encoded value out of `Storage`. A prior code path — a
 * malformed API response, a JSON.stringify(undefined) that coerced to the
 * literal "undefined" string on the way into localStorage — used to poison
 * these entries and crash the app on every subsequent read with
 * `SyntaxError: "undefined" is not valid JSON`. This helper treats those
 * poisoned values as absent and self-heals by removing them, so the app
 * boots cleanly the next time.
 */
function readJson<T>(storage: Storage, key: string): T | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  if (raw === '' || raw === 'undefined' || raw === 'null') {
    storage.removeItem(key);
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    log.warn(`Removing corrupt storage entry "${key}":`, err);
    storage.removeItem(key);
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  // Never persist undefined — JSON.stringify(undefined) returns `undefined`
  // (not a string), which localStorage coerces to the literal "undefined"
  // and every future JSON.parse then throws on read.
  if (value === undefined) {
    storage.removeItem(key);
    return;
  }
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, serialized);
  } catch (err) {
    log.warn(`Failed to persist storage entry "${key}":`, err);
  }
}

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
      writeJson(localStorage, STORAGE_KEYS.COACH_PROFILE, coach);
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
        const { token, coach } = await apiService.loginCoach(normalizedEmail, password);
        apiService.setToken(token);
        writeJson(localStorage, STORAGE_KEYS.COACH_PROFILE, coach);
        resolve(coach);
      } catch (error: any) {
        log.error('Login error:', error);
        reject(typeof error === 'string' ? error : '로그인을 위해 서버 연결이 필요합니다.');
      }
    });
  },

  // Client Authentication
  loginClient: (email: string, password: string): Promise<ClientProfile> => {
    return new Promise(async (resolve, reject) => {
      const normalizedEmail = normalizeEmail(email);
      try {
        const { token, client } = await apiService.loginClient(normalizedEmail, password);
        apiService.setToken(token);
        resolve(client);
      } catch (error: any) {
        log.error('Login error:', error);
        reject(typeof error === 'string' ? error : '로그인을 위해 서버 연결이 필요합니다.');
      }
    });
  },

  /**
   * Authenticate the admin console against the backend so the session carries
   * a JWT.
   *
   * This used to be a purely client-side credential check that issued no
   * token. Every protected endpoint (`GET /api/coaches`, `/api/clients`,
   * `/api/lessons`) then rejected the admin, apiService fell back to
   * `/api/coaches/me` (rejected too), and the dashboard rendered the coach
   * list cached in that browser's localStorage — usually a single coach —
   * while the student app queried the real table and found every match.
   *
   * When no backend is configured (offline/demo builds) we keep the legacy
   * local check so the console still opens against local storage data.
   */
  loginAdmin: async (email: string, password: string): Promise<boolean> => {
    const normalizedEmail = normalizeEmail(email);

    if (apiService.isAvailable()) {
      await apiService.loginAdmin(normalizedEmail, password).catch((error: unknown) => {
        log.error('Admin login error:', error);
        const message =
          typeof error === 'string'
            ? error
            : (error as { message?: string })?.message ||
              '관리자 로그인 정보가 일치하지 않습니다.';
        throw message;
      });
      return true;
    }

    if (
      normalizedEmail === LEGACY_ADMIN_EMAIL &&
      password === LEGACY_ADMIN_PASSWORD
    ) {
      return true;
    }
    throw '관리자 로그인 정보가 일치하지 않습니다.';
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
            const stored = readJson<CoachProfile>(localStorage, STORAGE_KEYS.COACH_PROFILE);
            if (stored) profiles = [stored];
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
            const stored = readJson<CoachProfile>(localStorage, STORAGE_KEYS.COACH_PROFILE);
            if (stored) profiles = [stored];
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
    const profile = readJson<CoachProfile>(localStorage, STORAGE_KEYS.COACH_PROFILE);
    if (profile) {
      profile.isSubscribed = isSubscribed;
      profile.subscriptionEndDate = endDate;
      writeJson(localStorage, STORAGE_KEYS.COACH_PROFILE, profile);
    }
  },

  // Session Management
  saveSession: (
    role: 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN',
    clientData?: { name: string; phone: string },
    branchAdminData?: {
      branchId: string;
      branchName: string;
      username: string;
      adminId: string;
    }
  ) => {
    // Auto-login is removed: always persist only in sessionStorage
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);

    sessionStorage.setItem(STORAGE_KEYS.SESSION_ROLE, role);
    if (role === 'CLIENT' && clientData) {
      sessionStorage.setItem(
        STORAGE_KEYS.SESSION_CLIENT_DATA,
        JSON.stringify(clientData)
      );
    }
    if (role === 'BRANCH_ADMIN' && branchAdminData) {
      sessionStorage.setItem(
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
    const role = sessionStorage.getItem(STORAGE_KEYS.SESSION_ROLE);

    if (role === 'COACH') {
      return { role: 'COACH' };
    }

    if (role === 'ADMIN') {
      return { role: 'ADMIN' };
    }

    if (role === 'CLIENT') {
      const clientData = readJson<{ name: string; phone: string }>(
        sessionStorage,
        STORAGE_KEYS.SESSION_CLIENT_DATA
      );
      if (clientData) return { role: 'CLIENT', clientData };
    }

    if (role === 'BRANCH_ADMIN') {
      const branchAdminData = readJson<{
        branchId: string;
        branchName: string;
        username: string;
        adminId: string;
      }>(sessionStorage, STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
      if (branchAdminData) return { role: 'BRANCH_ADMIN', branchAdminData };
    }

    return null;
  },

  logout: () => {
    apiService.clearToken();
    localStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
    localStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    localStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_ROLE);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
  },

  getCoachProfile: (): CoachProfile | null => {
    return readJson<CoachProfile>(localStorage, STORAGE_KEYS.COACH_PROFILE);
  },

  // Refresh the cached coach profile from a trusted source (e.g. the
  // /api/coaches/me response after session restore). Keeps subsequent
  // getCoachProfile() reads — used in loadData(), getCoachNameById(), etc.
  // — aligned with the auth token so client-side coach filters don't drift
  // between devices.
  saveCoachProfile: (coach: CoachProfile): void => {
    writeJson(localStorage, STORAGE_KEYS.COACH_PROFILE, coach);
  },
};
