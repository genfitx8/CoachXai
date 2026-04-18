
import React, { createContext, useState, useContext, ReactNode } from 'react';

export type Language = 'ko' | 'en' | 'ja';

type Translations = {
  [key in Language]: {
    [key: string]: string;
  };
};

const translations: Translations = {
  ko: {
    // Auth
    app_desc: "골프 레슨 분석 & 관리 플랫폼",
    coach_login: "코치님 로그인",
    client_login: "회원님 로그인",
    admin_login: "관리자 로그인",
    email: "이메일",
    password: "비밀번호",
    name: "이름",
    phone: "전화번호",
    phone_desc: "*레슨 기록 연동을 위해 정확한 번호를 입력해주세요.",
    auto_login: "자동 로그인",
    login_btn: "로그인",
    signup_btn: "회원가입",
    signup_msg: "계정이 없으신가요? 회원가입하기",
    login_msg: "이미 계정이 있으신가요? 로그인하기",
    admin_only: "시스템 관리자 전용 페이지입니다.",
    find_account: "아이디/비밀번호 찾기",
    find_email_title: "이메일(ID) 찾기",
    find_pw_title: "비밀번호 찾기",
    find_btn: "찾기",
    result_email: "회원님의 이메일은 다음과 같습니다:",
    result_pw: "회원님의 비밀번호는 다음과 같습니다:",
    not_found: "일치하는 정보를 찾을 수 없습니다.",
    // Unified login – role selection
    select_role_title: "어떤 역할로 로그인하시나요?",
    select_role_signup_title: "어떤 유형으로 가입하시나요?",
    coach_role_desc: "레슨 등록 및 회원 관리",
    member_role_desc: "레슨 확인 및 예약",
    continue_btn: "계속하기",
    role_label: "역할 선택",
    coach_short: "코치님",
    client_short: "회원님",
    phone_required: "(필수)",
    // Common
    logout: "로그아웃",
    cancel: "취소",
    save: "저장",
    confirm: "확인",
    delete: "삭제",
    edit: "수정",
    back: "돌아가기",
    loading: "로딩 중...",
    // Coach Dashboard
    coach_dashboard: "레슨 관리 대시보드",
    coach_dashboard_desc: "회원님의 레슨을 기록하고 관리하세요.",
    start_lesson: "레슨 시작",
    reservation_management: "예약 관리",
    no_lessons: "기록된 레슨이 없습니다",
    no_lessons_desc: "상단의 '레슨 시작' 버튼을 눌러 첫 레슨을 기록해보세요.",
    // Client Dashboard
    today_mission: "오늘의 미션",
    no_mission_today: "오늘 예정된 과제가 없습니다.",
    mission_manage: "미션 관리",
    ai_recommend: "AI 추천",
    stats: "데이터 통계",
    my_info: "내 정보 설정",
    recent_records: "최근 기록",
    no_records: "아직 기록이 없습니다",
    no_records_desc: "첫 연습이나 레슨을 기록해보세요!",
    // Roles
    coach: "프로",
    client: "회원",
  },
  en: {
    // Auth
    app_desc: "Golf Lesson Analysis & Management Platform",
    coach_login: "Coach Login",
    client_login: "Member Login",
    admin_login: "Admin Login",
    email: "Email",
    password: "Password",
    name: "Name",
    phone: "Phone Number",
    phone_desc: "*Please enter exact number to link records.",
    auto_login: "Auto Login",
    login_btn: "Log In",
    signup_btn: "Sign Up",
    signup_msg: "No account? Sign up",
    login_msg: "Have an account? Log in",
    admin_only: "System Administrator Access Only.",
    find_account: "Find ID/Password",
    find_email_title: "Find Email",
    find_pw_title: "Find Password",
    find_btn: "Find",
    result_email: "Your email address is:",
    result_pw: "Your password is:",
    not_found: "No matching account found.",
    // Unified login – role selection
    select_role_title: "How would you like to sign in?",
    select_role_signup_title: "How would you like to sign up?",
    coach_role_desc: "Manage lessons & members",
    member_role_desc: "View lessons & book sessions",
    continue_btn: "Continue",
    role_label: "Select Role",
    coach_short: "Coach",
    client_short: "Member",
    phone_required: "(Required)",
    // Common
    logout: "Log Out",
    cancel: "Cancel",
    save: "Save",
    confirm: "Confirm",
    delete: "Delete",
    edit: "Edit",
    back: "Back",
    loading: "Loading...",
    // Coach Dashboard
    coach_dashboard: "Lesson Dashboard",
    coach_dashboard_desc: "Manage and record student lessons.",
    start_lesson: "Start Lesson",
    reservation_management: "Reservations",
    no_lessons: "No lessons recorded",
    no_lessons_desc: "Click 'Start Lesson' to record your first lesson.",
    // Client Dashboard
    today_mission: "Today's Mission",
    no_mission_today: "No tasks scheduled for today.",
    mission_manage: "Manage",
    ai_recommend: "AI Suggest",
    stats: "Statistics",
    my_info: "My Profile",
    recent_records: "Recent Records",
    no_records: "No records yet",
    no_records_desc: "Record your first practice or lesson!",
    // Roles
    coach: "Pro",
    client: "Member",
  },
  ja: {
    // Auth
    app_desc: "ゴルフレッスン分析・管理プラットフォーム",
    coach_login: "コーチログイン",
    client_login: "会員ログイン",
    admin_login: "管理者ログイン",
    email: "メールアドレス",
    password: "パスワード",
    name: "名前",
    phone: "電話番号",
    phone_desc: "*記録連携のため正確な番号を入力してください。",
    auto_login: "自動ログイン",
    login_btn: "ログイン",
    signup_btn: "会員登録",
    signup_msg: "アカウントをお持ちでないですか？登録",
    login_msg: "すでにアカウントをお持ちですか？ログイン",
    admin_only: "システム管理者専用ページです。",
    find_account: "ID/パスワード検索",
    find_email_title: "メールアドレス検索",
    find_pw_title: "パスワード検索",
    find_btn: "検索",
    result_email: "あなたのメールアドレスは:",
    result_pw: "あなたのパスワードは:",
    not_found: "一致するアカウントが見つかりません。",
    // Unified login – role selection
    select_role_title: "どの役割でログインしますか？",
    select_role_signup_title: "どの役割で登録しますか？",
    coach_role_desc: "レッスン管理・会員管理",
    member_role_desc: "レッスン確認・予約",
    continue_btn: "続ける",
    role_label: "役割選択",
    coach_short: "コーチ",
    client_short: "会員",
    phone_required: "(必須)",
    // Common
    logout: "ログアウト",
    cancel: "キャンセル",
    save: "保存",
    confirm: "確認",
    delete: "削除",
    edit: "修正",
    back: "戻る",
    loading: "読み込み中...",
    // Coach Dashboard
    coach_dashboard: "レッスン管理",
    coach_dashboard_desc: "会員のレッスンを記録・管理します。",
    start_lesson: "レッスン開始",
    reservation_management: "予約管理",
    no_lessons: "記録されたレッスンがありません",
    no_lessons_desc: "'レッスン開始'ボタンを押して記録してください。",
    // Client Dashboard
    today_mission: "今日のミッション",
    no_mission_today: "今日の課題はありません。",
    mission_manage: "管理",
    ai_recommend: "AI推奨",
    stats: "データ統計",
    my_info: "設定",
    recent_records: "最近の記録",
    no_records: "記録がありません",
    no_records_desc: "最初の練習やレッスンを記録しましょう！",
    // Roles
    coach: "プロ",
    client: "会員",
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('ko');

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
