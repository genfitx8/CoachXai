import React, { useMemo } from 'react';
import { Lesson, ClientProfile, CoachProfile } from '../types';
import { useLanguage } from './LanguageContext';

interface CoachHomeGreenReadingProps {
  coachProfile: CoachProfile;
  allLessons: Lesson[];
  clients: ClientProfile[];
  onBack: () => void;
  onOpenChat: (initialQuery?: string) => void;
}

const COLORS = {
  forest: '#0f261e',
  forestSoft: 'rgba(15,38,30,0.92)',
  cream: '#f2f0e9',
  creamSoft: '#dcd8c8',
  moss: '#9db8a9',
  mossDim: '#89a795',
  mossFaint: '#5f7d6c',
  sage: '#7fa88f',
  rust: '#c1442d',
  rustDeep: '#8a2f1f',
  amber: '#d1a24a',
} as const;

const line = (opacity: number) => `rgba(242,240,233,${opacity})`;

const getLocalISODate = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekBounds = (ref = new Date()) => {
  const d = new Date(ref);
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
};

type Category = 'swing' | 'field' | 'fit' | 'other';

const categorizeLesson = (lesson: Lesson): Category => {
  const t = `${lesson.title ?? ''} ${(lesson.tags ?? []).join(' ')}`.toLowerCase();
  if (/(field|필드|코스|파3|round|라운드)/.test(t)) return 'field';
  if (/(fit|피팅|드라이버 피팅|club fit)/.test(t)) return 'fit';
  if (/(swing|스윙|iron|드라이버)/.test(t) || lesson.recordType === 'LESSON') return 'swing';
  return 'other';
};

const CATEGORY_STYLES: Record<Category, { dot: string; label: (lang: string) => string }> = {
  swing: {
    dot: COLORS.sage,
    label: (l) => (l === 'en' ? 'Swing Analysis' : l === 'ja' ? 'スイング分析' : '스윙 분석'),
  },
  field: {
    dot: COLORS.rust,
    label: (l) => (l === 'en' ? 'Field Lesson' : l === 'ja' ? 'フィールドレッスン' : '필드 레슨'),
  },
  fit: {
    dot: COLORS.amber,
    label: (l) => (l === 'en' ? 'Club Fitting' : l === 'ja' ? 'クラブフィッティング' : '피팅 상담'),
  },
  other: {
    dot: COLORS.moss,
    label: (l) => (l === 'en' ? 'Session' : l === 'ja' ? 'セッション' : '세션'),
  },
};

