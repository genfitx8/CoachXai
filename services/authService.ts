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

/**
 * 로그인 유지 정책.
 *
 * 코치·회원 세션은 localStorage에 남긴다 — 앱을 껐다 켜도, 브라우저를
 * 닫았다 열어도 로그인 상태가 유지되고, 사용자가 직접 로그아웃하거나
 * 토큰이 만료될 때까지만 끝난다(대부분의 모바일 앱과 같은 동작).
 *
 * 관리자·지점관리자 콘솔은 예외로 sessionStorage에 남긴다. 서버가 이
 * 두 역할에는 12시간짜리 토큰만 발급하고(routes/auth.ts의
 * ADMIN_JWT_EXPIRY), 공용 PC에서 쓰이는 권한 높은 화면이라 탭을 닫으면
 * 세션도 끝나는 편이 안전하다.
 */
const PERSISTENT_ROLES: ReadonlySet<string> = new Set(['COACH', 'CLIENT']);

/**
 * 남은 수명이 이보다 짧아지면 앱을 열 때 토큰을 새로 받는다. 서버 토큰이
 * 30일이므로, 일주일에 한 번만 앱을 열어도 만료에 닿지 않는다.
 */
const TOKEN_RENEWAL_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

const sessionStoreFor = (role: string): Storage =>
  PERSISTENT_ROLES.has(role) ? localStorage : sessionStorage;

