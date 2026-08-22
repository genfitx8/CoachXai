import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Card } from './ui/Card';
import { CoachXMark, CoachXLogo } from './ui';
import { Input, PasswordInput } from './ui/Input';
import { Modal } from './ui/Modal';
import { authService } from '../services/authService';
import { consentService } from '../services/consentService';
import {
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
import { APP_VARIANT, IS_COACH_APP, IS_STUDENT_APP } from '../utils/appVariant';

// In the split coach/student native builds we lock the login to a single
// role. The web / dev / test build (APP_VARIANT === null) keeps the tab
// switcher and every entry point exposed.
const FORCED_TAB: 'COACH' | 'CLIENT' | null = IS_COACH_APP
  ? 'COACH'
  : IS_STUDENT_APP
    ? 'CLIENT'
    : null;
const SHOW_TAB_SWITCHER = FORCED_TAB === null;
const SHOW_ADMIN_ENTRY = APP_VARIANT === null || IS_COACH_APP;

const SAVED_LOGIN_ID_KEY = 'swingnote_saved_login_id';
// 인증번호 재발송 대기 시간(초). 메일 발송을 동반하므로 연타를 막는다.
const VERIFICATION_RESEND_COOLDOWN_SEC = 60;
const REMEMBER_PASSWORD_PREF_KEY = 'swingnote_remember_password';

interface SavedLoginId {
  email: string;
  role: 'COACH' | 'CLIENT';
}

interface AuthScreenProps {
  onLoginSuccess: (
    role: 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN',
    data: any
  ) => void;
}

// ─── Local helpers ────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'ko' as const, label: '한국어',   flag: '🇰🇷' },
  { code: 'en' as const, label: 'English',  flag: '🇺🇸' },
  { code: 'ja' as const, label: '日本語',   flag: '🇯🇵' },
  { code: 'th' as const, label: 'ภาษาไทย', flag: '🇹🇭' },
];

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const InfoAlert: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="status"
    className="flex items-center gap-2 rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-2.5 text-sm text-primary-200"
  >
    <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

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
    if (FORCED_TAB) return FORCED_TAB;
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

  const [signupSuccess, setSignupSuccess] = useState(false);

  /**
   * 가입 이메일 인증. 서버가 보낸 6자리 코드를 확인해야 가입 버튼이
   * 통과한다. `verifiedEmail`에 확인이 끝난 주소를 그대로 담아 두고 현재
   * 입력값과 비교하므로, 인증 후 이메일을 고치면 인증이 자동으로 풀린다.
   */
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isConsentChecked, setIsConsentChecked] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  /**
   * AI 학습 활용 동의 — 선택(opt-in). 이 동의가 있어야 프롬프트·응답
   * 원문이 저장되고 학습 데이터셋에 포함된다(docs/DATA_ARCHITECTURE.md §8.2).
   * 소급 동의가 불가능하므로 가입 시점에 물어본다.
   */
  const [isAiConsentChecked, setIsAiConsentChecked] = useState(false);

  const [branchAdminLoginId, setBranchAdminLoginId] = useState('');
  const [branchAdminPassword, setBranchAdminPassword] = useState('');

  const [isRememberId, setIsRememberId] = useState(() => {
    try {
      return !!localStorage.getItem(SAVED_LOGIN_ID_KEY);
    } catch {
      return false;
    }
  });
  const [isRememberPassword, setIsRememberPassword] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_PASSWORD_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetEmailVerification = () => {
    setVerificationCode('');
    setVerificationSentTo(null);
    setVerifiedEmail(null);
    setVerificationNotice(null);
    setResendCooldown(0);
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setPhone('');
    setSignupSuccess(false);
    resetEmailVerification();
    setIsConsentChecked(false);
    setBranchAdminLoginId('');
    setBranchAdminPassword('');
    setError(null);
    setFindResult(null);
  };

  // Load saved login id on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_LOGIN_ID_KEY);
      if (!raw) return;
      const savedLoginId: SavedLoginId = JSON.parse(raw);
      setEmail(savedLoginId.email);
      setActiveTab(savedLoginId.role);
      setIsRememberId(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (!isRememberPassword || typeof navigator === 'undefined') return;
    const credentialsApi = navigator.credentials;
    if (!credentialsApi || typeof credentialsApi.get !== 'function') return;

    let cancelled = false;
    const loadSavedPassword = async () => {
      try {
        const credential = (await credentialsApi.get({
          password: true,
          mediation: 'optional',
        } as CredentialRequestOptions)) as PasswordCredential | null;
        if (!credential || cancelled) return;
        if (typeof credential.id === 'string' && credential.id) {
          setEmail(credential.id);
        }
        if (typeof credential.password === 'string' && credential.password) {
          setPassword(credential.password);
        }
      } catch {}
    };

    void loadSavedPassword();
    return () => {
      cancelled = true;
    };
  }, [isRememberPassword]);

  // 재발송 대기 카운트다운. 버튼 라벨에 남은 초를 그대로 보여준다.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((sec) => (sec <= 1 ? 0 : sec - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleTabChange = (tab: 'COACH' | 'CLIENT') => {
    setActiveTab(tab);
    try {
      localStorage.setItem(AUTH_USER_TYPE_STORAGE_KEY, tab);
    } catch {
      // localStorage가 차단된 환경(예: private mode)에서도 로그인은 계속 가능해야 함
    }
    resetForm();
  };

  const saveLoginId = (email: string, role: 'COACH' | 'CLIENT') => {
    try {
      localStorage.setItem(SAVED_LOGIN_ID_KEY, JSON.stringify({ email, role }));
    } catch {}
  };

  const clearLoginId = () => {
    try {
      localStorage.removeItem(SAVED_LOGIN_ID_KEY);
    } catch {}
  };

  const setRememberPasswordPref = (remember: boolean) => {
    try {
      if (remember) {
        localStorage.setItem(REMEMBER_PASSWORD_PREF_KEY, '1');
      } else {
        localStorage.removeItem(REMEMBER_PASSWORD_PREF_KEY);
      }
    } catch {}
  };

  const saveBrowserCredential = async (loginEmail: string, loginPassword: string) => {
    if (
      typeof navigator === 'undefined' ||
      typeof window === 'undefined' ||
      typeof PasswordCredential === 'undefined'
    ) {
      return;
    }
    const credentialsApi = navigator.credentials;
    if (!credentialsApi || typeof credentialsApi.store !== 'function') return;

    const form = document.createElement('form');
    try {
      form.method = 'post';
      form.action = window.location.href;
      form.style.position = 'fixed';
      form.style.opacity = '0';
      form.style.pointerEvents = 'none';

      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.name = 'email';
      emailInput.autocomplete = 'username';
      emailInput.value = loginEmail;

      const passwordInput = document.createElement('input');
      passwordInput.type = 'password';
      passwordInput.name = 'password';
      passwordInput.autocomplete = 'current-password';
      passwordInput.value = loginPassword;

      form.appendChild(emailInput);
      form.appendChild(passwordInput);
      document.body.appendChild(form);
      const credential = new PasswordCredential(form);
      await credentialsApi.store(credential);
    } catch {} finally {
      if (form.isConnected) {
        form.remove();
      }
    }
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
      if (isRememberPassword) {
        setRememberPasswordPref(true);
        saveLoginId(loginEmail, role);
        await saveBrowserCredential(loginEmail, loginPassword);
      } else if (isRememberId) {
        setRememberPasswordPref(false);
        saveLoginId(loginEmail, role);
      } else {
        setRememberPasswordPref(false);
        clearLoginId();
      }
      onLoginSuccess(role, profile);
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
      onLoginSuccess('ADMIN', {});
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
      onLoginSuccess('BRANCH_ADMIN', result);
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

  // 인증을 끝낸 주소와 지금 입력된 주소가 같을 때만 "인증됨"이다.
  const isEmailVerified = !!verifiedEmail && verifiedEmail === normalizeEmail(email);
  const isCodeInputVisible =
    !!verificationSentTo && verificationSentTo === normalizeEmail(email) && !isEmailVerified;

  const handleSendVerificationCode = async () => {
    setError(null);
    setVerificationNotice(null);

    if (!email.trim()) {
      setError(t('verify_email_first'));
      return;
    }

    setIsSendingCode(true);
    try {
      const { expiresInMinutes } = await authService.requestSignupEmailVerification(
        activeTab,
        email
      );
      setVerificationSentTo(normalizeEmail(email));
      setVerifiedEmail(null);
      setVerificationCode('');
      setResendCooldown(VERIFICATION_RESEND_COOLDOWN_SEC);
      setVerificationNotice(
        t('verify_code_sent').replace('{minutes}', String(expiresInMinutes))
      );
    } catch (err: any) {
      setError(typeof err === 'string' ? err : t('verify_send_failed'));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirmVerificationCode = async () => {
    setError(null);
    setVerificationNotice(null);

    if (!verificationCode.trim()) {
      setError(t('verify_code_required'));
      return;
    }

    setIsVerifyingCode(true);
    try {
      await authService.confirmSignupEmailVerification(activeTab, email, verificationCode);
      setVerifiedEmail(normalizeEmail(email));
      setVerificationNotice(t('verify_done'));
    } catch (err: any) {
      setError(typeof err === 'string' ? err : t('verify_code_mismatch'));
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !password || !phone.trim()) {
      setError(t('signup_required_fields'));
      return;
    }
    if (password.length < 8) {
      setError(t('signup_pw_min'));
      return;
    }
    if (!isEmailVerified) {
      setError(t('verify_required'));
      return;
    }
    if (!isConsentChecked) {
      setError(t('signup_consent_required'));
      return;
    }

    setIsLoading(true);
    try {
      if (activeTab === 'COACH') {
        const coach = await authService.signupCoach(name, email, password, phone);
        // 토큰이 생긴 직후에 기록한다. 실패해도 가입은 진행 — 동의는
        // 설정에서 다시 켤 수 있지만 가입 실패는 되돌릴 수 없다.
        consentService.setAtSignup('ai_training', isAiConsentChecked);
        onLoginSuccess('COACH', coach);
      } else {
        const client = await authService.signupClient(name, email, password, phone);
        consentService.setAtSignup('ai_training', isAiConsentChecked);
        onLoginSuccess('CLIENT', client);
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
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
              <CoachXMark size={32} tone="dark" />
            </div>
            <h1 className="text-display-sm font-semibold text-white">{t('signup_title')}</h1>
            <p className="mt-1 text-sm text-primary-100">CoachX AI</p>
          </div>

          <div className="p-7">
            {/* Role tabs (hidden in the split coach/student native builds) */}
            {SHOW_TAB_SWITCHER && (
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
                        // 인증은 역할별로 발급된다(서버가 coach/client를
                        // 따로 본다). 탭을 바꾸면 다시 받아야 한다.
                        resetEmailVerification();
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
            )}

            {error && <ErrorAlert message={error} />}

            <form onSubmit={handleSignup} className="space-y-4">
              <Input
                label={t('name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('name_placeholder')}
                leading={<User className="h-4 w-4" />}
                autoComplete="name"
              />
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <Input
                    label={t('email')}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      // 주소를 고치면 인증이 풀린다. 직전 안내("발송했습니다"
                      // / "인증 완료")를 남겨두면 아직 유효한 것처럼 읽힌다.
                      setVerificationNotice(null);
                    }}
                    placeholder="email@example.com"
                    leading={<Mail className="h-4 w-4" />}
                    autoComplete="email"
                    containerClassName="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSendVerificationCode}
                    isLoading={isSendingCode}
                    disabled={isEmailVerified || resendCooldown > 0}
                    className="shrink-0"
                  >
                    {isEmailVerified
                      ? t('verify_completed')
                      : resendCooldown > 0
                        ? t('verify_resend_in').replace('{seconds}', String(resendCooldown))
                        : verificationSentTo
                          ? t('verify_resend')
                          : t('verify_send_code')}
                  </Button>
                </div>

                {isCodeInputVisible && (
                  <div className="flex items-end gap-2">
                    <Input
                      label={t('verify_code_label')}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      onKeyDown={(e) => {
                        // 폼 안이라 Enter가 가입 제출로 새어 나간다. 이 칸의
                        // Enter는 인증 확인으로 받는다.
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleConfirmVerificationCode();
                        }
                      }}
                      placeholder="000000"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      leading={<ShieldCheck className="h-4 w-4" />}
                      containerClassName="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={handleConfirmVerificationCode}
                      isLoading={isVerifyingCode}
                      className="shrink-0"
                    >
                      {t('verify_confirm')}
                    </Button>
                  </div>
                )}

                {verificationNotice && <InfoAlert message={verificationNotice} />}
              </div>
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
              <PasswordInput
                label={t('password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                helper={t('signup_pw_min')}
                leading={<Lock className="h-4 w-4" />}
                autoComplete="new-password"
              />

              <div className="rounded-lg border border-line-subtle bg-bg-inset">
                <button
                  type="button"
                  onClick={() => setIsConsentChecked((v) => !v)}
                  className="flex w-full items-start gap-2.5 px-3 pt-3 pb-2 text-left transition-colors"
                >
                  {isConsentChecked ? (
                    <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" />
                  ) : (
                    <Square className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  )}
                  <span className="text-sm leading-snug text-ink-medium">
                    {t('signup_consent_label')}
                  </span>
                </button>
                <div className="px-3 pb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowConsentModal(true); }}
                    className="text-xs text-primary-400 hover:text-primary-500 underline underline-offset-2 transition-colors"
                  >
                    {t('consent_view_detail')}
                  </button>
                </div>
              </div>

              {/* AI 학습 활용 — 선택 동의. 끄고 가입해도 모든 기능이 그대로
                  동작하며, 나중에 설정에서 켤 수 있다. */}
              <div className="rounded-lg border border-line-subtle bg-bg-inset">
                <button
                  type="button"
                  onClick={() => setIsAiConsentChecked((v) => !v)}
                  className="flex w-full items-start gap-2.5 px-3 pt-3 pb-1 text-left transition-colors"
                >
                  {isAiConsentChecked ? (
                    <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" />
                  ) : (
                    <Square className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  )}
                  <span className="text-sm leading-snug text-ink-medium">
                    {t('signup_ai_consent_label')}
                  </span>
                </button>
                <p className="px-3 pb-3 pl-[38px] text-xs leading-relaxed text-ink-faint">
                  {t('signup_ai_consent_hint')}
                </p>
              </div>

              <Modal
                open={showConsentModal}
                onClose={() => setShowConsentModal(false)}
                title={t('consent_modal_title')}
                size="lg"
                footer={
                  <div className="flex gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setShowConsentModal(false)}>
                      {t('consent_modal_close')}
                    </Button>
                    <Button size="sm" onClick={() => { setIsConsentChecked(true); setShowConsentModal(false); }}>
                      {t('consent_modal_agree')}
                    </Button>
                  </div>
                }
              >
                <div className="space-y-5 text-sm text-ink-medium">
                  <section>
                    <h3 className="font-semibold text-ink-high mb-1">{t('consent_purpose_title')}</h3>
                    <p className="leading-relaxed">{t('consent_purpose_body')}</p>
                  </section>
                  <section>
                    <h3 className="font-semibold text-ink-high mb-1">{t('consent_items_title')}</h3>
                    <p className="leading-relaxed">{t('consent_items_body')}</p>
                  </section>
                  <section>
                    <h3 className="font-semibold text-ink-high mb-1">{t('consent_retention_title')}</h3>
                    <p className="leading-relaxed">{t('consent_retention_body')}</p>
                  </section>
                  <section>
                    <h3 className="font-semibold text-ink-high mb-1">{t('consent_rights_title')}</h3>
                    <p className="leading-relaxed">{t('consent_rights_body')}</p>
                  </section>
                </div>
              </Modal>

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
              <PasswordInput
                label={t('password')}
                value={branchAdminPassword}
                onChange={(e) => setBranchAdminPassword(e.target.value)}
                placeholder="••••••••"
                leading={<Lock className="h-4 w-4" />}
              />

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
                placeholder="admin@coachx.kr"
                leading={<Mail className="h-4 w-4" />}
              />
              <PasswordInput
                label={t('password')}
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
        <div className="absolute left-1/2 top-1/4 h-[200px] w-[200px] -translate-x-1/2 rounded-full bg-cyan-500/6 blur-3xl" />
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
          <div className="relative overflow-hidden px-8 pt-10 pb-6 text-center">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 -translate-y-1/4 rounded-full bg-cyan-500/8 blur-3xl" />
              <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/4 rounded-full bg-primary-600/10 blur-2xl" />
            </div>
            <div className="relative mx-auto mb-5 flex flex-col items-center gap-2">
              <CoachXLogo size={44} orientation="vertical" tone="dark" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t('app_desc')}</p>
          </div>

          {/* Login type tabs (hidden in the split coach/student native builds) */}
          {SHOW_TAB_SWITCHER && (
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
          )}
          {!SHOW_TAB_SWITCHER && <div className="mb-6" />}

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
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                placeholder="email@example.com"
                leading={<Mail className="h-4 w-4" />}
              />

              <PasswordInput
                label={t('password')}
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
                    onClick={() => {
                      const next = !isRememberId;
                      setIsRememberId(next);
                      if (!next) {
                        setIsRememberPassword(false);
                        setRememberPasswordPref(false);
                        clearLoginId();
                      }
                    }}
                    className="flex items-center gap-1.5 text-sm text-ink-medium hover:text-ink-high transition-colors"
                  >
                    {isRememberId ? (
                      <CheckSquare className="h-5 w-5 text-primary-400" />
                    ) : (
                      <Square className="h-5 w-5 text-ink-faint" />
                    )}
                    {t('remember_id')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isRememberPassword;
                      setIsRememberPassword(next);
                      if (next) {
                        setIsRememberId(true);
                        setRememberPasswordPref(true);
                        return;
                      }
                      setRememberPasswordPref(false);
                    }}
                    className="flex items-center gap-1.5 text-sm text-ink-medium hover:text-ink-high transition-colors"
                  >
                    {isRememberPassword ? (
                      <CheckSquare className="h-5 w-5 text-primary-400" />
                    ) : (
                      <Square className="h-5 w-5 text-ink-faint" />
                    )}
                    {t('remember_password')}
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
                disabled={isLoading}
                className="mt-2"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin text-current" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    AI 연결 중...
                  </span>
                ) : t('login_btn')}
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

      {/* Footer admin links — hidden in the student-only build */}
      {SHOW_ADMIN_ENTRY && (
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
      )}

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
