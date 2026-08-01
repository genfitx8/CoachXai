export type AppVariant = 'coach' | 'student';

export type Role = 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN';

// `null` means the web / dev / test build where every role is allowed and
// the login screen shows all role tabs. The two native shells inject
// VITE_APP_VARIANT at build time to lock the app to a single role family.
const raw =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_APP_VARIANT?: string } }).env
      ?.VITE_APP_VARIANT) ||
  '';

export const APP_VARIANT: AppVariant | null =
  raw === 'coach' ? 'coach' : raw === 'student' ? 'student' : null;

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