const formatTimeFromLesson = (lesson: Lesson): string => {
  const raw = (lesson as unknown as { time?: string }).time;
  if (raw && /^\d{1,2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  const created = (lesson as unknown as { createdAt?: number }).createdAt;
  if (typeof created === 'number') {
    const d = new Date(created);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return '--:--';
};

const formatHeaderDate = (lang: string, d = new Date()): string => {
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  }
  if (lang === 'ja') {
    return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  }
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
};

const t = (lang: string, ko: string, en: string, ja: string) =>
  lang === 'en' ? en : lang === 'ja' ? ja : ko;

export const CoachHomeGreenReading: React.FC<CoachHomeGreenReadingProps> = ({
  coachProfile,
  allLessons,
  clients,
  onBack,
  onOpenChat,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const todayIso = getLocalISODate();
  const { start: weekStart, end: weekEnd } = getWeekBounds();

  const todayLessons = useMemo(() => {
    return allLessons
      .filter((l) => l.date === todayIso)
      .sort((a, b) => formatTimeFromLesson(a).localeCompare(formatTimeFromLesson(b)));
  }, [allLessons, todayIso]);

  const weekLessonCount = useMemo(() => {
    return allLessons.filter((l) => {
      if (!l.date) return false;
      const d = new Date(l.date);
      return d >= weekStart && d <= weekEnd;
    }).length;
  }, [allLessons, weekStart, weekEnd]);

  const weeklyGoal = 25;
  const weekProgressPct = Math.min(100, Math.round((weekLessonCount / weeklyGoal) * 100));

  const activeClientCount = useMemo(() => {
    const activeIso = getLocalISODate(new Date(Date.now() - 30 * 24 * 3600 * 1000));
    const recent = new Set(
      allLessons.filter((l) => (l.date ?? '') >= activeIso).map((l) => l.clientName)
    );
    return recent.size || clients.length;
  }, [allLessons, clients]);

  const cumulativeHoursThisWeek = useMemo(() => {
    return (weekLessonCount * 0.8).toFixed(1);
  }, [weekLessonCount]);

  const agentHighlight = useMemo(() => {
    const withAi = allLessons
      .filter((l) => l.aiAnalysis && l.aiAnalysis.trim().length > 0)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const top = withAi[0];
    if (!top) {
      return t(
        lang,
        '오늘 예정된 세션을 확인해 주세요',
        'Review your scheduled sessions today',
        '本日の予定セッションをご確認ください'
      );
    }
    return t(
      lang,
      `${top.clientName} 학생 스윙 분석이 준비됐어요`,
      `${top.clientName}'s swing analysis is ready`,
      `${top.clientName}さんのスイング分析が準備できました`
    );
  }, [allLessons, lang]);

  const greetingName = coachProfile.name || 'Coach';
  const subtitle = `${formatHeaderDate(lang)} · ${t(
    lang,
    `오늘 ${todayLessons.length}개 세션`,
    `${todayLessons.length} sessions today`,
    `本日${todayLessons.length}件のセッション`
  )}`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: COLORS.forest, color: COLORS.cream, fontFamily: "'Inter', sans-serif" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.3,
          background: `repeating-radial-gradient(ellipse 620px 420px at 82% 4%,
            transparent 0px, transparent 26px,
            rgba(242,240,233,0.06) 27px, rgba(242,240,233,0.06) 28px)`,
        }}
      />

      <div
        className="relative flex-1 overflow-y-auto"
        style={{ paddingBottom: 96, scrollbarWidth: 'none' }}
      >
        <div className="mx-auto w-full max-w-[420px] px-5 pt-3 pb-6">
          <header
            className="flex items-center justify-between pb-4 mb-5"
            style={{ borderBottom: `1px solid ${line(0.12)}` }}
          >
            <div>
              <div
                className="text-[22px] font-semibold tracking-tight"
                style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
              >
                {t(lang, `안녕하세요, ${greetingName}님`, `Hello, ${greetingName}`, `こんにちは、${greetingName}さん`)}
              </div>
              <div className="mt-1.5 text-[12.5px]" style={{ color: COLORS.moss }}>
                {subtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="h-10 w-10 shrink-0 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${COLORS.rust}, ${COLORS.rustDeep})`,
                border: `1.5px solid ${line(0.25)}`,
              }}
              aria-label={t(lang, '대시보드로 이동', 'Go to dashboard', 'ダッシュボードへ')}
            />
          </header>

          <button
            type="button"
            onClick={() => onOpenChat()}
            className="mb-6 flex w-full items-center gap-3 rounded-[15px] px-3.5 py-3 text-left transition-colors"
            style={{
              background: 'rgba(242,240,233,0.07)',
              border: `1px solid ${line(0.16)}`,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <line x1="4" y1="1.5" x2="4" y2="14.5" stroke={COLORS.rust} strokeWidth="1.4" strokeLinecap="round" />
              <path d="M4 2 L12 4.3 L4 6.6 Z" fill={COLORS.rust} />
            </svg>
            <div className="text-[12.5px] leading-snug" style={{ color: COLORS.creamSoft }}>
              <b className="font-semibold" style={{ color: '#fff' }}>
                COACHX {t(lang, '에이전트', 'Agent', 'エージェント')}
              </b>{' '}
              — {agentHighlight}
            </div>
          </button>

          <section
            className="mb-6 flex items-center gap-4 rounded-[20px] px-5 py-4"
            style={{
              background: 'rgba(242,240,233,0.055)',
              border: `1px solid ${line(0.14)}`,
            }}
          >
            <svg width="88" height="76" viewBox="0 0 120 100" className="shrink-0">
              <ellipse cx="52" cy="46" rx="50" ry="40" fill="none" stroke={line(0.22)} strokeWidth="1.4" />
              <ellipse cx="56" cy="49" rx="39" ry="31" fill="none" stroke={line(0.28)} strokeWidth="1.4" />
              <ellipse cx="61" cy="52" rx="27" ry="21" fill="rgba(193,68,45,0.16)" stroke={COLORS.rust} strokeWidth="1.4" />
              <ellipse cx="65" cy="55" rx="17" ry="13" fill="rgba(193,68,45,0.32)" stroke={COLORS.rust} strokeWidth="1.4" />
              <ellipse cx="69" cy="58" rx="8" ry="6" fill={COLORS.rust} />
              <line x1="69" y1="58" x2="69" y2="40" stroke={COLORS.cream} strokeWidth="1.4" strokeLinecap="round" />
              <path d="M69 40 L79 43.5 L69 47 Z" fill={COLORS.cream} />
            </svg>
            <div className="min-w-0">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: COLORS.moss }}
              >
                {t(lang, '주간 목표 달성', 'Weekly goal', '週間目標達成')}
              </div>
              <div
                className="mt-1 text-[26px] font-semibold"
                style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
              >
                {weekProgressPct}%
              </div>
              <div className="mt-0.5 text-[12px]" style={{ color: '#a9c2b3' }}>
                {t(
                  lang,
                  `세션 ${weekLessonCount} / ${weeklyGoal} 완료`,
                  `${weekLessonCount} / ${weeklyGoal} sessions`,
                  `セッション ${weekLessonCount} / ${weeklyGoal}`
                )}
              </div>
            </div>
          </section>

          <div
            className="mb-2.5 flex items-baseline justify-between px-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ color: COLORS.mossDim }}
          >
            <span>{t(lang, '오늘의 라운드', "Today's rounds", '今日のラウンド')}</span>
            <span
              className="normal-case tracking-normal font-medium"
              style={{ color: COLORS.mossFaint }}
            >
              {t(
                lang,
                `${todayLessons.length}개 홀`,
                `${todayLessons.length} holes`,
                `${todayLessons.length}ホール`
              )}
            </span>
          </div>

          <section
            className="mb-6"
            style={{ borderTop: `1px solid ${line(0.12)}` }}
          >
            {todayLessons.length === 0 ? (
              <div
                className="py-8 text-center text-[13px]"
                style={{ color: COLORS.moss }}
              >
                {t(
                  lang,
                  '오늘 예정된 세션이 없어요',
                  'No sessions scheduled today',
                  '本日の予定セッションはありません'
                )}
              </div>
            ) : (
              todayLessons.map((lesson, i) => {
                const cat = categorizeLesson(lesson);
                const style = CATEGORY_STYLES[cat];
                const isLast = i === todayLessons.length - 1;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() =>
                      onOpenChat(
                        t(
                          lang,
                          `${lesson.clientName} 학생 오늘 레슨 브리핑 해줘`,
                          `Brief me on today's lesson with ${lesson.clientName}`,
                          `${lesson.clientName}さんの今日のレッスンを説明して`
                        )
                      )
                    }
                    className="flex w-full items-center gap-3 py-3.5 text-left"
                    style={{
                      borderBottom: isLast ? 'none' : `1px solid ${line(0.12)}`,
                    }}
                  >
                    <div
                      className="w-[46px] shrink-0 text-[13px]"
                      style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: COLORS.cream }}
                    >
                      {formatTimeFromLesson(lesson)}
                    </div>
                    <div
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: style.dot }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{lesson.clientName}</div>
                      <div className="mt-0.5 truncate text-[11.5px]" style={{ color: COLORS.moss }}>
                        {style.label(lang)}
                        {lesson.title ? ` · ${lesson.title}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 text-[14px]" style={{ color: COLORS.mossFaint }}>
                      ›
                    </span>
                  </button>
                );
              })
            )}
          </section>

          <div className="flex gap-2.5">
            <StatTile
              value={String(todayLessons.length)}
              label={t(lang, '오늘 세션', 'Today', '今日')}
            />
            <StatTile
              value={String(activeClientCount)}
              label={t(lang, '활성 학생', 'Active', 'アクティブ')}
            />
            <StatTile
              value={`${cumulativeHoursThisWeek}h`}
              label={t(lang, '주간 코칭', 'Weekly', '週間')}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const StatTile: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div
    className="flex-1 rounded-[14px] px-3.5 py-3"
    style={{
      background: 'rgba(242,240,233,0.055)',
      border: `1px solid ${line(0.14)}`,
    }}
  >
    <div
      className="text-[19px] font-semibold"
      style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
    >
      {value}
    </div>
    <div className="mt-0.5 text-[10.5px]" style={{ color: COLORS.moss }}>
      {label}
    </div>
  </div>
);
