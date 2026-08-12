import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Info, Loader2, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import type { ClientProfile, CoachStyleExemplar, Lesson, LessonReviewSections, MediaItem } from '../types';
import { EvidenceDetailModal } from './EvidenceDetailModal';
import { generateLessonReviewDraft } from '../services/geminiService';
import { coachStyleService, tierForSource } from '../services/coachStyleService';

/**
 * 8b · 기록 승인 (Lesson Review) — the redesign's most emphatic screen:
 * the coach edits the agent's draft in place, decides whether to share
 * with the student, and hits 승인. Nothing leaves for the student until
 * that button is pressed.
 *
 * Section-level edits, autosave every 10s, and a 5-minute post-approval
 * undo window are wired through `onSaveDraft` / `onApprove` / `onUndo`
 * callbacks rather than direct storage calls, so the caller controls the
 * persistence path (Firestore vs local queue) and can inject the "학생
 * 앱으로 전달했어요" thread message.
 */
export interface LessonReviewScreenProps {
  lesson: Lesson;
  /** Optional label used in the header ("이지영 님 · 3회차"). */
  headerSubtitle?: string;
  /**
   * Prior lessons for the same student (5 most recent used by the AI
   * drafter). Optional — falls back to the current lesson only.
   */
  pastLessons?: Lesson[];
  /** Student profile passed through to the drafter for name/handicap context. */
  clientProfile?: ClientProfile;
  /** Coach id — anchors AI-log telemetry and dissent exemplars to this coach. */
  coachId?: string;
  /**
   * Firebase mode flag — the caller already knows this; passed here so
   * dissent exemplars flow into the same storage backend as the coach's
   * other few-shot signals.
   */
  isFirebaseMode?: boolean;
  /** Autosave debounced write. Called on section edit + on unmount. */
  onSaveDraft: (patch: Partial<Lesson>) => Promise<void>;
  /**
   * Persist `approvalStatus='approved'` + `approvedAt` + `sharedToStudent`.
   * The caller is responsible for sending the student notification when
   * sharedToStudent is true. Should return the updated Lesson so the UI
   * can transition to the "전달됨" toast.
   */
  onApprove: (patch: {
    reviewSections: LessonReviewSections;
    approvalStatus: 'approved';
    approvedAt: number;
    sharedToStudent: boolean;
  }) => Promise<void>;
  /**
   * Roll approvalStatus back to 'draft' within the 5-minute window.
   * The caller should also revoke the student-side visibility on the
   * same call (e.g. delete the pushed notification).
   */
  onUndoApproval?: () => Promise<void>;
  /** Return to the previous screen (typically the coach's chat). */
  onBack: () => void;
}

const SECTION_LABELS: Record<'todayCovered' | 'feedback' | 'nextActions' | 'freeMemo', string> = {
  todayCovered: '오늘 다룬 것',
  feedback: '피드백',
  nextActions: '다음 액션',
  freeMemo: '자유 메모',
};

const AUTOSAVE_DEBOUNCE_MS = 10_000;
const UNDO_WINDOW_MS = 5 * 60 * 1000;

const emptySections = (): LessonReviewSections => ({
  todayCovered: '',
  feedback: '',
  nextActions: [],
  attachmentIds: [],
  freeMemo: '',
  editedSections: [],
});

const mergeSections = (l: Lesson): LessonReviewSections => {
  // Fall back to legacy fields when reviewSections isn't populated yet —
  // this lets a coach open an older lesson in the review UI without
  // seeing empty blocks (agent drafts land in reviewSections directly).
  const base = emptySections();
  if (l.reviewSections) return { ...base, ...l.reviewSections };
  return {
    ...base,
    feedback: l.coachNotes ?? '',
    nextActions: l.assignedHomework ?? [],
    attachmentIds: (l.additionalMedia ?? []).map((m) => m.id),
  };
};

