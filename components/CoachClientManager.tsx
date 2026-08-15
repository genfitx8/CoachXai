import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ClientProfile } from '../types';
import { Button } from './Button';
import {
  ArrowLeft,
  UserPlus,
  Search,
  Edit,
  Trash2,
  User,
  Phone,
  Save,
  X,
  MessageSquare,
  Briefcase,
  ClipboardList,
  Dumbbell,
  FileBarChart,
  AlertCircle,
  BookOpen,
  Plus,
} from 'lucide-react';
import { MemberGrowthReport, MemberTrend } from '../services/coachXService';
import { useLanguage } from './LanguageContext';
import { MemberGrowthDetailScreen } from './MemberGrowthDetailScreen';

interface CoachClientManagerProps {
  clients: ClientProfile[];
  onAdd: (client: ClientProfile) => void;
  onUpdate: (client: ClientProfile) => void;
  onDelete: (client: ClientProfile) => void;
  onBack: () => void;
  coachId?: string; // Added: Coach ID for filtering and assignment
  /** Called when coach taps a member's lesson package button. */
  onManagePackages?: (client: ClientProfile) => void;
  /** Called when coach wants to view a member's lesson records. */
  onViewLessons?: (client: ClientProfile) => void;
  /**
   * Called when the coach wants the unified 4-tab detail (redesign 4c).
   * When set, the member row becomes tappable and jumps to that screen;
   * without it the row keeps the older per-action button layout.
   */
  onOpenStudentDetail?: (client: ClientProfile) => void;
  /** Called when coach wants to generate a training program for a member. */
  onGenerateProgram?: (client: ClientProfile) => void;
  /** CoachX growth reports keyed by clientName_clientPhone – used to show trend badges. */
  memberReports?: MemberGrowthReport[];
  /** Called when coach taps "Ask CoachX" for a specific member. */
  onOpenCoachX?: (query?: string) => void;
  /** Shows the direct member registration button in toolbar. */
  showAddButton?: boolean;
  /** Auto-opens the add-member modal when entering this screen. */
  autoOpenAddModal?: boolean;
  /** Callback fired after auto-open has been handled. */
  onAutoOpenAddModalHandled?: () => void;
  /** Overrides the default page title. */
  pageTitle?: string;
}

const clientManagerPanelClass = 'bg-white/[0.03] border border-line-subtle rounded-2xl shadow-lg shadow-black/20';
const clientFormInputClass =
  'w-full px-4 py-3.5 text-base border border-line-strong rounded-xl bg-bg-inset text-ink-high placeholder:text-ink-faint focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500/60 outline-none transition-colors';
const clientCardActionButtonClass =
  'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl transition-colors text-sm font-semibold';

/**
 * Format a Korean mobile number as the coach types.
 * Strips non-digits, caps at 11 digits, and inserts hyphens so the
 * value renders as 010-1234-5678. Also handles Seoul-style 02-XXX-XXXX
 * when the input starts with 02 so land-line entries still look right.
 */
const formatKoreanPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

