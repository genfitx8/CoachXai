import React, { useState, useEffect, useCallback } from 'react';
import { BayReservation, BayReservationStatus, ClientProfile } from '../types';
import { bayReservationService } from '../services/bayReservationService';
import { ArrowLeft, Calendar, Clock, Target, MapPin, AlertCircle, Loader, CheckCircle, XCircle, Clock3 } from 'lucide-react';
import { Button } from './Button';

interface MyBayReservationsProps {
  clientProfile: ClientProfile;
  onBack: () => void;
  overrideClientId?: string; // Allows coach profiles to pass their coach ID directly
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function formatHourRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fmt(s)} ~ ${fmt(e)}`;
}

const STATUS_CONFIG: Record<
  BayReservationStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  CONFIRMED: {
    label: '예약 확정',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
  CANCEL_REQUESTED: {
    label: '취소 요청',
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    icon: <Clock3 className="w-3.5 h-3.5" />,
  },
  CANCELLED: {
    label: '취소됨',
    color: 'text-gray-500 bg-gray-50 border-gray-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  REJECTED: {
    label: '거절됨',
    color: 'text-red-500 bg-red-50 border-red-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

export const MyBayReservations: React.FC<MyBayReservationsProps> = ({
  clientProfile,
  onBack,
  overrideClientId,
}) => {
  const [reservations, setReservations] = useState<BayReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const clientId = overrideClientId ?? `${clientProfile.name}_${clientProfile.phone}`;

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await bayReservationService.getClientReservations(clientId);
      // Sort by startTime descending (most recent first)
      list.sort((a, b) => b.startTime.localeCompare(a.startTime));
      setReservations(list);
    } catch (e) {
      setError('예약 목록을 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  const handleRequestCancel = async (reservationId: string) => {
    setCancelingId(reservationId);
    setError(null);
    try {
      await bayReservationService.requestCancellation(reservationId, clientId);
      setConfirmCancelId(null);
      await loadReservations();
    } catch (e: any) {
      setError(e?.message ?? '취소 요청에 실패했습니다.');
    } finally {
      setCancelingId(null);
    }
  };

  const upcomingReservations = reservations.filter(
    (r) => r.status === 'CONFIRMED' || r.status === 'CANCEL_REQUESTED'
  );
  const pastReservations = reservations.filter(
    (r) => r.status === 'CANCELLED' || r.status === 'REJECTED'
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-bold text-lg text-gray-900">나의 타석 예약</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        )}

        {!loading && reservations.length === 0 && (
          <div className="text-center py-16">
            <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">예약 내역이 없습니다.</p>
          </div>
        )}

        {/* Upcoming / Active reservations */}
        {!loading && upcomingReservations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">진행 중인 예약</h2>
            {upcomingReservations.map((res) => {
              const cfg = STATUS_CONFIG[res.status];
              const isCanceling = cancelingId === res.id;
              const isConfirming = confirmCancelId === res.id;

              return (
                <div
                  key={res.id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                >
                  <div className="px-4 py-3 space-y-2">
                    {/* Status badge */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border ${cfg.color}`}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </span>
                      <span className="text-xs text-gray-400 font-mono truncate max-w-[50%]">{res.id}</span>
                    </div>

                    {/* Details */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{formatDateOnly(res.startTime)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span>{formatHourRange(res.startTime, res.endTime)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Target className="w-4 h-4 text-gray-400" />
                        <span>타석 ID: {res.bayId}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span>지점 ID: {res.branchId}</span>
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        차감 포인트: <span className="font-bold text-gray-700">{res.paidPoints.toLocaleString()}pt</span>
                      </span>
                    </div>
                  </div>

                  {/* Cancel button (only for CONFIRMED) */}
                  {res.status === 'CONFIRMED' && (
                    <div className="border-t border-gray-100 px-4 py-2">
                      {!isConfirming ? (
                        <button
                          onClick={() => setConfirmCancelId(res.id)}
                          className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                        >
                          취소 요청
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">정말 취소 요청하시겠습니까?</span>
                          <button
                            onClick={() => handleRequestCancel(res.id)}
                            disabled={isCanceling}
                            className="text-xs font-bold text-red-500 hover:text-red-600 disabled:opacity-50"
                          >
                            {isCanceling ? '처리 중...' : '확인'}
                          </button>
                          <button
                            onClick={() => setConfirmCancelId(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            취소
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {res.status === 'CANCEL_REQUESTED' && res.cancelRequestedAt && (
                    <div className="border-t border-gray-100 px-4 py-2">
                      <span className="text-xs text-orange-500">
                        취소 요청일: {new Date(res.cancelRequestedAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Past reservations */}
        {!loading && pastReservations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">지난 예약</h2>
            {pastReservations.map((res) => {
              const cfg = STATUS_CONFIG[res.status];
              return (
                <div
                  key={res.id}
                  className="bg-white border border-gray-100 rounded-xl px-4 py-3 opacity-70 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border ${cfg.color}`}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-300" />
                      <span>{formatDateOnly(res.startTime)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Clock className="w-4 h-4 text-gray-300" />
                      <span>{formatHourRange(res.startTime, res.endTime)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {res.paidPoints.toLocaleString()}pt 차감
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