export const LessonReviewScreen: React.FC<LessonReviewScreenProps> = ({
  lesson,
  headerSubtitle,
  pastLessons = [],
  clientProfile,
  coachId,
  isFirebaseMode = false,
  onSaveDraft,
  onApprove,
  onUndoApproval,
  onBack,
}) => {
  const [sections, setSections] = useState<LessonReviewSections>(() => mergeSections(lesson));
  const [shareWithStudent, setShareWithStudent] = useState<boolean>(
    lesson.sharedToStudent ?? true
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvedInSession, setApprovedInSession] = useState<number | null>(
    lesson.approvalStatus === 'approved' ? lesson.approvedAt ?? Date.now() : null
  );
  const [undoLeftMs, setUndoLeftMs] = useState<number>(0);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  /** 6a modal state — when set, the evidence sheet renders over the review. */
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const dirtyRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Prevents double-firing the auto-draft when React re-mounts in strict mode. */
  const autoDraftFiredRef = useRef(false);

  const attachments: MediaItem[] = useMemo(
    () => (lesson.additionalMedia ?? []).filter((m) => sections.attachmentIds?.includes(m.id)),
    [lesson.additionalMedia, sections.attachmentIds]
  );

  const markEdited = (key: 'todayCovered' | 'feedback' | 'nextActions' | 'freeMemo') => {
    setSections((prev) => {
      const already = prev.editedSections?.includes(key);
      if (already) return prev;
      return { ...prev, editedSections: [...(prev.editedSections ?? []), key] };
    });
  };

  const flushSave = useCallback(
    async (next: LessonReviewSections) => {
      setSaving(true);
      setSaveError(null);
      try {
        await onSaveDraft({
          reviewSections: { ...next, updatedAt: Date.now() },
          approvalStatus: approvedInSession ? 'approved' : 'draft',
        });
        setSavedAt(Date.now());
        dirtyRef.current = false;
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다');
      } finally {
        setSaving(false);
      }
    },
    [onSaveDraft, approvedInSession]
  );

  // Debounced autosave — the redesign asks for 10s cadence + a save on
  // exit. On unmount we synchronously flush whatever's pending.
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void flushSave(sections);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [sections, flushSave]);

  const runDraft = useCallback(
    async (options: { silent?: boolean } = {}) => {
      setDrafting(true);
      setDraftError(null);
      try {
        const draft = await generateLessonReviewDraft(
          lesson,
          pastLessons,
          clientProfile,
          coachId
        );
        // Merge: preserve any section the coach has already touched so a
        // regenerate doesn't clobber their edits. `editedSections` on the
        // current state is authoritative.
        setSections((prev) => {
          const edited = new Set(prev.editedSections ?? []);
          const merged: LessonReviewSections = {
            ...draft,
            todayCovered: edited.has('todayCovered')
              ? prev.todayCovered
              : draft.todayCovered,
            feedback: edited.has('feedback') ? prev.feedback : draft.feedback,
            nextActions: edited.has('nextActions')
              ? prev.nextActions
              : draft.nextActions,
            freeMemo: prev.freeMemo,
            attachmentIds: prev.attachmentIds,
            editedSections: prev.editedSections,
            updatedAt: Date.now(),
          };
          dirtyRef.current = true;
          return merged;
        });
      } catch (err) {
        if (!options.silent) {
          setDraftError(err instanceof Error ? err.message : 'AI 초안 생성에 실패했습니다');
        }
      } finally {
        setDrafting(false);
      }
    },
    [lesson, pastLessons, clientProfile, coachId]
  );

  // First-visit auto-draft: when a coach opens a lesson that doesn't yet
  // have reviewSections, kick off a background draft so the review card
  // isn't a blank slate. Only fires once and only when the coach has
  // authority (coachId known) — otherwise the sheet just shows what
  // mergeSections derived from legacy fields.
  useEffect(() => {
    if (autoDraftFiredRef.current) return;
    if (!coachId) return;
    if (lesson.reviewSections) return;
    autoDraftFiredRef.current = true;
    void runDraft({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistDissentExemplar = async (correction: string) => {
    if (!coachId) return;
    const exemplar: CoachStyleExemplar = {
      id: crypto.randomUUID(),
      coachId,
      target: 'lesson_summary',
      input: `Lesson review · ${clientProfile?.name ?? lesson.clientName ?? ''} · ${lesson.date ?? ''}`,
      output: correction,
      source: 'dissent',
      tier: tierForSource('dissent'),
      reason: '코치가 리뷰 화면 근거 카드에서 다르게 판단',
      createdAt: Date.now(),
    };
    await coachStyleService.save(exemplar, isFirebaseMode);
  };

  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        // Fire-and-forget — the unmount save is best-effort; if the
        // network is down the local queue in onSaveDraft picks it up.
        void onSaveDraft({
          reviewSections: { ...sections, updatedAt: Date.now() },
          approvalStatus: approvedInSession ? 'approved' : 'draft',
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Undo countdown while we're inside the 5-minute post-approval window.
  useEffect(() => {
    if (!approvedInSession || !onUndoApproval) return;
    const tick = () => {
      const left = Math.max(0, approvedInSession + UNDO_WINDOW_MS - Date.now());
      setUndoLeftMs(left);
      if (left === 0) setApprovedInSession(null); // window closed; hide undo
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [approvedInSession, onUndoApproval]);

  const handleSectionChange = <K extends 'todayCovered' | 'feedback' | 'freeMemo'>(
    key: K,
    value: string
  ) => {
    dirtyRef.current = true;
    markEdited(key);
    setSections((prev) => ({ ...prev, [key]: value }));
  };

  const handleNextActionChange = (index: number, value: string) => {
    dirtyRef.current = true;
    markEdited('nextActions');
    setSections((prev) => {
      const list = [...(prev.nextActions ?? [])];
      list[index] = value;
      return { ...prev, nextActions: list };
    });
  };

  const handleAddNextAction = () => {
    dirtyRef.current = true;
    markEdited('nextActions');
    setSections((prev) => ({
      ...prev,
      nextActions: [...(prev.nextActions ?? []), ''],
    }));
  };

  const handleRemoveNextAction = (index: number) => {
    dirtyRef.current = true;
    markEdited('nextActions');
    setSections((prev) => {
      const list = [...(prev.nextActions ?? [])];
      list.splice(index, 1);
      return { ...prev, nextActions: list };
    });
  };

  const handleApprove = async () => {
    if (approving) return;
    setApproving(true);
    setSaveError(null);
    const now = Date.now();
    try {
      const cleanedSections: LessonReviewSections = {
        ...sections,
        nextActions: (sections.nextActions ?? []).map((s) => s.trim()).filter(Boolean),
        updatedAt: now,
      };
      await onApprove({
        reviewSections: cleanedSections,
        approvalStatus: 'approved',
        approvedAt: now,
        sharedToStudent: shareWithStudent,
      });
      setSections(cleanedSections);
      setApprovedInSession(now);
      dirtyRef.current = false;
      setSavedAt(now);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '승인에 실패했습니다');
    } finally {
      setApproving(false);
    }
  };

  const handleUndo = async () => {
    if (!onUndoApproval) return;
    try {
      await onUndoApproval();
      setApprovedInSession(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '되돌리기에 실패했습니다');
    }
  };

  const editedBadge = (key: 'todayCovered' | 'feedback' | 'nextActions' | 'freeMemo') =>
    sections.editedSections?.includes(key) ? (
      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-500 ml-2">
        수정됨
      </span>
    ) : null;

  const undoSecondsLeft = Math.ceil(undoLeftMs / 1000);
  const undoLabel =
    undoSecondsLeft >= 60
      ? `${Math.floor(undoSecondsLeft / 60)}분 ${undoSecondsLeft % 60}초 남음`
      : `${undoSecondsLeft}초 남음`;

  return (
    <div className="min-h-screen bg-base text-ink-high pb-32">
      <header className="sticky top-0 z-10 bg-base/95 backdrop-blur border-b border-line-subtle">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로"
            className="p-2 -ml-2 rounded-lg text-ink-medium hover:text-ink-high hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">기록 검토</div>
            {headerSubtitle ? (
              <div className="text-[11px] font-mono text-ink-muted truncate">{headerSubtitle}</div>
            ) : null}
          </div>
          <SaveStatus saving={saving} savedAt={savedAt} error={saveError} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 pt-6 space-y-5">
        {/* AI-draft controls — the redesign asks the agent to seed the
            record before the coach opens it. First-visit auto-draft
            handles the common case; this button lets the coach
            regenerate after saving new notes or rewriting a section. */}
        {coachId && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => void runDraft()}
              disabled={drafting}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 text-[13px] font-bold transition-colors"
            >
              {drafting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 초안 생성 중
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  {sections.todayCovered || sections.feedback ? 'AI 초안 다시 생성' : 'AI 초안 생성'}
                </>
              )}
            </button>
            {draftError && (
              <span className="text-[11px] text-amber-300">{draftError}</span>
            )}
            {!draftError && !drafting && sections.editedSections?.length ? (
              <span className="text-[11px] font-mono text-ink-muted">
                수정된 섹션은 재생성해도 유지됩니다
              </span>
            ) : null}
          </div>
        )}

        <Section
          label={SECTION_LABELS.todayCovered}
          badge={editedBadge('todayCovered')}
          hint="한 문단으로 요약. 코치는 지우고 다시 쓸 수 있습니다."
          required
        >
          <AutoTextarea
            value={sections.todayCovered ?? ''}
            onChange={(v) => handleSectionChange('todayCovered', v)}
            placeholder="오늘 레슨에서 다룬 주제 · 진행 흐름을 한 문단으로."
          />
        </Section>

        <Section
          label={SECTION_LABELS.feedback}
          badge={editedBadge('feedback')}
          hint="근거는 승인 후 학생 화면에서도 함께 보입니다."
          headerRight={
            (sections.swingEvidence?.length || sections.historyEvidence?.length || sections.confidence) ? (
              <button
                type="button"
                onClick={() => setEvidenceOpen(true)}
                className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1 px-1 py-0.5"
              >
                <Info className="w-3 h-3" />
                근거 {(sections.swingEvidence?.length ?? 0) + (sections.historyEvidence?.length ?? 0)}건
              </button>
            ) : undefined
          }
          required
        >
          <AutoTextarea
            value={sections.feedback ?? ''}
            onChange={(v) => handleSectionChange('feedback', v)}
            placeholder="스윙 · 자세 · 심리에 대한 코치의 소견."
          />
        </Section>

        <Section
          label={SECTION_LABELS.nextActions}
          badge={editedBadge('nextActions')}
          hint="학생이 다음 레슨 전에 할 것들. 우선순위 순."
          accent
          required
        >
          <div className="space-y-2">
            {(sections.nextActions ?? []).map((action, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <AutoTextarea
                  value={action}
                  onChange={(v) => handleNextActionChange(i, v)}
                  placeholder={`액션 ${i + 1}`}
                  compact
                />
                <button
                  type="button"
                  onClick={() => handleRemoveNextAction(i)}
                  aria-label="이 액션 삭제"
                  className="mt-1.5 text-[11px] text-ink-faint hover:text-ink-medium px-2 py-1"
                >
                  삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddNextAction}
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 px-2 py-1"
            >
              + 액션 추가
            </button>
          </div>
        </Section>

        {attachments.length > 0 && (
          <Section label="첨부" hint="레슨 중 캡처된 클립·사진.">
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((m) => (
                <div
                  key={m.id}
                  className="aspect-square rounded-lg bg-white/5 border border-line-subtle flex items-center justify-center text-[10px] font-mono text-ink-muted"
                >
                  {m.type === 'video' ? '영상' : m.type === 'audio' ? '오디오' : '사진'}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section
          label={SECTION_LABELS.freeMemo}
          badge={editedBadge('freeMemo')}
          hint="코치 개인 메모 — 학생에게 공유되지 않습니다."
        >
          <AutoTextarea
            value={sections.freeMemo ?? ''}
            onChange={(v) => handleSectionChange('freeMemo', v)}
            placeholder="이 학생에 대한 코치의 사적 메모 (학생 비공개)."
          />
        </Section>
      </main>

      <ApprovalBar
        approvedInSession={!!approvedInSession}
        approving={approving}
        shareWithStudent={shareWithStudent}
        onShareToggle={setShareWithStudent}
        onApprove={handleApprove}
        onUndo={onUndoApproval && approvedInSession ? handleUndo : undefined}
        undoLabel={approvedInSession ? undoLabel : ''}
      />

      {evidenceOpen && (
        <EvidenceDetailModal
          claim={sections.feedback || '피드백이 아직 비어 있습니다.'}
          envelope={{
            swingEvidence: sections.swingEvidence,
            historyEvidence: sections.historyEvidence,
            confidence: sections.confidence,
            caveats: sections.caveats,
          }}
          target="lesson_summary"
          subjectLabel={headerSubtitle ?? lesson.title ?? undefined}
          onAccept={() => {
            // No exemplar write on plain accept from the review screen —
            // the coach approving the whole record via 승인 is the stronger
            // endorsement signal. This just closes the sheet.
          }}
          onDissent={coachId ? persistDissentExemplar : undefined}
          onClose={() => setEvidenceOpen(false)}
        />
      )}
    </div>
  );
};

// ─── Subcomponents ─────────────────────────────────────────────────────────

const Section: React.FC<{
  label: string;
  hint?: string;
  badge?: React.ReactNode;
  required?: boolean;
  accent?: boolean;
  /** Optional element rendered on the far right of the section label row. */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, hint, badge, required, accent, headerRight, children }) => (
  <section
    className={`rounded-2xl border p-4 ${
      accent
        ? 'border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.07] to-transparent'
        : 'border-line-subtle bg-white/[0.02]'
    }`}
  >
    <div className="flex items-baseline gap-2 mb-2">
      <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      {required && (
        <span className="text-[10px] font-mono text-ink-faint">필수</span>
      )}
      {badge}
      {headerRight ? <span className="ml-auto">{headerRight}</span> : null}
    </div>
    {hint && <p className="text-[11px] text-ink-muted mb-3">{hint}</p>}
    {children}
  </section>
);

const AutoTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  compact?: boolean;
}> = ({ value, onChange, placeholder, compact }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={compact ? 1 : 3}
      className="w-full resize-none bg-transparent text-[14.5px] leading-[1.65] text-ink-high placeholder:text-ink-faint focus:outline-none"
    />
  );
};

const SaveStatus: React.FC<{ saving: boolean; savedAt: number | null; error: string | null }> = ({
  saving,
  savedAt,
  error,
}) => {
  if (error) {
    return (
      <span className="text-[11px] text-amber-400 font-mono flex items-center gap-1">
        <Info className="w-3 h-3" /> 저장 실패
      </span>
    );
  }
  if (saving) {
    return (
      <span className="text-[11px] text-ink-muted font-mono flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> 저장 중
      </span>
    );
  }
  if (savedAt) {
    return <span className="text-[11px] text-ink-muted font-mono">자동 저장됨</span>;
  }
  return null;
};

const ApprovalBar: React.FC<{
  approvedInSession: boolean;
  approving: boolean;
  shareWithStudent: boolean;
  onShareToggle: (v: boolean) => void;
  onApprove: () => void;
  onUndo?: () => void;
  undoLabel: string;
}> = ({
  approvedInSession,
  approving,
  shareWithStudent,
  onShareToggle,
  onApprove,
  onUndo,
  undoLabel,
}) => (
  <div className="fixed bottom-0 inset-x-0 z-20 border-t border-line-subtle bg-base/95 backdrop-blur pb-safe">
    <div className="max-w-2xl mx-auto px-5 py-3 space-y-3">
      {!approvedInSession && (
        <label className="flex items-center gap-2 text-[12.5px] text-ink-medium cursor-pointer select-none">
          <input
            type="checkbox"
            checked={shareWithStudent}
            onChange={(e) => onShareToggle(e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          학생에게 공유
          <span className="text-[11px] text-ink-faint ml-1">
            (승인과 동시에 발송)
          </span>
        </label>
      )}
      {approvedInSession ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] text-emerald-400 font-bold">
            <Sparkles className="w-4 h-4" />
            승인됨 · {undoLabel}
          </div>
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              className="text-[12px] font-bold text-ink-medium hover:text-ink-high flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 되돌리기
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onApprove}
          disabled={approving}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-[#04150e] text-[15px] font-bold transition-colors"
        >
          {approving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> 전송 중
            </>
          ) : (
            <>
              <Check className="w-4 h-4" /> 승인 · 학생 앱으로 전달
            </>
          )}
        </button>
      )}
    </div>
  </div>
);
