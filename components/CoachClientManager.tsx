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
}

export const CoachClientManager: React.FC<CoachClientManagerProps> = ({
  clients,
  onAdd,
  onUpdate,
  onDelete,
  onBack,
  coachId,
  onManagePackages,
  onViewLessons,
  onGenerateProgram,
  memberReports,
  onOpenCoachX,
  showAddButton = true,
  autoOpenAddModal = false,
  onAutoOpenAddModalHandled,
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

  const panelClass = 'bg-slate-900/70 border border-slate-800/80 rounded-2xl shadow-lg shadow-black/20';
  const inputClass =
    'w-full px-4 py-2.5 border border-slate-700 rounded-xl bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none';
  const cardActionClass =
    'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl transition-colors text-sm font-semibold';

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
    <div className="space-y-6 animate-fade-in pb-12 text-slate-100">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="pl-0">
          <ArrowLeft className="w-5 h-5 mr-1" /> {t('coach_client_back')}
        </Button>
        <h2 className="text-xl font-bold text-slate-100">{t('coach_client_title')}</h2>
      </div>

      {/* Toolbar */}
      <div className={`flex flex-col sm:flex-row gap-4 justify-between items-center p-4 ${panelClass}`}>
        <div className="relative w-full sm:w-auto flex-1">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder={t('coach_client_search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${inputClass} pl-10`}
          />
        </div>
        {showAddButton && (
          <Button
            onClick={openAddModal}
            data-testid="coach-client-add-btn"
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 rounded-xl"
          >
            <UserPlus className="w-5 h-5 mr-2" /> {t('coach_client_add_btn')}
          </Button>
        )}
      </div>

      {growthSummary && (
        <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700 rounded-2xl p-4 text-white border border-slate-700/70 shadow-lg shadow-black/20">
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
          <div className="col-span-full text-center py-12 bg-slate-900/70 rounded-2xl border border-dashed border-slate-700/80">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-slate-500" />
            </div>
            <p className="text-slate-300 font-medium">
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
               className="bg-slate-900/70 p-5 rounded-2xl border border-slate-800/80 shadow-lg shadow-black/20 hover:border-indigo-500/40 transition-all duration-200 group relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-indigo-200 rounded-full flex items-center justify-center font-bold text-lg shadow-sm border border-indigo-400/20">
                    {client.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                       <h3 className="font-bold text-slate-100">{client.name}</h3>
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
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : client.coachId
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {assignmentLabel}
                      </span>
                    </div>
                     <p className="text-sm text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {client.phone}
                    </p>
                    {client.email && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {client.email}
                      </p>
                    )}
                  </div>
                </div>
                {isMyClient && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditModal(client)}
                      className="p-2 text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(client)}
                      className="p-2 text-slate-500 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {client.memo && (
                <div className="bg-slate-800/80 p-3 rounded-xl mb-3 border border-slate-700/70">
                  <p className="text-xs text-slate-300 line-clamp-2 flex gap-1">
                    <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />{' '}
                    {client.memo}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 pt-2 border-t border-slate-800">
                <Briefcase className="w-3 h-3" />
                {client.golfExperience || t('coach_client_exp_none')}
              </div>
              <div className="mt-2 text-xs text-slate-500 space-y-1">
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

              {onViewLessons && isMyClient && (
                <button
                  onClick={() => onViewLessons(client)}
                  data-testid={`view-lessons-btn-${client.name}`}
                  className={`mt-3 ${cardActionClass} bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20`}
                >
                  <BookOpen className="w-4 h-4" />
                  {t('coachx_stat_lessons')}
                </button>
              )}
              {onManagePackages && isMyClient && (
                <button
                  onClick={() => onManagePackages(client)}
                  className={`mt-2 ${cardActionClass} bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20`}
                >
                  <ClipboardList className="w-4 h-4" />
                  {t('coach_client_package_manage')}
                </button>
              )}
              {onGenerateProgram && isMyClient && (
                <button
                  onClick={() => onGenerateProgram(client)}
                  className={`mt-2 ${cardActionClass} bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20`}
                >
                  <Dumbbell className="w-4 h-4" />
                  {t('coach_client_training_create')}
                </button>
              )}
              {onOpenCoachX && report && isMyClient && (
                <button
                  onClick={() => setDetailReport(report)}
                  data-testid={`growth-report-btn-${client.name}`}
                  className={`mt-2 ${cardActionClass} bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700`}
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

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div
          data-testid="coach-client-add-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
        >
          <div className="bg-slate-900 text-slate-100 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-700/80">
            <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white border-b border-slate-700">
              <h3 className="font-bold text-lg">
                {editingClient ? t('coach_client_form_title_edit') : t('coach_client_form_title_new')}
              </h3>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {t('coach_client_name_label')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder={t('coach_client_name_placeholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {t('coach_client_phone_label')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="010-0000-0000"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {t('coach_client_phone_note')}
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {t('coach_client_memo_label')}
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className={inputClass}
                  placeholder={t('coach_client_memo_placeholder')}
                  rows={3}
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500"
                >
                  <Save className="w-4 h-4 mr-2" /> {t('coach_client_save_btn')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
