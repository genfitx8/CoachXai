export type AppVariant = 'coach' | 'student';

export type Role = 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN';

// `null` means the web / dev / test build where every role is allowed and
// the login screen shows all role tabs.
//
// Variant is resolved from three sources, in priority order:
//   1. VITE_APP_VARIANT — set at build time when producing dist-coach/dist-student
//   2. `?variant=coach|student` in the current URL — how the native shells
//      (Capacitor server.url) tell the shared web deploy which app they are
//   3. localStorage — persists (2) across in-app navigation so the query
//      string only needs to appear on the initial load
const STORAGE_KEY = 'coachxai_app_variant';

const normalize = (raw: string | null | undefined): AppVariant | null =>
  raw === 'coach' ? 'coach' : raw === 'student' ? 'student' : null;

const readFromEnv = (): AppVariant | null => {
  const raw =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { VITE_APP_VARIANT?: string } }).env
        ?.VITE_APP_VARIANT) ||
    '';
  return normalize(raw);
};

const readFromUrl = (): AppVariant | null => {
  if (typeof window === 'undefined' || !window.location?.search) return null;
  try {
    return normalize(new URLSearchParams(window.location.search).get('variant'));
  } catch {
    return null;
  }
};

const readFromStorage = (): AppVariant | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

const persist = (variant: AppVariant | null): void => {
  if (typeof localStorage === 'undefined' || !variant) return;
  try {
    localStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // Storage unavailable (private mode, quota) — non-fatal.
  }
};

const resolved = readFromEnv() ?? readFromUrl() ?? readFromStorage();
persist(resolved);

export const APP_VARIANT: AppVariant | null = resolved;

export const IS_COACH_APP = APP_VARIANT === 'coach';
export const IS_STUDENT_APP = APP_VARIANT === 'student';

export const ROLES_ALLOWED_BY_VARIANT: Record<AppVariant, Role[]> = {
  coach: ['COACH', 'ADMIN', 'BRANCH_ADMIN'],
  student: ['CLIENT'],
};

export const isRoleAllowedInThisApp = (role: Role | null): boolean => {
  if (!role) return true;
  if (APP_VARIANT === null) return true;
  return ROLES_ALLOWED_BY_VARIANT[APP_VARIANT].includes(role);
};
