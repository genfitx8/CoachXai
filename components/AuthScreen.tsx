import React, { useState } from 'react';
import { Button } from './Button';
import { authService } from '../services/authService';
import {
  Activity,
  Mail,
  Lock,
  User,
  Smartphone,
  CheckCircle,
  CheckSquare,
  Square,
  ShieldCheck,
  ArrowLeft,
  PenTool,
  Globe,
  ChevronDown,
  HelpCircle,
  X,
  AlertCircle,
  Users,
  BookOpen,
} from 'lucide-react';
import { useLanguage } from './LanguageContext';

interface AuthScreenProps {
  onLoginSuccess: (
    role: 'COACH' | 'CLIENT' | 'ADMIN' | 'BRANCH_ADMIN',
    data: any,
    isAutoLogin: boolean
  ) => void;
}

/**
 * Unified login flow:
 *   Step 1 – CREDENTIALS: user enters email + password
 *   Step 2 – ROLE_SELECTION: user picks Coach or Member, then we authenticate
 *
 * Signup flow:
 *   Step 1 – SIGNUP_ROLE: user picks Coach or Member
 *   Step 2 – SIGNUP_FORM: user fills name / email / phone / password
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const { t, language, setLanguage } = useLanguage();

  // --- special admin modes (unchanged) ---
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isBranchAdminMode, setIsBranchAdminMode] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // --- unified login steps ---
  type LoginStep = 'CREDENTIALS' | 'ROLE_SELECTION';
  const [loginStep, setLoginStep] = useState<LoginStep>('CREDENTIALS');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');

  // --- signup ---
  const [isSignup, setIsSignup] = useState(false);
  const [signupRole, setSignupRole] = useState<'COACH' | 'CLIENT' | null>(null);

  // --- find account modal ---
  const [showFindAccount, setShowFindAccount] = useState(false);
  const [findTab, setFindTab] = useState<'EMAIL' | 'PASSWORD'>('EMAIL');
  const [findRole, setFindRole] = useState<'COACH' | 'CLIENT'>('COACH');
  const [findResult, setFindResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // --- form fields ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // --- branch admin fields ---
  const [branchAdminLoginId, setBranchAdminLoginId] = useState('');
  const [branchAdminPassword, setBranchAdminPassword] = useState('');

  const [isAutoLogin, setIsAutoLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── helpers ───────────────────────────────────────────────────────────────

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setPhone('');
    setBranchAdminLoginId('');
    setBranchAdminPassword('');
    setError(null);
    setSuccessMsg(null);
    setFindResult(null);
  };

  const goBackToCredentials = () => {
    setLoginStep('CREDENTIALS');
    setEmail(pendingEmail);
    setPassword(pendingPassword);
    // Note: error state is intentionally NOT cleared here so callers can
    // show an error on the credentials screen after a failed auth attempt.
  };

  // ── Step 1: validate credentials, advance to role selection ───────────────

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setPendingEmail(email);
    setPendingPassword(password);
    setError(null);
    setLoginStep('ROLE_SELECTION');
  };

  // ── Step 2: authenticate with chosen role ────────────────────────────────

  const handleRoleSelect = async (role: 'COACH' | 'CLIENT') => {
    setError(null);
    setIsLoading(true);
    try {
      if (role === 'COACH') {
        const profile = await authService.loginCoach(pendingEmail, pendingPassword);
        onLoginSuccess('COACH', profile, isAutoLogin);
      } else {
        const profile = await authService.loginClient(pendingEmail, pendingPassword);
        onLoginSuccess('CLIENT', profile, isAutoLogin);
      }
    } catch (err: any) {
      setError(err as string);
      goBackToCredentials();
    } finally {
      setIsLoading(false);
    }
  };

  // ── Signup handlers ───────────────────────────────────────────────────────

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupRole) return;
    setError(null);
    setIsLoading(true);
    try {
      if (signupRole === 'COACH') {
        const profile = await authService.signupCoach(name, email, password, phone);
        setSuccessMsg('코치 회원가입 완료! 로그인 중...');
        setTimeout(() => onLoginSuccess('COACH', profile, isAutoLogin), 1000);
      } else {
        const profile = await authService.signupClient(name, email, password, phone);
        setSuccessMsg('회원가입 완료! 로그인 중...');
        setTimeout(() => onLoginSuccess('CLIENT', profile, isAutoLogin), 1000);
      }
    } catch (err: any) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Admin / Branch-admin handlers (unchanged) ────────────────────────────

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
          setFindResult({
            type: 'error',
            message: '이름과 전화번호를 입력해주세요.',
          });
          return;
        }
        const result = await authService.findEmail(name, phone, findRole);
        if (result) {
          setFindResult({
            type: 'success',
            message: `${t('result_email')} ${result}`,
          });
        } else {
          setFindResult({ type: 'error', message: t('not_found') });
        }
      } else {
        if (!email || !phone) {
          setFindResult({
            type: 'error',
            message: '이메일과 전화번호를 입력해주세요.',
          });
          return;
        }
        const result = await authService.findPassword(email, phone, findRole);
        if (result) {
          setFindResult({
            type: 'success',
            message: `${t('result_pw')} ${result}`,
          });
        } else {
          setFindResult({ type: 'error', message: t('not_found') });
        }
      }
    } catch {
      setFindResult({ type: 'error', message: '오류가 발생했습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Language switcher (reused across screens) ────────────────────────────

  const LangSwitcher = () => (
    <div className="absolute top-4 right-4 z-50">
      <button
        onClick={() => setShowLangMenu(!showLangMenu)}
        className="bg-white/20 backdrop-blur-md text-white px-3 py-2 rounded-full text-xs font-bold flex items-center gap-2 hover:bg-white/30 transition-all shadow-sm border border-white/10"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>
          {language === 'ko' ? '한국어' : language === 'en' ? 'English' : '日本語'}
        </span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${showLangMenu ? 'rotate-180' : ''}`}
        />
      </button>
      {showLangMenu && (
        <div className="absolute right-0 mt-2 w-32 bg-white/95 backdrop-blur-xl rounded-xl shadow-xl border border-white/20 overflow-hidden animate-fade-in py-1">
          {[
            { code: 'ko', label: '한국어', flag: '🇰🇷' },
            { code: 'en', label: 'English', flag: '🇺🇸' },
            { code: 'ja', label: '日本語', flag: '🇯🇵' },
          ].map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code as any);
                setShowLangMenu(false);
              }}
              className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 hover:bg-gray-100 transition-colors ${
                language === lang.code
                  ? 'text-emerald-600 bg-emerald-50'
                  : 'text-gray-700'
              }`}
            >
              <span className="text-sm">{lang.flag}</span>
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── Shared page wrapper ───────────────────────────────────────────────────

  const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-900 flex items-center justify-center p-4 relative">
      <LangSwitcher />
      {children}
    </div>
  );

  // ── Branch Admin screen (unchanged) ──────────────────────────────────────

  if (isBranchAdminMode) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
          <div className="bg-emerald-700 p-8 text-center border-b border-emerald-800">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              <PenTool className="w-8 h-8 text-emerald-700" />
            </div>
            <h1 className="text-2xl font-bold text-white">지점 관리자 로그인</h1>
            <p className="text-emerald-100 text-sm mt-1">Branch Admin Login</p>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                <span className="font-bold flex-shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                  !
                </span>
                {error}
              </div>
            )}

            <form onSubmit={handleBranchAdminSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">
                  로그인 아이디
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={branchAdminLoginId}
                    onChange={(e) => setBranchAdminLoginId(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="예: 강남점:mina"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1 ml-1">
                  형식: 지점이름:유저이름 (예: 강남점:mina)
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">
                  {t('password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={branchAdminPassword}
                    onChange={(e) => setBranchAdminPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setIsAutoLogin(!isAutoLogin)}
              >
                {isAutoLogin ? (
                  <CheckSquare className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-300" />
                )}
                <span className="text-sm text-gray-600">{t('auto_login')}</span>
              </div>

              <Button
                type="submit"
                className="w-full py-3 mt-4 bg-emerald-700 hover:bg-emerald-800"
                isLoading={isLoading}
              >
                지점 관리자 로그인
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsBranchAdminMode(false);
                  resetForm();
                }}
                className="text-gray-400 text-sm hover:text-gray-600 flex items-center justify-center gap-1 mx-auto"
              >
                <ArrowLeft className="w-3 h-3" /> {t('back')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Admin screen (unchanged) ──────────────────────────────────────────────

  if (isAdminMode) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
          <div className="bg-red-600 p-8 text-center border-b border-red-700">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              <ShieldCheck className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-white">{t('admin_login')}</h1>
            <p className="text-red-100 text-sm mt-1">{t('admin_only')}</p>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                <span className="font-bold flex-shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                  !
                </span>
                {error}
              </div>
            )}

            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">
                  {t('email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                    placeholder="admin@swingnote.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">
                  {t('password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-3 mt-4 bg-gray-900 hover:bg-black"
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
                className="text-gray-400 text-sm hover:text-gray-600 flex items-center justify-center gap-1 mx-auto"
              >
                <ArrowLeft className="w-3 h-3" /> {t('back')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Role-selection card shared layout ────────────────────────────────────

  const RoleCards = ({
    title,
    onSelectCoach,
    onSelectClient,
    onBack,
  }: {
    title: string;
    onSelectCoach: () => void;
    onSelectClient: () => void;
    onBack: () => void;
  }) => {
    const handleBack = () => {
      setError(null);
      onBack();
    };

    return (
    <PageWrapper>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="bg-emerald-50 p-8 text-center border-b border-emerald-100">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Activity className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SwingNote</h1>
          <p className="text-emerald-700 text-sm mt-1">{title}</p>
        </div>

        {/* Role cards */}
        <div className="p-8 space-y-4">
          {error && (
            <div className="mb-2 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 animate-fade-in">
              <span className="font-bold flex-shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                !
              </span>
              {error}
            </div>
          )}

          {/* Coach card */}
          <button
            type="button"
            onClick={onSelectCoach}
            disabled={isLoading}
            className="w-full flex items-center gap-5 p-5 rounded-2xl border-2 border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group disabled:opacity-60"
          >
            <div className="w-14 h-14 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center flex-shrink-0 transition-colors">
              <BookOpen className="w-7 h-7 text-emerald-700" />
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-900 text-base">
                {t('coach')} ({t('coach_short')})
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{t('coach_role_desc')}</p>
            </div>
          </button>

          {/* Member card */}
          <button
            type="button"
            onClick={onSelectClient}
            disabled={isLoading}
            className="w-full flex items-center gap-5 p-5 rounded-2xl border-2 border-sky-200 hover:border-sky-500 hover:bg-sky-50 transition-all group disabled:opacity-60"
          >
            <div className="w-14 h-14 rounded-xl bg-sky-100 group-hover:bg-sky-200 flex items-center justify-center flex-shrink-0 transition-colors">
              <Users className="w-7 h-7 text-sky-700" />
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-900 text-base">
                {t('client')} ({t('client_short')})
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{t('member_role_desc')}</p>
            </div>
          </button>

          {isLoading && (
            <div className="flex justify-center pt-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          )}

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={handleBack}
              className="text-gray-400 text-sm hover:text-gray-600 flex items-center justify-center gap-1 mx-auto"
            >
              <ArrowLeft className="w-3 h-3" /> {t('back')}
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
    );
  };

  // ── Signup: Step 1 – choose role ─────────────────────────────────────────

  if (isSignup && signupRole === null) {
    return (
      <RoleCards
        title={t('select_role_signup_title')}
        onSelectCoach={() => {
          setSignupRole('COACH');
          resetForm();
        }}
        onSelectClient={() => {
          setSignupRole('CLIENT');
          resetForm();
        }}
        onBack={() => {
          setIsSignup(false);
          setSignupRole(null);
          resetForm();
        }}
      />
    );
  }

  // ── Signup: Step 2 – fill in details ─────────────────────────────────────

  if (isSignup && signupRole !== null) {
    const handleSignupBack = () => {
      setSignupRole(null);
      resetForm();
    };
    return (
      <PageWrapper>
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
          <div className={signupRole === 'COACH'
            ? 'bg-emerald-50 p-8 text-center border-b border-emerald-100'
            : 'bg-sky-50 p-8 text-center border-b border-sky-100'
          }>
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
              {signupRole === 'COACH' ? (
                <BookOpen className="w-8 h-8 text-emerald-600" />
              ) : (
                <Users className="w-8 h-8 text-sky-600" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">SwingNote</h1>
            <p className="text-sm mt-1 text-gray-500">
              {signupRole === 'COACH' ? t('coach_login') : t('client_login')} – {t('signup_btn')}
            </p>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 animate-fade-in">
                <span className="font-bold flex-shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">!</span>
                {error}
              </div>
            )}
            {successMsg && (
              <div className="mb-6 bg-emerald-50 text-emerald-600 text-sm p-3 rounded-lg flex items-center gap-2 animate-fade-in">
                <CheckCircle className="w-4 h-4" /> {successMsg}
              </div>
            )}

            <form onSubmit={handleSignupSubmit} className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">{t('name')}</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="Name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">{t('email')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">
                  {t('phone')} {signupRole === 'CLIENT' && t('phone_required')}
                </label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="010-0000-0000"
                  />
                </div>
                {signupRole === 'CLIENT' && (
                  <p className="text-[10px] text-gray-400 mt-1 ml-1">{t('phone_desc')}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">{t('password')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setIsAutoLogin(!isAutoLogin)}
              >
                {isAutoLogin ? (
                  <CheckSquare className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-300" />
                )}
                <span className="text-sm text-gray-600">{t('auto_login')}</span>
              </div>

              <Button type="submit" className="w-full py-3 mt-4" isLoading={isLoading}>
                {t('signup_btn')}
              </Button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={handleSignupBack}
                  className="text-sm text-gray-500 hover:text-emerald-600 flex items-center justify-center gap-1 mx-auto"
                >
                  <ArrowLeft className="w-3 h-3" /> {t('role_label')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </PageWrapper>
    );
  }

  // ── Login: Step 2 – role selection ────────────────────────────────────────

  if (loginStep === 'ROLE_SELECTION') {
    return (
      <RoleCards
        title={t('select_role_title')}
        onSelectCoach={() => handleRoleSelect('COACH')}
        onSelectClient={() => handleRoleSelect('CLIENT')}
        onBack={goBackToCredentials}
      />
    );
  }

  // ── Login: Step 1 – unified credentials ──────────────────────────────────

  return (
    <PageWrapper>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
        {/* App header */}
        <div className="bg-emerald-50 p-8 text-center border-b border-emerald-100">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Activity className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SwingNote</h1>
          <p className="text-emerald-700 text-sm mt-1">{t('app_desc')}</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 animate-fade-in">
              <span className="font-bold flex-shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                !
              </span>
              {error}
            </div>
          )}

          <form onSubmit={handleCredentialsSubmit} className="space-y-4 animate-fade-in">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">
                {t('email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 ml-1 uppercase">
                {t('password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between select-none">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setIsAutoLogin(!isAutoLogin)}
              >
                {isAutoLogin ? (
                  <CheckSquare className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-300" />
                )}
                <span className="text-sm text-gray-600">{t('auto_login')}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowFindAccount(true);
                  resetForm();
                }}
                className="text-xs text-gray-500 hover:text-emerald-600 hover:underline flex items-center gap-1"
              >
                <HelpCircle className="w-3 h-3" /> {t('find_account')}
              </button>
            </div>

            <Button type="submit" className="w-full py-3 mt-4" isLoading={isLoading}>
              {t('continue_btn')}
            </Button>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsSignup(true);
                  setSignupRole(null);
                  resetForm();
                }}
                className="text-sm text-gray-500 hover:text-emerald-600 underline"
              >
                {t('signup_msg')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Admin / Branch Admin Login Links */}
      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4">
        <button
          onClick={() => {
            setIsBranchAdminMode(true);
            resetForm();
          }}
          className="text-xs text-white/50 hover:text-white transition-colors"
        >
          지점 관리자 로그인
        </button>
        <span className="text-white/20 text-xs">|</span>
        <button
          onClick={() => {
            setIsAdminMode(true);
            resetForm();
          }}
          className="text-xs text-white/50 hover:text-white transition-colors"
        >
          {t('admin_login')}
        </button>
      </div>

      {/* Find Account Modal */}
      {showFindAccount && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 flex justify-between items-center border-b border-gray-200">
              <h3 className="font-bold text-gray-800">{t('find_account')}</h3>
              <button
                onClick={() => {
                  setShowFindAccount(false);
                  resetForm();
                }}
                className="text-gray-500 hover:text-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Role selector for find account */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setFindRole('COACH')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                  findRole === 'COACH'
                    ? 'text-emerald-600 border-b-2 border-emerald-600 bg-white'
                    : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {t('coach_login')}
              </button>
              <button
                onClick={() => setFindRole('CLIENT')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                  findRole === 'CLIENT'
                    ? 'text-emerald-600 border-b-2 border-emerald-600 bg-white'
                    : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {t('client_login')}
              </button>
            </div>

            <div className="flex border-b border-gray-200">
              <button
                onClick={() => {
                  setFindTab('EMAIL');
                  resetForm();
                }}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${
                  findTab === 'EMAIL'
                    ? 'text-emerald-600 border-b-2 border-emerald-600 bg-white'
                    : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {t('find_email_title')}
              </button>
              <button
                onClick={() => {
                  setFindTab('PASSWORD');
                  resetForm();
                }}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${
                  findTab === 'PASSWORD'
                    ? 'text-emerald-600 border-b-2 border-emerald-600 bg-white'
                    : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {t('find_pw_title')}
              </button>
            </div>

            <form onSubmit={handleFindAccount} className="p-6 space-y-4">
              {findResult && (
                <div
                  className={`p-3 rounded-lg text-sm mb-4 flex items-start gap-2 ${
                    findResult.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-red-50 text-red-600'
                  }`}
                >
                  {findResult.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <span className="break-all">{findResult.message}</span>
                </div>
              )}

              {findTab === 'EMAIL' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
                      {t('name')}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="가입시 등록한 이름"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
                      {t('phone')}
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="010-0000-0000"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
                      {t('email')}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="이메일 주소"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
                      {t('phone')}
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="010-0000-0000"
                    />
                  </div>
                </>
              )}

              <Button type="submit" className="w-full py-3" isLoading={isLoading}>
                {t('find_btn')}
              </Button>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};
