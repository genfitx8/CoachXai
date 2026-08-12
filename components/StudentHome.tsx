import React, { useEffect, useMemo, useState } from 'react';
import { Menu, Bell } from 'lucide-react';
import { ClientProfile, CoachProfile, Homework, Lesson, QuickLogEntry, StudentContext } from '../types';
import { StudentAIChat } from './StudentAIChat';
import { StudentHomeCards } from './StudentHomeCards';
import { useLanguage } from './LanguageContext';
import { buildContextAwareGreeting, getStudentContext } from '../services/studentContextService';

interface StudentHomeProps {
  clientProfile: ClientProfile;
  myLessons: Lesson[];
  homeworkList: Homework[];
  quickLogs?: QuickLogEntry[];
  coachProfile?: CoachProfile;
  onOpenMenu: () => void;
  onOpenNotifications?: () => void;
  unreadNotifications?: number;
  /**
   * Tap a lesson card in the home banner → open that lesson's detail.
   * Optional: when omitted the card is still rendered but unclickable.
   */
  onOpenLesson?: (lessonId: string) => void;
  /** Toggle a homework item's completion state from the drill card. */
  onToggleHomework?: (homeworkId: string, isCompleted: boolean) => void;
  /** Tap the upload chip in the drill card → open the practice upload flow. */
  onUploadPractice?: (homeworkId: string) => void;
}

/**
 * Student AI Home — the app's primary screen after login.
 *
 * Loads the server-side StudentContext, uses it to compose a contextual
 * greeting, then renders the existing StudentAIChat with the greeting +
 * a hamburger-anchored header instead of a back button. Chat mode is the
 * default; the voice mode toggle remains available inside the chat UI.
 */
export const StudentHome: React.FC<StudentHomeProps> = ({
  clientProfile,
  myLessons,
  homeworkList,
  quickLogs = [],
  coachProfile,
  onOpenMenu,
  onOpenNotifications,
  unreadNotifications = 0,
  onOpenLesson,
  onToggleHomework,
  onUploadPractice,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const clientId = `${clientProfile.name}_${clientProfile.phone}`.trim();
  const [ctx, setCtx] = useState<StudentContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getStudentContext(clientId).then(loaded => {
      if (!cancelled) setCtx(loaded);
    });
    return () => { cancelled = true; };
  }, [clientId]);

  // Sorted view of this student's lessons, freshest first — used for greeting
  // heuristics ("recent swing", "recent lesson"). We keep it local so the
  // greeting recomputes when new lessons stream in from the coach.
  const sortedLessons = useMemo(
    () => [...myLessons].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [myLessons]
  );

  const greeting = useMemo(() => {
    // Context is optional — if it hasn't loaded yet we still produce a
    // reasonable greeting from lessons + homework alone. The rule-based
    // builder tolerates an empty ctx.
    return buildContextAwareGreeting({
      profile: clientProfile,
      ctx: ctx ?? {
        clientId,
        clubProfiles: [],
        recentRounds: [],
        swingFaultHistory: [],
        emotionLog: [],
        coachFeedbackDigest: [],
        goals: [],
        updatedAt: 0,
      },
      recentLessons: sortedLessons,
      homeworkList,
      language: lang,
    });
  }, [clientProfile, ctx, clientId, sortedLessons, homeworkList, lang]);

  const menuButton = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="p-2 rounded-lg text-ink-high hover:bg-white/10 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      {onOpenNotifications && (
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label="Notifications"
          className="relative p-2 rounded-lg text-ink-high hover:bg-white/10 transition-colors"
        >
          <Bell className="w-5 h-5" />
          {unreadNotifications > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </button>
      )}
    </div>
  );

  const homeBanner = (
    <StudentHomeCards
      lessons={sortedLessons}
      homework={homeworkList}
      onOpenLesson={onOpenLesson}
      onToggleHomework={onToggleHomework}
      onUploadPractice={onUploadPractice}
    />
  );

  return (
    <StudentAIChat
      clientProfile={clientProfile}
      myLessons={myLessons}
      homeworkList={homeworkList}
      quickLogs={quickLogs}
      coachProfile={coachProfile}
      onBack={() => { /* home has no back destination */ }}
      initialGreeting={greeting}
      defaultMode="chat"
      hideModeSelector
      hideBackButton
      headerLeftSlot={menuButton}
      topBannerSlot={homeBanner}
    />
  );
};
