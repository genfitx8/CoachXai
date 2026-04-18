import React, { useState, useEffect } from 'react';
import { CoachProfile, LessonReservation, ReservationStatus } from '../types';
import { reservationService } from '../services/reservationService';
import { Calendar, Clock, User, Phone, CheckCircle, XCircle, Plus, ArrowLeft, Filter, Ban } from 'lucide-react';
import { Button } from './Button';

interface ReservationManagerProps {
  coachProfile: CoachProfile;
  onBack: () => void;
}

export const ReservationManager: React.FC<ReservationManagerProps> = ({ coachProfile, onBack }) => {
  const [reservations, setReservations] = useState<LessonReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'ALL'>('ALL');

  // Form state for creating slots
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const loadReservations = async () => {
    setLoading(true);
    try {
      const data = await reservationService.getCoachReservations(coachProfile.id);
      setReservations(data);
    } catch (error) {
      console.error('Failed to load reservations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
  }, [coachProfile.id]);

  const handleBlockSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !startTime || !endTime) {
      alert('날짜와 시간을 모두 입력해주세요.');
      return;
    }

    const startDateTime = `${startDate}T${startTime}:00`;
    const endDateTime = `${startDate}T${endTime}:00`;

    try {
      await reservationService.createBlockedSlot(
        coachProfile.id,
        coachProfile.name,
        startDateTime,
        endDateTime,
        blockReason || undefined
      );
      
      alert('시간대가 블럭되었습니다.');
      setShowCreateForm(false);
      setStartDate('');
      setStartTime('');
      setEndTime('');
      setBlockReason('');
      loadReservations();
    } catch (error: any) {
      alert(error.message || '시간대 블럭에 실패했습니다.');
    }
  };

  const handleApprove = async (reservationId: string) => {
    if (!confirm('이 예약을 승인하시겠습니까?')) return;
    
    try {
      await reservationService.approveReservation(reservationId);
      alert('예약이 승인되었습니다.');
      loadReservations();
    } catch (error: any) {
      alert(error.message || '승인에 실패했습니다.');
    }
  };

  const handleReject = async (reservationId: string) => {
    const reason = prompt('거부 사유를 입력해주세요 (선택사항):');
    if (reason === null) return; // User cancelled
    
    try {
      await reservationService.rejectReservation(reservationId, reason || undefined);
      alert('예약이 거부되었습니다.');
      loadReservations();
    } catch (error: any) {
      alert(error.message || '거부에 실패했습니다.');
    }
  };

  const handleCancel = async (reservationId: string) => {
    if (!confirm('이 예약을 취소하시겠습니까?')) return;
    
    try {
      await reservationService.cancelReservation(reservationId);
      alert('예약이 취소되었습니다.');
      loadReservations();
    } catch (error: any) {
      alert(error.message || '취소에 실패했습니다.');
    }
  };

  const getStatusColor = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'BLOCKED':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'CONFIRMED':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'CANCELLED':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getBorderColor = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return 'border-gray-100';
      case 'BLOCKED':
        return 'border-red-200';
      case 'PENDING':
        return 'border-yellow-100';
      case 'CONFIRMED':
        return 'border-green-100';
      case 'CANCELLED':
        return 'border-red-100';
      case 'COMPLETED':
        return 'border-blue-100';
      default:
        return 'border-gray-100';
    }
  };

  const getStatusText = (status: ReservationStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return '예약 가능';
      case 'BLOCKED':
        return '블럭됨';
      case 'PENDING':
        return '대기중';
      case 'CONFIRMED':
        return '승인됨';
      case 'CANCELLED':
        return '취소됨';
      case 'COMPLETED':
        return '완료됨';
      default:
        return status;
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredReservations = filterStatus === 'ALL' 
    ? reservations 
    : reservations.filter(r => r.status === filterStatus);

  const pendingCount = reservations.filter(r => r.status === 'PENDING').length;
  const confirmedCount = reservations.filter(r => r.status === 'CONFIRMED').length;
  const blockedCount = reservations.filter(r => r.status === 'BLOCKED').length;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">예약 관리</h1>
              <p className="text-sm text-gray-600">{coachProfile.name} 코치</p>
            </div>
          </div>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2"
          >
            <Ban className="w-4 h-4" />
            {showCreateForm ? '취소' : '시간대 블럭하기'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600">전체 예약</p>
            <p className="text-2xl font-bold text-gray-900">{reservations.length}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-yellow-700">대기중</p>
            <p className="text-2xl font-bold text-yellow-900">{pendingCount}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-green-700">승인됨</p>
            <p className="text-2xl font-bold text-green-900">{confirmedCount}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-red-700">블럭됨</p>
            <p className="text-2xl font-bold text-red-900">{blockedCount}</p>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">예약 불가능 시간대 블럭하기</h2>
            <p className="text-sm text-gray-600 mb-4">
              기본적으로 모든 시간이 예약 가능합니다. 레슨이 불가능한 시간대만 블럭하세요.
            </p>
            <form onSubmit={handleBlockSlot} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    날짜
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    시작 시간
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    종료 시간
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  블럭 사유 (선택사항)
                </label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="예: 휴무일, 점심시간, 개인 일정 등"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  블럭하기
                </Button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filter */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition whitespace-nowrap ${
                filterStatus === 'ALL' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setFilterStatus('PENDING')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition whitespace-nowrap ${
                filterStatus === 'PENDING' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              대기중 ({pendingCount})
            </button>
            <button
              onClick={() => setFilterStatus('CONFIRMED')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition whitespace-nowrap ${
                filterStatus === 'CONFIRMED' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              승인됨
            </button>
            <button
              onClick={() => setFilterStatus('BLOCKED')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition whitespace-nowrap ${
                filterStatus === 'BLOCKED' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              블럭됨 ({blockedCount})
            </button>
          </div>
        </div>

        {/* Reservations List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-gray-600 mt-4">로딩 중...</p>
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {filterStatus === 'ALL' ? '예약이 없습니다.' : `${getStatusText(filterStatus as ReservationStatus)} 예약이 없습니다.`}
              </p>
            </div>
          ) : (
            filteredReservations.map((reservation) => (
              <div
                key={reservation.id}
                className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${getBorderColor(reservation.status)}`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(reservation.status)}`}>
                        {getStatusText(reservation.status)}
                      </span>
                      {reservation.lessonType && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          {reservation.lessonType}
                        </span>
                      )}
                      {reservation.blockReason && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-semibold">
                          {reservation.blockReason}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-gray-700 mb-1">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">
                        {formatDateTime(reservation.startTime)} - {new Date(reservation.endTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {reservation.clientName && (
                      <>
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <User className="w-4 h-4 text-gray-400" />
                          <span>{reservation.clientName}</span>
                        </div>
                        {reservation.clientPhone && (
                          <div className="flex items-center gap-2 text-gray-600 text-sm">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <span>{reservation.clientPhone}</span>
                          </div>
                        )}
                      </>
                    )}
                    {reservation.notes && (
                      <p className="text-sm text-gray-600 mt-2 italic">{reservation.notes}</p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {reservation.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleApprove(reservation.id)}
                          className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm"
                        >
                          <CheckCircle className="w-4 h-4" />
                          승인
                        </button>
                        <button
                          onClick={() => handleReject(reservation.id)}
                          className="flex items-center gap-1 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm"
                        >
                          <XCircle className="w-4 h-4" />
                          거부
                        </button>
                      </>
                    )}
                    {(reservation.status === 'AVAILABLE' || reservation.status === 'CONFIRMED' || reservation.status === 'BLOCKED') && (
                      <button
                        onClick={() => handleCancel(reservation.id)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition text-sm"
                      >
                        {reservation.status === 'BLOCKED' ? '해제' : '취소'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
