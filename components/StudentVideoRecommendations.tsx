import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, PlayCircle, RefreshCw, Youtube } from 'lucide-react';
import type { Homework, Lesson, StudentContext } from '../types';
import type { FaultId } from '../types/swingFault';
import {
  getVideoRecommendations,
  hasRecommendationSignals,
  type RecommendationSignals,
  type VideoRecommendation,
} from '../services/youtubeRecommendationService';
import { useLanguage } from './LanguageContext';

/**
 * 추천 영상 — practice videos picked for what this student is working on.
 *
 * Sits under the 대화 홈 cards. The topic and the "왜 이게 떴는지" line come
 * from the student's own records (see `services/youtubeRecommendationService`);
 * the videos themselves come from a real YouTube search on the backend. When
 * the backend can't serve results the card keeps the topics and offers the
 * same search on youtube.com, so the student is never left with an empty box.
 */

export interface StudentVideoRecommendationsProps {
  lessons: Lesson[];
  homework: Homework[];
  ctx?: StudentContext | null;
  /** Fault ids from a swing analysed in this session, when there is one. */
  faults?: FaultId[];
  /** Topics to surface (default 2 — the home screen is a chat, not a feed). */
  limit?: number;
  /** Layout classes from the host screen (margins, width). */
  className?: string;
}

type Lang = 'ko' | 'en' | 'ja';

const TEXT: Record<Lang, Record<string, string>> = {
  ko: {
    title: '추천 영상',
    refresh: '새로고침',
    loading: '영상을 찾는 중…',
    searchOnYouTube: 'YouTube에서 검색',
    searchHint: '지금은 검색 링크로 열립니다',
    openLabel: '유튜브에서 열기',
  },
  en: {
    title: 'Recommended videos',
    refresh: 'Refresh',
    loading: 'Finding videos…',
    searchOnYouTube: 'Search on YouTube',
    searchHint: 'Opens a YouTube search for now',
    openLabel: 'Open on YouTube',
  },
  ja: {
    title: 'おすすめ動画',
    refresh: '更新',
    loading: '動画を探しています…',
    searchOnYouTube: 'YouTubeで検索',
    searchHint: '今は検索リンクで開きます',
    openLabel: 'YouTubeで開く',
  },
};

export const StudentVideoRecommendations: React.FC<StudentVideoRecommendationsProps> = ({
  lessons,
  homework,
  ctx,
  faults,
  limit = 2,
  className = '',
}) => {
  const { language } = useLanguage();
  const lang = (language as Lang) ?? 'ko';
  const t = TEXT[lang] ?? TEXT.ko;

  const [recommendations, setRecommendations] = useState<VideoRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  /** Highest reload token already served — so only the tap itself forces. */
  const forcedToken = useRef(0);

  const signals: RecommendationSignals = useMemo(
    () => ({ lessons, homework, ctx, faults, language: lang }),
    [lessons, homework, ctx, faults, lang]
  );

  // Refetching is keyed on what actually changes the answer, not on the array
  // identities — ClientApp rebuilds those on every poll, and a raw dependency
  // would re-run the request (and its quota cost) a few times a minute.
  const signalKey = useMemo(() => {
    const newestLesson = lessons.reduce(
      (max, l) => Math.max(max, l.approvedAt ?? l.createdAt ?? 0),
      0
    );
    const openHomework = homework.filter((h) => !h.isCompleted).length;
    return [
      lang,
      limit,
      lessons.length,
      newestLesson,
      homework.length,
      openHomework,
      ctx?.updatedAt ?? 0,
      (faults ?? []).join(','),
    ].join('|');
  }, [lang, limit, lessons, homework, ctx?.updatedAt, faults]);

  useEffect(() => {
    if (!hasRecommendationSignals(signals)) {
      setRecommendations([]);
      return;
    }
    let cancelled = false;
    // A signal change refreshes from cache; only the refresh button pays for
    // a new search.
    const force = reloadToken > forcedToken.current;
    forcedToken.current = reloadToken;
    setLoading(true);
    void getVideoRecommendations(signals, { limit, force })
      .then((result) => {
        if (!cancelled) setRecommendations(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `signals` is rebuilt whenever its inputs are; `signalKey` decides when
    // the answer could actually differ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalKey, reloadToken]);

  const onRefresh = useCallback(() => setReloadToken((n) => n + 1), []);

  if (recommendations.length === 0 && !loading) return null;

  return (
    <section className={`rounded-2xl border border-line-subtle bg-white/[0.02] p-4 ${className}`.trim()}>
      <div className="flex items-center gap-2 mb-3">
        <Youtube className="w-4 h-4 text-red-400" aria-hidden />
        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
          {t.title}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          aria-label={t.refresh}
          className="ml-auto p-1 rounded-lg text-ink-muted hover:text-ink-high hover:bg-white/10 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && recommendations.length === 0 ? (
        <p className="text-[13px] text-ink-medium">{t.loading}</p>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec) => (
            <TopicBlock key={rec.topicId} rec={rec} t={t} />
          ))}
        </div>
      )}
    </section>
  );
};

const TopicBlock: React.FC<{ rec: VideoRecommendation; t: Record<string, string> }> = ({
  rec,
  t,
}) => (
  <div>
    <p className="text-[14px] font-bold text-ink-high leading-[1.4]">{rec.label}</p>
    <p className="text-[11px] text-ink-muted mt-0.5 mb-2 truncate">{rec.reason}</p>

    {rec.videos.length > 0 ? (
      <ul className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 snap-x">
        {rec.videos.map((video) => (
          <li key={video.videoId} className="w-40 flex-shrink-0 snap-start">
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${video.title} — ${t.openLabel}`}
              className="block group"
            >
              <div className="relative aspect-video rounded-xl overflow-hidden border border-line-subtle bg-white/[0.03]">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <PlayCircle className="w-6 h-6 text-ink-muted" aria-hidden />
                  </div>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <PlayCircle className="w-7 h-7 text-white" aria-hidden />
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-[1.4] text-ink-high line-clamp-2">
                {video.title}
              </p>
              {video.channelTitle && (
                <p className="text-[11px] text-ink-muted truncate">{video.channelTitle}</p>
              )}
            </a>
          </li>
        ))}
      </ul>
    ) : (
      <div>
        <a
          href={rec.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line-subtle bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-ink-high hover:border-emerald-400/50 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
          {t.searchOnYouTube}
        </a>
        <p className="mt-1 text-[11px] text-ink-faint">{t.searchHint}</p>
      </div>
    )}
  </div>
);