export const CoachClientManager: React.FC<CoachClientManagerProps> = ({
  clients,
  onAdd,
  onUpdate,
  onDelete,
  onBack,
  coachId,
  onManagePackages,
  onViewLessons,
  onOpenStudentDetail,
  onGenerateProgram,
  memberReports,
  onOpenCoachX,
  showAddButton = true,
  autoOpenAddModal = false,
  onAutoOpenAddModalHandled,
  pageTitle,
}) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hasHandledAutoOpenRef = useRef(false);
  const [editingClient, setEditingClient] = useState<ClientProfile | null>(
    null
  );
  const [detailReport, setDetailReport] = useState<MemberGrowthReport | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [memo, setMemo] = useState('');

  const clientKey = (name: string, phone: string) => `${name}_${phone}`;

  // Student category should show only this coach's registered students.
  const visibleClients = useMemo(() => {
    const scopedClients = coachId
      ? clients.filter((client) => client.coachId === coachId)
      : clients;
    return [...scopedClients].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, coachId]);

  const filteredClients = visibleClients.filter(
    (c) => c.name.includes(searchTerm) || c.phone.includes(searchTerm)
  );

  /** Lookup map: clientName_clientPhone -> MemberGrowthReport */
  const reportByKey = useMemo(() => {
    if (!memberReports) return {} as Record<string, MemberGrowthReport>;
    return memberReports.reduce<Record<string, MemberGrowthReport>>((acc, r) => {
      acc[clientKey(r.clientName, r.clientPhone)] = r;
      return acc;
    }, {});
  }, [memberReports]);

  const filteredMemberReports = useMemo(() => {
    if (!memberReports) return [];
    const visibleKeys = new Set(visibleClients.map((client) => clientKey(client.name, client.phone)));
    return memberReports.filter((report) => visibleKeys.has(clientKey(report.clientName, report.clientPhone)));
  }, [memberReports, visibleClients]);

  const growthSummary = useMemo(() => {
    if (filteredMemberReports.length === 0) return null;
    const avgScore = Math.round(
      filteredMemberReports.reduce((sum, report) => sum + report.growthScore, 0) / filteredMemberReports.length
    );
    const improvingCount = filteredMemberReports.filter((report) => report.trendIndicator === 'improving').length;
    const attentionMembers = filteredMemberReports
      .filter((report) => report.trendIndicator === 'plateau' || report.trendIndicator === 'inactive')
      .map((report) => report.clientName);

    return { avgScore, improvingCount, attentionMembers };
  }, [filteredMemberReports]);

  /** Consistent styling for CoachX trend badges in the client list */
  const trendBadgeClass = (trend: MemberTrend): string => {
    switch (trend) {
      case 'improving': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'plateau':   return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'inactive':  return 'bg-red-50 text-red-600 border-red-200';
      case 'new':       return 'bg-sky-50 text-sky-700 border-sky-200';
    }
  };

  const trendLabel = (trend: MemberTrend): string => {
    switch (trend) {
      case 'improving': return t('coachx_trend_improving');
      case 'plateau':   return t('coachx_trend_plateau');
      case 'inactive':  return t('coachx_trend_inactive');
      case 'new':       return t('coachx_trend_new');
    }
  };

  const openAddModal = useCallback(() => {
    setEditingClient(null);
    setName('');
    setPhone('');
    setMemo('');
    setIsModalOpen(true);
  }, []);

  useEffect(() => {
    if (!autoOpenAddModal) {
      hasHandledAutoOpenRef.current = false;
      return;
    }
    if (hasHandledAutoOpenRef.current) return;
    hasHandledAutoOpenRef.current = true;
    openAddModal();
    onAutoOpenAddModalHandled?.();
  }, [autoOpenAddModal, onAutoOpenAddModalHandled, openAddModal]);

  const openEditModal = (client: ClientProfile) => {
    setEditingClient(client);
    setName(client.name);
    setPhone(client.phone);
    setMemo(client.memo || '');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !phone.trim()) {
      alert(t('coach_client_name_required'));
      return;
    }

    if (editingClient) {
      // Update - preserve coachId (designatedCoach는 App.tsx에서 자동 설정됨)
      onUpdate({
        ...editingClient,
        name,
        phone,
        memo,
        // coachId는 기존 값 유지 (변경하지 않음)
      });
    } else {
      // Add New
      // Check for duplicate in global list
      const existingClient = clients.find(
        (c) => c.name === name && c.phone === phone
      );

      if (existingClient) {
        // 다른 코치에게 배정된 회원인지 확인
        if (
          existingClient.coachId &&
          existingClient.coachId.trim() !== '' &&
          existingClient.coachId !== coachId
        ) {
          alert(t('coach_client_already_assigned'));
          return;
        }

        // 이미 현재 코치에게 배정된 회원
        if (existingClient.coachId === coachId) {
          alert(t('coach_client_already_registered'));
          return;
        }

        // coachId가 없는 경우 (할당되지 않은 회원) - 현재 코치에게 할당
        // 이 경우는 업데이트로 처리
        const updatedClient: ClientProfile = {
          ...existingClient,
          memo: memo || existingClient.memo,
          coachId: coachId, // 현재 코치에게 할당
        };
        onUpdate(updatedClient);
        setIsModalOpen(false);
        return;
      }

      // 새 회원 추가
      const newClient: ClientProfile = {
        name,
        phone,
        memo,
        isSubscribed: false,
        currentPoints: 0,
        coachId: coachId, // Automatically assign this coach
      };
      onAdd(newClient);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (client: ClientProfile) => {
    if (
      confirm(
        t('coach_client_remove_confirm').replace('{name}', client.name)
      )
    ) {
      // 회원 계정을 삭제하지 않고 coachId만 제거
      const updatedClient: ClientProfile = {
        ...client,
        coachId: undefined, // 담당 코치 해제
      };
      onUpdate(updatedClient);
    }
  };

  if (detailReport) {
    return (
      <MemberGrowthDetailScreen
        report={detailReport}
        onBack={() => setDetailReport(null)}
        onAskCoachX={(name) => onOpenCoachX?.(name)}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 text-ink-high">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="pl-0">
          <ArrowLeft className="w-5 h-5 mr-1" /> {t('coach_client_back')}
        </Button>
        <h2 className="text-xl font-bold text-ink-high">{pageTitle ?? t('coach_client_title')}</h2>
      </div>

      {/* Toolbar */}
      <div className={`flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center p-4 ${clientManagerPanelClass}`}>
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted pointer-events-none" />
          <input
            type="text"
            placeholder={t('coach_client_search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${clientFormInputClass} pl-10 py-3`}
          />
        </div>
        {showAddButton && (
          <button
            type="button"
            onClick={openAddModal}
            data-testid="coach-client-add-btn"
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 h-12 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white font-semibold shadow-elev-2 hover:from-emerald-400 hover:to-emerald-500 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 transition-all active:scale-[0.98]"
          >
            <UserPlus className="w-5 h-5" />
            <span>{t('coach_client_add_btn')}</span>
          </button>
        )}
      </div>

      {growthSummary && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent rounded-2xl p-4 text-ink-high border border-line-subtle shadow-lg shadow-black/20">
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2">
            {t('coachx_tab_members')}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-extrabold">{growthSummary.avgScore}</p>
              <p className="text-[10px] text-white/70">{t('coachx_members_avg_score')}</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-extrabold text-emerald-300">{growthSummary.improvingCount}</p>
              <p className="text-[10px] text-white/70">{t('coachx_stat_improving')}</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-extrabold text-amber-300">{growthSummary.attentionMembers.length}</p>
              <p className="text-[10px] text-white/70">{t('coachx_stat_attention')}</p>
            </div>
          </div>
          {growthSummary.attentionMembers.length > 0 && (
            <p className="mt-2 text-xs text-white/80 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-300" />
              {growthSummary.attentionMembers.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Client List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white/[0.03] rounded-2xl border border-dashed border-line-subtle">
            <div className="w-16 h-16 bg-white/[0.05] rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-ink-muted" />
            </div>
            <p className="text-ink-medium font-medium">
              {visibleClients.length === 0
                ? t('coach_client_empty')
                : t('coach_client_no_results')}
            </p>
          </div>
        ) : (
          filteredClients.map((client) => {
            const reportKey = clientKey(client.name, client.phone);
            const report = reportByKey[reportKey];
            const isMyClient = !!coachId && client.coachId === coachId;
            const assignmentLabel = !client.coachId
              ? t('coach_client_assignment_unassigned')
              : isMyClient
                ? t('coach_client_assignment_mine')
                : t('coach_client_assignment_other');

            return (
            <div
              key={reportKey}
               className="bg-white/[0.03] p-5 rounded-2xl border border-line-subtle shadow-lg shadow-black/20 hover:border-emerald-500/40 transition-all duration-200 group relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-emerald-500/20 text-emerald-200 rounded-full flex items-center justify-center font-bold text-lg shadow-sm border border-emerald-400/20">
                    {client.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                       <h3 className="font-bold text-ink-high">{client.name}</h3>
                      {client.isSubscribed && (
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">PRO</span>
                      )}
                      {report && (
                        <span
                          className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${trendBadgeClass(report.trendIndicator)}`}
                          aria-label={`Coachx: ${trendLabel(report.trendIndicator)}`}
                        >
                          {trendLabel(report.trendIndicator)}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                          isMyClient
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : client.coachId
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-white/[0.06] text-ink-medium border-line-subtle'
                        }`}
                      >
                        {assignmentLabel}
                      </span>
                    </div>
                     <p className="text-sm text-ink-muted flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {client.phone}
                    </p>
                    {client.email && (
                      <p className="text-xs text-ink-muted mt-0.5">
                        {client.email}
                      </p>
                    )}
                  </div>
                </div>
                {isMyClient && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditModal(client)}
                      className="p-2 text-ink-muted hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(client)}
                      className="p-2 text-ink-muted hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {client.memo && (
                <div className="bg-white/[0.04]/[0.04] p-3 rounded-xl mb-3 border border-line-subtle">
                  <p className="text-xs text-ink-medium line-clamp-2 flex gap-1">
                    <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />{' '}
                    {client.memo}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-ink-muted mt-2 pt-2 border-t border-line-subtle">
                <Briefcase className="w-3 h-3" />
                {client.golfExperience || t('coach_client_exp_none')}
              </div>
              <div className="mt-2 text-xs text-ink-muted space-y-1">
                {client.designatedCoach && (
                  <p>{t('coach_client_detail_designated_coach')}: {client.designatedCoach}</p>
                )}
                {typeof client.handicap === 'number' && (
                  <p>{t('coach_client_detail_handicap')}: {client.handicap}</p>
                )}
                {typeof client.bestScore === 'number' && (
                  <p>{t('coach_client_detail_best_score')}: {client.bestScore}</p>
                )}
                {typeof client.currentPoints === 'number' && (
                  <p>{t('coach_client_detail_current_points')}: {client.currentPoints}</p>
                )}
                {client.golfStartDate && (
                  <p>{t('coach_client_detail_golf_start_date')}: {client.golfStartDate}</p>
                )}
              </div>

              {onOpenStudentDetail && isMyClient && (
                <button
                  onClick={() => onOpenStudentDetail(client)}
                  data-testid={`open-student-detail-btn-${client.name}`}
                  className={`mt-3 ${clientCardActionButtonClass} bg-emerald-500 hover:bg-emerald-600 text-[#04150e] border border-emerald-400`}
                >
                  <FileBarChart className="w-4 h-4" />
                  학생 상세
                </button>
              )}
              {onViewLessons && isMyClient && (
                <button
                  onClick={() => onViewLessons(client)}
                  data-testid={`view-lessons-btn-${client.name}`}
                  className={`mt-2 ${clientCardActionButtonClass} bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20`}
                >
                  <BookOpen className="w-4 h-4" />
                  {t('coachx_stat_lessons')}
                </button>
              )}
              {onManagePackages && isMyClient && (
                <button
                  onClick={() => onManagePackages(client)}
                  className={`mt-2 ${clientCardActionButtonClass} bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20`}
                >
                  <ClipboardList className="w-4 h-4" />
                  {t('coach_client_package_manage')}
                </button>
              )}
              {onGenerateProgram && isMyClient && (
                <button
                  onClick={() => onGenerateProgram(client)}
                  className={`mt-2 ${clientCardActionButtonClass} bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20`}
                >
                  <Dumbbell className="w-4 h-4" />
                  {t('coach_client_training_create')}
                </button>
              )}
              {onOpenCoachX && report && isMyClient && (
                <button
                  onClick={() => setDetailReport(report)}
                  data-testid={`growth-report-btn-${client.name}`}
                  className={`mt-2 ${clientCardActionButtonClass} bg-white/[0.05] text-ink-high border border-line-subtle hover:bg-white/[0.08]`}
                >
                  <FileBarChart className="w-4 h-4" />
                  {t('coachx_view_full_report')}
                </button>
              )}
            </div>
            );
          })
        )}
      </div>

      {/* Floating add button — always reachable while scrolling the roster */}
      {showAddButton && !isModalOpen && (
        <button
          type="button"
          onClick={openAddModal}
          data-testid="coach-client-add-fab"
          aria-label={t('coach_client_add_btn')}
          className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-glow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </button>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div
          data-testid="coach-client-add-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-client-modal-title"
          onClick={() => setIsModalOpen(false)}
          // - height: 100dvh keeps items-end anchored to the *visible*
          //   viewport bottom (Android Capacitor WebView's layout viewport
          //   can extend behind the OS gesture bar).
          // - paddingBottom reserves clearance for the fixed CoachBottomNav
          //   (~4rem + safe area) so the sticky save button never sits
          //   behind it — CoachBottomNav uses `backdrop-blur-xl` which
          //   spawns its own stacking context and can outcompete a plain
          //   z-index on some Chromium builds. Belt-and-suspenders with
          //   the bumped z-[100] above.
          style={{
            height: '100dvh',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.5rem)',
          }}
          className="fixed inset-x-0 top-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4 animate-fade-in overscroll-contain"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight:
                'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 5.5rem)',
            }}
            className="bg-bg-overlay text-ink-high w-full max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-elev-4 border border-line-strong flex flex-col animate-slide-in-up"
          >
            {/* Header — solid emerald so the surface is unmistakably present */}
            <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-700 px-6 py-5 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shadow-inner">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="coach-client-modal-title" className="font-bold text-lg leading-tight">
                    {editingClient ? t('coach_client_form_title_edit') : t('coach_client_form_title_new')}
                  </h3>
                  {!editingClient && (
                    <p className="text-xs text-emerald-100/90 mt-0.5">
                      {t('coach_client_form_hint')}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label={t('coach_client_back')}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-semibold text-ink-high mb-1.5">
                    {t('coach_client_name_label')} <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`${clientFormInputClass} pl-10`}
                      placeholder={t('coach_client_name_placeholder')}
                      required
                      autoFocus
                      inputMode="text"
                      autoComplete="name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-ink-high mb-1.5">
                    {t('coach_client_phone_label')} <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatKoreanPhone(e.target.value))}
                      className={`${clientFormInputClass} pl-10 tracking-wide`}
                      placeholder="010-0000-0000"
                      required
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={13}
                    />
                  </div>
                  <p className="text-[11px] text-ink-muted mt-1.5 leading-snug">
                    {t('coach_client_phone_note')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-ink-high mb-1.5">
                    {t('coach_client_memo_label')}
                    <span className="ml-2 text-[11px] font-normal text-ink-muted">
                      {t('coach_client_form_optional')}
                    </span>
                  </label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3.5 top-3.5 w-4 h-4 text-ink-muted pointer-events-none" />
                    <textarea
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      className={`${clientFormInputClass} pl-10 min-h-[88px] max-h-[140px] resize-none`}
                      placeholder={t('coach_client_memo_placeholder')}
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Sticky action bar — safe-area aware so Save never hides under the home indicator or keyboard */}
              <div
                className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-4 border-t border-line-strong bg-bg-overlay flex gap-3 shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.5)]"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
              >
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 h-12 rounded-xl bg-white/[0.06] text-ink-high border border-line-default hover:bg-white/[0.1] transition-colors font-medium"
                >
                  {t('coach_client_cancel_btn')}
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || !phone.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white font-semibold shadow-elev-2 hover:from-emerald-400 hover:to-emerald-500 hover:shadow-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-emerald-500 disabled:hover:to-emerald-600 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  <Save className="w-4 h-4" />
                  {t('coach_client_save_btn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
