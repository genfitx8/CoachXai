import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserX,
} from 'lucide-react';
import {
  apiService,
  type ClientCleanupResult,
  type ClientDuplicateGroup,
  type ClientDuplicateReport,
} from '../services/apiService';

/**
 * 중복 · 유령 회원 정리 (관리자 전용)
 *
 * 코치 화면은 이제 회원 목록을 사람 단위로 접어 보여주므로 잔재 행이 눈에
 * 띄지 않지만, 행 자체는 clients 테이블에 그대로 남아 있다 — 레슨 중 동반의
 * 전체 학생이 433명으로 부풀었던 그 행들. 여기서 무엇이 몇 줄 남았는지 보고,
 * 지워도 아무것도 잃지 않는 행만 지운다.
 *
 * 판정은 전부 서버가 한다. 이 화면은 서버가 지울 수 있다고 표시한 행만 보내고,
 * 서버는 받은 목록을 지우기 직전에 같은 규칙으로 다시 판정한다 — 그 사이
 * 학생이 가입했거나 레슨이 붙었다면 지워지지 않고 이유가 돌아온다.
 */

const formatPhone = (phone: string | null): string => phone?.trim() || '번호 없음';

const formatDate = (ms: number): string => {
  if (!ms) return '-';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

interface GroupCardProps {
  group: ClientDuplicateGroup;
  busy: boolean;
  onCleanGroup: (ids: string[]) => void;
}

const GroupCard: React.FC<GroupCardProps> = ({ group, busy, onCleanGroup }) => {
  const [open, setOpen] = useState(false);
  const removableIds = useMemo(
    () => group.members.filter((m) => m.removable).map((m) => m.id),
    [group]
  );

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-900 truncate">
            {group.name}
            <span className="ml-2 text-sm font-normal text-gray-500">
              {formatPhone(group.phone)}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {group.members.length}줄
            {removableIds.length > 0 && (
              <span className="text-red-600 font-bold"> · 정리 대상 {removableIds.length}줄</span>
            )}
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          <ul className="divide-y divide-gray-100">
            {group.members.map((member) => (
              <li
                key={member.id}
                className="px-4 py-3 flex items-start gap-3 text-sm"
                data-testid="cleanup-member-row"
              >
                <div className="mt-0.5 flex-shrink-0">
                  {member.keep ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-600" aria-label="남길 행" />
                  ) : member.removable ? (
                    <UserX className="w-4 h-4 text-red-500" aria-label="정리 대상" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-gray-300" aria-label="유지" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-gray-800 truncate">
                    {member.name}
                    <span className="ml-2 text-gray-500">{formatPhone(member.phone)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    등록 {formatDate(member.createdAt)} ·{' '}
                    {member.signedUp ? '가입 계정 있음' : '가입 흔적 없음'} · 연결 데이터{' '}
                    {member.referenceCount}건
                    {member.designatedCoach ? ` · 담당 ${member.designatedCoach}` : ''}
                  </div>
                </div>
                <div className="flex-shrink-0 text-xs font-bold">
                  {member.keep ? (
                    <span className="text-emerald-600">남김</span>
                  ) : member.removable ? (
                    <span className="text-red-600">정리 대상</span>
                  ) : (
                    <span className="text-gray-400">{member.blockedReason}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {removableIds.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => onCleanGroup(removableIds)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />이 회원의 잔재 {removableIds.length}줄 정리
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AdminMemberCleanup: React.FC = () => {
  const [report, setReport] = useState<ClientDuplicateReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClientCleanupResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await apiService.getClientDuplicates());
    } catch (e) {
      setError(e instanceof Error ? e.message : '보고서를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runCleanup = useCallback(
    async (target: { ids: string[] } | { all: true }, confirmMessage: string) => {
      // 되돌릴 수 없는 삭제 — 한 번은 반드시 묻는다.
      if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;
      setBusy(true);
      setError(null);
      try {
        const res = await apiService.cleanupClientDuplicates(target);
        setResult(res);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : '정리에 실패했습니다.');
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const groups = report?.groups ?? [];
  const removableTotal = report?.removableTotal ?? 0;

  return (
    <div className="space-y-4" data-testid="admin-member-cleanup">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <UserX className="w-5 h-5" /> 중복 · 유령 회원 정리
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          다시 검사
        </button>
      </div>

      <p className="text-sm text-gray-600">
        같은 사람이 여러 줄로 남아 있거나 가입 흔적이 없는 회원 행을 찾습니다. 로그인 계정이
        있는 회원, 레슨·예약·포인트가 연결된 행, 그리고 그 사람을 대표해 남길 한 줄은 정리
        대상에서 제외됩니다. 삭제는 되돌릴 수 없습니다.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {report && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-white border border-gray-200">
            <div className="text-xs text-gray-500">전체 회원 행</div>
            <div className="text-xl font-bold text-gray-900">{report.totalClients}</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-gray-200">
            <div className="text-xs text-gray-500">가입 흔적 없는 행</div>
            <div className="text-xl font-bold text-gray-900">{report.phantomTotal}</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-gray-200">
            <div className="text-xs text-gray-500">정리 대상</div>
            <div className="text-xl font-bold text-red-600" data-testid="cleanup-removable-total">
              {removableTotal}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <div className="font-bold">{result.deleted}줄을 정리했습니다.</div>
          {result.skipped.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-emerald-900/80">
              {result.skipped.slice(0, 5).map((s) => (
                <li key={s.id}>
                  건너뜀 — {s.name || s.id}: {s.reason}
                </li>
              ))}
              {result.skipped.length > 5 && <li>… 외 {result.skipped.length - 5}줄</li>}
            </ul>
          )}
        </div>
      )}

      {removableTotal > 0 && (
        <button
          type="button"
          disabled={busy || loading}
          data-testid="cleanup-all"
          onClick={() =>
            void runCleanup(
              { all: true },
              `정리 대상 ${removableTotal}줄을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`
            )
          }
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          정리 대상 {removableTotal}줄 한 번에 정리
        </button>
      )}

      {loading && !report ? (
        <div className="py-12 text-center text-sm text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          회원 테이블을 검사하는 중입니다…
        </div>
      ) : groups.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-xl border border-dashed border-gray-300">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <div className="font-bold text-gray-800">정리할 회원 행이 없습니다</div>
          <p className="text-sm text-gray-500 mt-1">
            중복으로 남은 줄도, 가입 흔적 없는 줄도 발견되지 않았습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <GroupCard
              key={group.identityKey}
              group={group}
              busy={busy || loading}
              onCleanGroup={(ids) =>
                void runCleanup(
                  { ids },
                  `${group.name}님의 잔재 ${ids.length}줄을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