const clearSessionKeys = (storage: Storage): void => {
  storage.removeItem(STORAGE_KEYS.SESSION_ROLE);
  storage.removeItem(STORAGE_KEYS.SESSION_CLIENT_DATA);
  storage.removeItem(STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
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

/**
 * 서버가 보낸 안내 문구를 그대로 화면에 쓰기 위해 꺼낸다. apiService는
 * 문자열, ApiError, 평범한 Error 어느 형태로도 던질 수 있다.
 */
const SIGNUP_FALLBACK_MESSAGE = '회원가입을 위해 서버 연결이 필요합니다.';

/**
 * 가입 실패 문구. 서버가 이유를 밝힌 4xx(중복 이메일, 이메일 미인증 등)는
 * 그 문구를 그대로 쓴다 — 사용자가 고칠 수 있는 실패인데 "서버 연결이
 * 필요합니다"로 덮어쓰면 무엇을 고쳐야 할지 알 수 없다. 네트워크/5xx는
 * 기존대로 일반 안내를 유지한다.
 */
const toSignupErrorMessage = (error: unknown): string => {
  if (typeof error === 'string' && error) return error;
  const status = (error as { status?: number })?.status;
  const message = (error as { message?: string })?.message;
  if (typeof status === 'number' && status >= 400 && status < 500 && message) {
    return message;
  }
  return SIGNUP_FALLBACK_MESSAGE;
};

const toAuthErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string' && error) return error;
  const message = (error as { message?: string })?.message;
  return message || fallback;
};

// Only used by the offline/demo path, where there is no backend to
// authenticate against. Server-backed deployments verify against
// ADMIN_EMAIL / ADMIN_PASSWORD instead.
const LEGACY_ADMIN_EMAIL = 'admin@coachx.kr';
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
  /**
   * 가입 전 이메일 인증번호 발송. 서버가 코드를 메일로 보내고, 계정은
   * 아직 만들지 않는다. 서버 없이 도는 오프라인/데모 빌드에서는 인증할
   * 상대가 없으므로 그 사실을 그대로 알린다.
   */
  requestSignupEmailVerification: async (
    role: 'COACH' | 'CLIENT',
    email: string
  ): Promise<{ expiresInMinutes: number }> => {
    if (!apiService.isAvailable()) {
      throw '이메일 인증을 위해 서버 연결이 필요합니다.';
    }
    try {
      return await apiService.requestSignupEmailVerification(role, normalizeEmail(email));
    } catch (error: any) {
      log.error('Signup email verification request error:', error);
      throw toAuthErrorMessage(error, '인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  },

  /** 발송된 인증번호 확인. 통과해야만 signupCoach/signupClient가 성공한다. */
  confirmSignupEmailVerification: async (
    role: 'COACH' | 'CLIENT',
    email: string,
    code: string
  ): Promise<void> => {
    if (!apiService.isAvailable()) {
      throw '이메일 인증을 위해 서버 연결이 필요합니다.';
    }
    try {
      await apiService.confirmSignupEmailVerification(role, normalizeEmail(email), code.trim());
    } catch (error: any) {
      throw toAuthErrorMessage(error, '인증번호가 일치하지 않습니다.');
    }
  },

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
      throw toSignupErrorMessage(error);
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
      throw toSignupErrorMessage(error);
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

    // Server auth first (docs/DATA_ARCHITECTURE.md §8.3): issues a real
    // branch_admin JWT so branch dashboards read/write server data. Falls
    // back to the legacy client-side check for accounts that haven't been
    // migrated to the server yet (the platform admin's BRANCH_STAFF tab
    // migrates them automatically on first load).
    if (apiService.isAvailable()) {
      try {
        const data = await apiService.loginBranchAdmin(loginId, password);
        return {
          branchId: data.branchId,
          branchName: data.branchName,
          username: data.username,
          adminId: data.adminId,
        };
      } catch (e) {
        log.warn('Server branch-admin login failed; trying legacy path:', e);
      }
    }

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
    // Wipe both stores first: whichever one this role does not use must not
    // keep a stale session that restoreSession could later pick up (an admin
    // signing in after a coach on the same device, and the reverse).
    clearSessionKeys(localStorage);
    clearSessionKeys(sessionStorage);

    const store = sessionStoreFor(role);
    store.setItem(STORAGE_KEYS.SESSION_ROLE, role);
    if (role === 'CLIENT' && clientData) {
      store.setItem(STORAGE_KEYS.SESSION_CLIENT_DATA, JSON.stringify(clientData));
    }
    if (role === 'BRANCH_ADMIN' && branchAdminData) {
      store.setItem(
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
    // localStorage holds the persistent coach/client session; sessionStorage
    // holds the tab-scoped admin ones. Read the persistent store first so a
    // relaunch finds the session that survived, and keep reading the other as
    // a fallback for sessions written before this became persistent.
    const persistentRole = localStorage.getItem(STORAGE_KEYS.SESSION_ROLE);
    const store = persistentRole ? localStorage : sessionStorage;
    const role = persistentRole ?? sessionStorage.getItem(STORAGE_KEYS.SESSION_ROLE);

    if (!role) return null;

    // A stored session outlives the JWT it was created with. Once that token
    // is provably expired the session is worthless — every protected call
    // would 401 — so end it here rather than restoring a logged-in shell with
    // no data behind it.
    if (store === localStorage && apiService.isTokenExpired?.()) {
      clearSessionKeys(localStorage);
      apiService.clearToken();
      return null;
    }

    if (role === 'COACH') {
      return { role: 'COACH' };
    }

    if (role === 'ADMIN') {
      return { role: 'ADMIN' };
    }

    if (role === 'CLIENT') {
      const clientData = readJson<{ name: string; phone: string }>(
        store,
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
      }>(store, STORAGE_KEYS.SESSION_BRANCH_ADMIN_DATA);
      if (branchAdminData) return { role: 'BRANCH_ADMIN', branchAdminData };
    }

    return null;
  },

  /**
   * 앱을 열 때 토큰 수명을 앞으로 밀어 준다(sliding session).
   *
   * 서버 토큰은 30일짜리다. 그대로 두면 로그인 화면을 다시 보게 되는
   * 날이 오지만, 앱을 열 때마다 만료가 가까운 토큰을 새것으로 바꾸면
   * 그 30일 창이 계속 미래로 밀린다 — 사용자가 직접 로그아웃하거나
   * 30일 넘게 앱을 켜지 않을 때만 세션이 끝난다.
   *
   * 실패는 대부분 네트워크 문제이므로 세션을 건드리지 않는다. 서버가
   * 401로 거절한 경우(탈퇴·삭제된 계정, 폐기된 토큰)만 세션을 끝낸다.
   */
  renewSessionToken: async (): Promise<boolean> => {
    if (!apiService.isAvailable() || !apiService.getToken()) return false;

    const expiresAt = apiService.getTokenExpiryMs?.() ?? null;
    if (expiresAt !== null && expiresAt - Date.now() > TOKEN_RENEWAL_THRESHOLD_MS) {
      // Still fresh — no need to spend a request on it.
      return false;
    }

    try {
      return await apiService.refreshToken();
    } catch (error) {
      if ((error as { status?: number })?.status === 401) {
        log.warn('Session token rejected on renewal; ending the session.');
        authService.logout();
        return false;
      }
      log.warn('Session token renewal failed (kept the existing token):', error);
      return false;
    }
  },

  logout: () => {
    apiService.clearToken();
    clearSessionKeys(localStorage);
    clearSessionKeys(sessionStorage);
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
