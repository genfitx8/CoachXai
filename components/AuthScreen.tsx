import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Card, CardTitle } from './ui/Card';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { authService } from '../services/authService';
import {
  Activity,
  Mail,
  Lock,
  User,
  Phone,
  CheckCircle,
  CheckSquare,
  Square,
  ShieldCheck,
  ArrowLeft,
  PenTool,
  Globe,
  ChevronDown,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from './LanguageContext';
import { AUTH_USER_TYPE_STORAGE_KEY } from '../constants/auth';

const SAVED_CREDENTIALS_KEY = 'swingnote_saved_credentials';

interface SavedCredentials {
  email: string;
  password: string;
  role: 'COACH' | 'CLIENT';
}

interface AuthScreenProps {
  onLoginSuccess: (
    role: 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN',
    data: any,
    isAutoLogin: boolean
  ) => void;
}

// ─── Local helpers ────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'ko' as const, label: '한국어',   flag: '🇰🇷' },
  { code: 'en' as const, label: 'English',  flag: '🇺🇸' },
  { code: 'ja' as const, label: '日本語',   flag: '🇯🇵' },
  { code: 'th' as const, label: 'ภาษาไทย', flag: '🇹🇭' },
];

const ErrorAlert: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
  >
    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
}) => {
  const PASSWORD_RECOVERY_MESSAGE = '등록된 이메일로 비밀번호 안내 메일을 발송했습니다.';
  const { t, language, setLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState<'COACH' | 'CLIENT'>(() => {
    try {
      const savedTab = localStorage.getItem(AUTH_USER_TYPE_STORAGE_KEY);
      return savedTab === 'CLIENT' || savedTab === 'COACH' ? savedTab : 'COACH';
    } catch {
      return 'COACH';
    }
  });
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isBranchAdminMode, setIsBranchAdminMode] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const [showFindAccount, setShowFindAccount] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [findTab, setFindTab] = useState<'EMAIL' | 'PASSWORD'>('EMAIL');
  const [findResult, setFindResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  const [branchAdminLoginId, setBranchAdminLoginId] = useState('');
  const [branchAdminPassword, setBranchAdminPassword] = useState('');

  const [isAutoLogin, setIsAutoLogin] = useState(() => authService.getAutoLoginPref());
  const [isSavePassword, setIsSavePassword] = useState(() => {
    try {
      return !!localStorage.getItem(SAVED_CREDENTIALS_KEY);
    } catch {
      return false;
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setPhone('');
    setSignupPasswordConfirm('');
    setSignupSuccess(false);
    setBranchAdminLoginId('');
    setBranchAdminPassword('');
    setError(null);
    setFindResult(null);
  };

  // Load saved credentials on mount and auto-login if both options are enabled
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
      if (!raw) return;
      const creds: SavedCredentials = JSON.parse(raw);
      setEmail(creds.email);
      setPassword(creds.password);
      setActiveTab(creds.role);
      setIsSavePassword(true);
      if (isAutoLogin) {
        performLogin(creds.email, creds.password, creds.role);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (tab: 'COACH' | 'CLIENT') => {
    setActiveTab(tab);
    try {
      localStorage.setItem(AUTH_USER_TYPE_STORAGE_KEY, tab);
    } catch {
      // localStorage가 차단된 환경(예: private mode)에서도 로그인은 계속 가능해야 함
    }
    resetForm();
  };

  const saveCredentials = (e: string, p: string, role: 'COACH' | 'CLIENT') => {
    try {
      localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify({ email: e, password: p, role }));
    } catch {}
  };

  const clearCredentials = () => {
    try {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    } catch {}
  };

  const autofillPasswordIfSaved = (typedEmail: string) => {
    try {
      const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
      if (!raw) return;
      const creds: SavedCredentials = JSON.parse(raw);
      if (creds.email.toLowerCase() === typedEmail.toLowerCase()) {
        setPassword(creds.password);
      }
    } catch {}
  };

  const performLogin = async (loginEmail: string, loginPassword: string, role: 'COACH' | 'CLIENT') => {
    setError(null);
    setIsLoading(true);
    try {
      let profile;
      if (role === 'COACH') {
        profile = await authService.loginCoach(loginEmail, loginPassword);
      } else {
        profile = await authService.loginClient(loginEmail, loginPassword);
      }
      if (isSavePassword) {
        saveCredentials(loginEmail, loginPassword, role);
      } else {
        clearCredentials();
      }
      onLoginSuccess(role, profile, isAutoLogin);
    } catch (err: any) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCoachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password, 'COACH');
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password, 'CLIENT');
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await authService.loginAdmin(email, password);
      onLoginSuccess('ADMIN', {}, false);
    } catch (err: any) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBranchAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const result = await authService.loginBranchAdmin(
        branchAdminLoginId,
        branchAdminPassword
      );
      onLoginSuccess('BRANCH_ADMIN', result, isAutoLogin);
    } catch (err: any) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFindAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFindResult(null);
    try {
      if (findTab === 'EMAIL') {
        if (!name || !phone) {
          setFindResult({ type: 'error', message: '이름과 전화번호를 입력해주세요.' });
          return;
        }
        const result = await authService.findEmail(name, phone, activeTab);
        if (result) {
          setFindResult({ type: 'success', message: `${t('result_email')} ${result}` });
        } else {
          setFindResult({ type: 'error', message: t('not_found') });
        }
      } else {
        if (!email || !phone) {
          setFindResult({ type: 'error', message: '이메일과 전화번호를 입력해주세요.' });
          return;
        }
        await authService.findPassword(email, phone, activeTab);
        setFindResult({ type: 'success', message: PASSWORD_RECOVERY_MESSAGE });
      }
    } catch {
      if (findTab === 'PASSWORD') {
        setFindResult({ type: 'success', message: PASSWORD_RECOVERY_MESSAGE });
      } else {
        setFindResult({ type: 'error', message: '오류가 발생했습니다.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password || !phone) {
      setError('모든 필드를 입력해주세요.');
      return;
    }
    if (password.length < 8) {
      setError(t('signup_pw_min'));
      return;
    }
    if (password !== signupPasswordConfirm) {
      setError(t('signup_pw_mismatch'));
      return;
    }

    setIsLoading(true);
    try {
      if (activeTab === 'COACH') {
        const coach = await authService.signupCoach(name, email, password, phone);
        onLoginSuccess('COACH', coach, false);
      } else {
        const client = await authService.signupClient(name, email, password, phone);
        onLoginSuccess('CLIENT', client, false);
      }
    } catch (err: any) {
      setError(typeof err === 'string' ? err : t('signup_email_exists'));
    } finally {
      setIsLoading(false);
    }
  };

  const currentLanguage = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  // ─── Signup view ──────────────────────────────────────────────────────────
  if (showSignup) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4 safe-top safe-bottom">
        <Card variant="elevated" padding="none" className="w-full max-w-md overflow-hidden">
          <div className="bg-gradient-to-br from-primary-500 to-primary-700 px-8 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
              <Activity className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-display-sm font-semibold text-white">{t('signup_title')}</h1>
            <p className="mt-1 text-sm text-primary-100">CoachX AI</p>
          </div>

          <div className="p-7">
            {/* Role tabs */}
            <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl bg-bg-inset p-1.5">
              {(['COACH', 'CLIENT'] as const).map((tab) => {
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setActiveTab(tab);
                      setError(null);
                    }}
                    className={`h-10 rounded-lg text-sm font-semibold transition-all ${
                      active
                        ? 'bg-primary-600/25 text-primary-300 shadow-elev-1 ring-1 ring-inset ring-primary-500/40'
                        : 'text-ink-muted hover:text-ink-medium hover:bg-bg-overlay/50'
                    }`}
                  >
                    {tab === 'COACH' ? t('signup_coach') : t('signup_client')}
                  </button>
                );
              })}
            </div>

            {error && <ErrorAlert message={error} />}

            <form onSubmit={handleSignup} className="space-y-4">
              <Input
                label={t('name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                leading={<User className="h-4 w-4" />}
                autoComplete="name"
              />
              <Input
                label={t('email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                leading={<Mail className="h-4 w-4" />}
                autoComplete="email"
              />
              <Input
                label={t('phone')}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                helper={t('phone_desc')}
                leading={<Phone className="h-4 w-4" />}
                autoComplete="tel"
              />
              <Input
                label={t('password')}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                helper={t('signup_pw_min')}
                leading={<Lock className="h-4 w-4" />}
                autoComplete="new-password"
              />
              <Input
                label={t('signup_pw_confirm')}
                type="password"
                value={signupPasswordConfirm}
                onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                leading={<Lock className="h-4 w-4" />}
                autoComplete="new-password"
              />

              <Button type="submit" fullWidth size="lg" isLoading={isLoading} className="mt-2">
                {t('signup_btn')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setShowSignup(false);
                  resetForm();
                }}
                className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink-high transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t('go_to_login')}
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Branch admin view ─────────────────────────────────────────────────────
  if (isBranchAdminMode) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4 safe-top safe-bottom">
        <Card variant="elevated" padding="none" className="w-full max-w-md overflow-hidden">
          <div className="bg-gradient-to-br from-primary-700 to-primary-900 px-8 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
              <PenTool className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-display-sm font-semibold text-white">지점 관리자 로그인</h1>
            <p className="mt-1 text-sm text-primary-100">Branch Admin Login</p>
          </div>

          <div className="p-7">
            {error && <ErrorAlert message={error} />}

            <form onSubmit={handleBranchAdminSubmit} className="space-y-4">
              <Input
                label="로그인 아이디"
                value={branchAdminLoginId}
                onChange={(e) => setBranchAdminLoginId(e.target.value)}
                placeholder="예: 강남점:mina"
                helper="형식: 지점이름:유저이름 (예: 강남점:mina)"
                leading={<User className="h-4 w-4" />}
              />
              <Input
                label={t('password')}
                type="password"
                value={branchAdminPassword}
                onChange={(e) => setBranchAdminPassword(e.target.value)}
                placeholder="••••••••"
                leading={<Lock className="h-4 w-4" />}
              />

              <button
                type="button"
                onClick={() => setIsAutoLogin(!isAutoLogin)}
                className="flex items-center gap-2 text-sm text-ink-medium hover:text-ink-high transition-colors"
              >
                {isAutoLogin ? (
                  <CheckSquare className="h-5 w-5 text-primary-400" />
                ) : (
                  <Square className="h-5 w-5 text-ink-faint" />
                )}
                {t('auto_login')}
              </button>

              <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
                지점 관리자 로그인
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsBranchAdminMode(false);
                  resetForm();
                }}
                className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink-high transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t('back')}
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Admin view ───────────────────────────────────────────────────────────
  if (isAdminMode) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4 safe-top safe-bottom">
        <Card variant="elevated" padding="none" className="w-full max-w-md overflow-hidden">
          <div className="bg-gradient-to-br from-red-700 to-red-900 px-8 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-display-sm font-semibold text-white">{t('admin_login')}</h1>
            <p className="mt-1 text-sm text-red-100">{t('admin_only')}</p>
          </div>

          <div className="p-7">
            {error && <ErrorAlert message={error} />}

            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <Input
                label={t('email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@swingnote.com"
                leading={<Mail className="h-4 w-4" />}
              />
              <Input
                label={t('password')}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leading={<Lock className="h-4 w-4" />}
              />

              <Button
                type="submit"
                variant="danger"
                fullWidth
                size="lg"
                isLoading={isLoading}
              >
                {t('admin_login')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsAdminMode(false);
                  resetForm();
                }}
                className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink-high transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t('back')}
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Main login / signup view ─────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden bg-bg-base safe-top safe-bottom">
      {/* Ambient brand glow — quiet, off-centre, behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary-600/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] translate-x-1/3 translate-y-1/3 rounded-full bg-primary-800/20 blur-3xl" />
      </div>

      {/* Language switcher — top right */}
      <div className="absolute right-4 top-4 z-30">
        <button
          type="button"
          onClick={() => setShowLangMenu((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line-default bg-bg-overlay/80 px-3 py-1.5 text-xs font-medium text-ink-medium backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink-high"
        >
          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{currentLanguage.label}</span>
          <ChevronDown
            className={`h-3 w-3 transition-transform ${showLangMenu ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {showLangMenu && (
          <div className="absolute right-0 mt-2 w-36 overflow-hidden rounded-xl border border-line-default bg-bg-overlay py-1 shadow-elev-3 backdrop-blur-xl animate-scale-in">
            {LANGUAGES.map((lang) => {
              const active = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setLanguage(lang.code as any);
                    setShowLangMenu(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary-500/15 text-primary-200'
                      : 'text-ink-medium hover:bg-line-subtle hover:text-ink-high'
                  }`}
                >
                  <span className="text-sm" aria-hidden="true">{lang.flag}</span>
                  {lang.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Card */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4 pb-20">
        <Card variant="elevated" padding="none" className="w-full max-w-md overflow-hidden">
          {/* Brand header */}
          <div className="px-8 pt-10 pb-6 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-glow">
              <Activity className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-display-sm">CoachX AI</CardTitle>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t('app_desc')}</p>
          </div>

          {/* Login type tabs */}
          <div
            className="mx-8 mb-6 grid grid-cols-2 gap-1.5 rounded-xl bg-bg-inset p-1.5"
          >
            {(['COACH', 'CLIENT'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleTabChange(tab)}
                  className={`h-10 rounded-lg text-sm font-semibold transition-all ${
                    active
                      ? 'bg-primary-600/25 text-primary-300 shadow-elev-1 ring-1 ring-inset ring-primary-500/40'
                      : 'text-ink-muted hover:text-ink-medium hover:bg-bg-overlay/50'
                  }`}
                >
                  {tab === 'COACH' ? t('coach_login') : t('client_login')}
                </button>
              );
            })}
          </div>

          <div className="px-8 pb-8">
            {error && <ErrorAlert message={error} />}

            <form
              onSubmit={activeTab === 'COACH' ? handleCoachSubmit : handleClientSubmit}
              className="space-y-4"
            >
              <Input
                label={t('email')}
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  autofillPasswordIfSaved(e.target.value);
                }}
                placeholder="email@example.com"
                leading={<Mail className="h-4 w-4" />}
              />

              <Input
                label={t('password')}
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leading={<Lock className="h-4 w-4" />}
              />

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAutoLogin(!isAutoLogin)}
                    className="flex items-center gap-1.5 text-sm text-ink-medium hover:text-ink-high transition-colors"
                  >
                    {isAutoLogin ? (
                      <CheckSquare className="h-5 w-5 text-primary-400" />
                    ) : (
                      <Square className="h-5 w-5 text-ink-faint" />
                    )}
                    {t('auto_login')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isSavePassword;
                      setIsSavePassword(next);
                      if (!next) clearCredentials();
                    }}
                    className="flex items-center gap-1.5 text-sm text-ink-medium hover:text-ink-high transition-colors"
                  >
                    {isSavePassword ? (
                      <CheckSquare className="h-5 w-5 text-primary-400" />
                    ) : (
                      <Square className="h-5 w-5 text-ink-faint" />
                    )}
                    비밀번호 저장
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowFindAccount(true);
                    resetForm();
                  }}
                  className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-primary-300 hover:underline transition-colors"
                >
                  <HelpCircle className="h-3 w-3" /> {t('find_account')}
                </button>
              </div>

              <Button
                type="submit"
                fullWidth
                size="lg"
                isLoading={isLoading}
                className="mt-2"
              >
                {t('login_btn')}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-ink-muted">
              <span>{t('no_account_yet')}</span>{' '}
              <button
                type="button"
                onClick={() => {
                  setShowSignup(true);
                  resetForm();
                }}
                className="font-semibold text-primary-300 hover:text-primary-200 hover:underline transition-colors"
              >
                {t('signup_btn')}
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Footer admin links */}
      <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-3 px-4">
        <button
          type="button"
          onClick={() => {
            setIsBranchAdminMode(true);
            resetForm();
          }}
          className="text-xs text-ink-faint transition-colors hover:text-ink-medium"
        >
          지점 관리자 로그인
        </button>
        <span className="text-ink-faint/50" aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => {
            setIsAdminMode(true);
            resetForm();
          }}
          className="text-xs text-ink-faint transition-colors hover:text-ink-medium"
        >
          {t('admin_login')}
        </button>
      </div>

      {/* Find account modal */}
      <Modal
        open={showFindAccount}
        onClose={() => {
          setShowFindAccount(false);
          resetForm();
        }}
        title={t('find_account')}
        size="sm"
      >
        <div className="-mx-6 mb-4 grid grid-cols-2 gap-1 border-b border-line-subtle px-6 pb-0">
          {(['EMAIL', 'PASSWORD'] as const).map((tab) => {
            const active = findTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setFindTab(tab);
                  resetForm();
                }}
                className={`-mb-px h-10 border-b-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary-400 text-primary-300'
                    : 'border-transparent text-ink-muted hover:text-ink-high'
                }`}
              >
                {tab === 'EMAIL' ? t('find_email_title') : t('find_pw_title')}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleFindAccount} className="space-y-4">
          {findResult && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                findResult.type === 'success'
                  ? 'border-primary-500/30 bg-primary-500/10 text-primary-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {findResult.type === 'success' ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span className="break-all">{findResult.message}</span>
            </div>
          )}

          {findTab === 'EMAIL' ? (
            <>
              <Input
                label={t('name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="가입시 등록한 이름"
              />
              <Input
                label={t('phone')}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
              />
            </>
          ) : (
            <>
              <Input
                label={t('email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일 주소"
              />
              <Input
                label={t('phone')}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
              />
            </>
          )}

          <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
            {t('find_btn')}
          </Button>
        </form>
      </Modal>
    </div>
  );
};
