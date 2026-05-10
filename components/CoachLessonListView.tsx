import React from 'react';
import { BarChart3, BookOpen, Eye, EyeOff, Filter, User, X } from 'lucide-react';
import { ClientProfile, CoachProfile, Lesson } from '../types';
import { LessonCard } from './LessonCard';
import { useLanguage } from './LanguageContext';

interface CoachLessonListViewProps {
  coach: CoachProfile;
  clients: ClientProfile[];
  filteredLessons: Lesson[];
  selectedClientFilter: string;
  showMedia: boolean;
  onBack: () => void;
  onSelectLesson: (lesson: Lesson) => void;
  onDeleteLesson: (id: string) => void;
  onSelectClientFilter: (name: string) => void;
  onResetClientFilter: () => void;
  onOpenClientStats: () => void;
  onToggleShowMedia: () => void;
}

/**
 * Coach "Lesson list" surface (formerly inline in App.tsx under
 * coachView === 'LESSON_LIST'). Owns no state — every interaction is a
 * callback up to the parent router.
 */
export const CoachLessonListView: React.FC<CoachLessonListViewProps> = ({
  coach,
  clients,
  filteredLessons,
  selectedClientFilter,
  showMedia,
  onBack,
  onSelectLesson,
  onDeleteLesson,
  onSelectClientFilter,
  onResetClientFilter,
  onOpenClientStats,
  onToggleShowMedia,
}) => {
  const { t } = useLanguage();
  const coachClients = clients
    .filter((c) => c.coachId === coach.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back to dashboard */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-line-default bg-bg-overlay/60 px-3 py-2 text-sm font-medium text-ink-medium transition-colors hover:border-line-strong hover:bg-bg-overlay hover:text-ink-high"
        >
          <X className="h-4 w-4" />
          대시보드로 돌아가기
        </button>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-high">
          <BookOpen className="h-5 w-5 text-primary-300" />
          레슨 기록
        </h2>
      </div>

      {/* Client filter */}
      {clients.length > 0 && (
        <div className="rounded-2xl border border-line-subtle bg-bg-raised p-4 shadow-elev-1">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-primary-300" />
            <div className="flex-1">
              <select
                value={selectedClientFilter}
                onChange={(e) => onSelectClientFilter(e.target.value)}
                className="w-full rounded-xl border border-line-default bg-bg-overlay px-4 py-2.5 font-medium text-ink-high outline-none transition-colors focus:border-primary-500 focus:shadow-ring-primary"
              >
                <option value="">전체 회원 보기</option>
                {coachClients.map((client) => (
                  <option key={`${client.name}_${client.phone}`} value={client.name}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedClientFilter && (
              <button
                type="button"
                onClick={onOpenClientStats}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-primary-500 to-primary-600 px-4 py-2.5 font-medium text-white shadow-elev-2 transition-all hover:from-primary-400 hover:to-primary-500"
              >
                <BarChart3 className="h-4 w-4" />
                통계 보기
              </button>
            )}

            {selectedClientFilter && (
              <button
                type="button"
                onClick={onResetClientFilter}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <X className="h-4 w-4" />
                초기화
              </button>
            )}
          </div>
          {selectedClientFilter && (
            <div className="mt-2 text-sm text-ink-medium">
              <span className="font-semibold text-primary-300">{selectedClientFilter}</span>
              님의 레슨 {filteredLessons.length}개
            </div>
          )}
        </div>
      )}

      {/* Media toggle */}
      <div className="rounded-2xl border border-line-subtle bg-bg-raised p-4 shadow-elev-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary-300" />
            <span className="text-sm font-medium text-ink-high">레슨 미디어 표시</span>
          </div>
          <button
            type="button"
            onClick={onToggleShowMedia}
            aria-pressed={showMedia}
            className={`rounded-xl p-2.5 transition-colors ${
              showMedia
                ? 'bg-primary-500/15 text-primary-200'
                : 'bg-bg-overlay text-ink-muted hover:bg-bg-inset hover:text-ink-high'
            }`}
            title={showMedia ? '미디어 숨기기' : '미디어 표시'}
          >
            {showMedia ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Lesson grid / empty state */}
      {filteredLessons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-default bg-bg-raised/60 py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bg-overlay">
            <Filter className="h-8 w-8 text-ink-muted" />
          </div>
          <h3 className="text-lg font-semibold text-ink-high">{t('no_lessons')}</h3>
          <p className="text-ink-muted">{t('no_lessons_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredLessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onClick={onSelectLesson}
              onShare={() => {}}
              onDelete={(l, e) => {
                e.stopPropagation();
                onDeleteLesson(l.id);
              }}
              showMedia={showMedia}
            />
          ))}
        </div>
      )}
    </div>
  );
};
