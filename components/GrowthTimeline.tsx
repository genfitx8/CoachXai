import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Video, MapPin, Dumbbell, BookOpen, ChevronRight, Sparkles } from 'lucide-react';
import { ClientProfile, Lesson, StudentContext } from '../types';
import { useLanguage } from './LanguageContext';
import { getStudentContext } from '../services/studentContextService';

type GrowthFilter = 'ALL' | 'SWING' | 'ROUND' | 'PRACTICE' | 'LESSON';

interface GrowthTimelineProps {
  clientProfile: ClientProfile;
  allMyLessons: Lesson[];
  onOpenDetailedStats: () => void;
  onOpenLesson: (lesson: Lesson) => void;
}

/**
 * Growth Timeline — the "성장" tab shell.
 *
 * Phase 1 renders:
 *   - Club profile card row (empty state today; populated once
 *     practice-data OCR and round entry write to StudentContext in Phase 2).
 *   - Filter chips for record type.
 *   - A flat list of the student's records (lessons only for now).
 *   - Entry point to the existing detailed stats view for numeric drill-down.
 *
 * Phase 3 will merge RoundSummary + EmotionEntry into the same feed and
 * replace the empty club-profile row with real per-club aggregates.
 */
export const GrowthTimeline: React.FC<GrowthTimelineProps> = ({
  clientProfile,
  allMyLessons,
  onOpenDetailedStats,
  onOpenLesson,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';

  const clientId = `${clientProfile.name}_${clientProfile.phone}`.trim();
  const [ctx, setCtx] = useState<StudentContext | null>(null);
  const [filter, setFilter] = useState<GrowthFilter>('ALL');

  useEffect(() => {
    let cancelled = false;
    void getStudentContext(clientId).then(loaded => {
      if (!cancelled) setCtx(loaded);
    });
    return () => { cancelled = true; };
  }, [clientId]);

  const clubProfiles = ctx?.clubProfiles ?? [];

  const filteredLessons = useMemo(() => {
    if (filter === 'ALL') return allMyLessons;
    return allMyLessons.filter(l => {
      const t = l.recordType ?? (l.mediaType === 'video' ? 'PRACTICE' : 'LESSON');
      if (filter === 'SWING') return l.mediaType === 'video';
      if (filter === 'LESSON') return t === 'LESSON';
      if (filter === 'PRACTICE') return t === 'PRACTICE';
      if (filter === 'ROUND') return t === 'SCORE';
      return true;
    });
  }, [allMyLessons, filter]);

  const L = STRINGS[lang];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Title row */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-emerald-500 rounded-full" />
        <h2 className="text-xl font-black text-slate-100">{L.title}</h2>
        <button
          onClick={onOpenDetailedStats}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          {L.detailedStats}
        </button>
      </div>

      {/* Club profile row */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-emerald-300" />
          <h3 className="text-sm font-bold text-slate-100">{L.clubProfiles}</h3>
        </div>
        {clubProfiles.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              {L.emptyClubProfiles}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {clubProfiles.slice(0, 4).map(cp => (
              <div
                key={cp.club}
                className="bg-slate-950/60 border border-slate-700 rounded-xl p-3"
              >
                <p className="text-xs text-slate-400">{cp.club}</p>
                <p className="text-lg font-bold text-slate-100">
                  {cp.avgCarry ? `${Math.round(cp.avgCarry)}m` : '—'}
                </p>
                <p className="text-[11px] text-emerald-300">
                  {cp.ballFlight ? cp.ballFlight.toUpperCase() : ''}
                  {cp.missPattern ? ` · ${cp.missPattern}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {(Object.keys(L.filters) as GrowthFilter[]).map(key => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                isActive
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {L.filters[key]}
            </button>
          );
        })}
      </div>

      {/* Timeline list */}
      {filteredLessons.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/70 rounded-2xl border border-slate-800">
          <div className="bg-slate-950 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-700">
            <BookOpen className="w-7 h-7 text-slate-500" />
          </div>
          <p className="text-sm text-slate-300 font-semibold">{L.emptyList}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredLessons.map(lesson => (
            <li key={lesson.id}>
              <button
                onClick={() => onOpenLesson(lesson)}
                className="w-full flex items-center gap-3 bg-slate-900/70 border border-slate-800 hover:bg-slate-800/70 rounded-xl p-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                  {iconForLesson(lesson)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400">{lesson.date}</p>
                  <p className="text-sm font-semibold text-slate-100 truncate">
                    {lesson.title || labelForLesson(lesson, lang)}
                  </p>
                  {lesson.club && (
                    <p className="text-[11px] text-emerald-300">{lesson.club}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ── i18n + helpers ─────────────────────────────────────────────────────────

const STRINGS = {
  ko: {
    title: '성장 기록',
    detailedStats: '상세 통계',
    clubProfiles: '내 클럽 프로파일',
    emptyClubProfiles: '연습 데이터와 라운드가 쌓이면 클럽별 평균 거리·구질·미스 패턴을 자동으로 정리해 드려요.',
    emptyList: '아직 기록이 없어요',
    filters: {
      ALL: '전체',
      SWING: '스윙',
      ROUND: '라운드',
      PRACTICE: '연습',
      LESSON: '레슨',
    } as Record<GrowthFilter, string>,
  },
  en: {
    title: 'Growth log',
    detailedStats: 'Detailed stats',
    clubProfiles: 'Your club profiles',
    emptyClubProfiles: 'As you log practice sessions and rounds, your average distance, ball flight, and miss patterns per club will show up here.',
    emptyList: 'No records yet',
    filters: {
      ALL: 'All',
      SWING: 'Swing',
      ROUND: 'Round',
      PRACTICE: 'Practice',
      LESSON: 'Lesson',
    } as Record<GrowthFilter, string>,
  },
  ja: {
    title: '成長ログ',
    detailedStats: '詳細統計',
    clubProfiles: 'クラブ別プロファイル',
    emptyClubProfiles: '練習とラウンドのデータが集まると、クラブ別の平均距離・球筋・ミス傾向を自動でまとめます。',
    emptyList: 'まだ記録がありません',
    filters: {
      ALL: 'すべて',
      SWING: 'スイング',
      ROUND: 'ラウンド',
      PRACTICE: '練習',
      LESSON: 'レッスン',
    } as Record<GrowthFilter, string>,
  },
} as const;

const iconForLesson = (lesson: Lesson) => {
  const t = lesson.recordType ?? (lesson.mediaType === 'video' ? 'PRACTICE' : 'LESSON');
  if (lesson.mediaType === 'video') return <Video className="w-4 h-4 text-emerald-300" />;
  if (t === 'SCORE') return <MapPin className="w-4 h-4 text-emerald-300" />;
  if (t === 'PRACTICE') return <Dumbbell className="w-4 h-4 text-cyan-300" />;
  return <BookOpen className="w-4 h-4 text-amber-300" />;
};

const labelForLesson = (lesson: Lesson, lang: 'ko' | 'en' | 'ja'): string => {
  const t = lesson.recordType ?? (lesson.mediaType === 'video' ? 'PRACTICE' : 'LESSON');
  const table: Record<string, Record<typeof lang, string>> = {
    SCORE: { ko: '라운드', en: 'Round', ja: 'ラウンド' },
    PRACTICE: { ko: '연습', en: 'Practice', ja: '練習' },
    LESSON: { ko: '레슨', en: 'Lesson', ja: 'レッスン' },
  };
  return table[t]?.[lang] ?? '';
};
