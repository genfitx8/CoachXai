import React, { useState, useEffect } from 'react';
import { ClientProfile, CoachProfile } from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { pointService } from '../services/pointService';
import { Button } from './Button';
import { Search, Gift, User, CheckCircle, X } from 'lucide-react';
import { createLogger } from '../utils/logger';

const log = createLogger('branchMemberPointGrant');

interface BranchMemberPointGrantProps {
  branchAdminUsername: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

type RecipientType = 'MEMBER' | 'COACH';

interface Recipient {
  type: RecipientType;
  name: string;
  phone: string;
  currentPoints: number;
  /** Original profile; cast as needed */
  profile: ClientProfile | CoachProfile;
}

export const BranchMemberPointGrant: React.FC<BranchMemberPointGrantProps> = ({
  branchAdminUsername,
  onSuccess,
  onError,
}) => {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [pointsInput, setPointsInput] = useState('');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecipients();
  }, []);

  const loadRecipients = async () => {
    setLoading(true);
    try {
      let clients: ClientProfile[] = [];
      let coaches: CoachProfile[] = [];

      if (firebaseService.isInitialized()) {
        [clients, coaches] = await Promise.all([
          firebaseService.getClients(),
          firebaseService.getCoaches(),
        ]);
      } else {
        clients = storageService.getClients();
        coaches = storageService.getCoaches();
      }

      const memberRecipients: Recipient[] = clients.map((c) => ({
        type: 'MEMBER',
        name: c.name,
        phone: c.phone ?? '',
        currentPoints: c.currentPoints ?? 0,
        profile: c,
      }));

      const coachRecipients: Recipient[] = coaches.map((c) => ({
        type: 'COACH',
        name: c.name,
        phone: c.phone ?? '',
        currentPoints: c.currentPoints ?? 0,
        profile: c,
      }));

      setRecipients([...memberRecipients, ...coachRecipients]);
    } catch (e) {
      log.error('Failed to load recipients', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredRecipients =
    searchQuery.trim().length > 0
      ? recipients.filter(
          (r) =>
            r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.phone.includes(searchQuery)
        )
      : [];

  const handleSelectRecipient = (recipient: Recipient) => {
    setSelectedRecipient(recipient);
    setSearchQuery('');
  };

  const handleClearRecipient = () => {
    setSelectedRecipient(null);
    setPointsInput('');
    setMemo('');
  };

  const handleSubmit = async () => {
    if (!selectedRecipient) {
      onError('회원을 선택해 주세요.');
      return;
    }

    const trimmed = pointsInput.trim();
    if (!trimmed) {
      onError('지급할 포인트를 입력해 주세요.');
      return;
    }

    const points = Number(trimmed);
    if (!Number.isInteger(points) || isNaN(points)) {
      onError('포인트는 정수로 입력해 주세요.');
      return;
    }

    if (points <= 0) {
      onError('포인트는 1 이상의 양수여야 합니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      let updatedPoints: number;
      const memoValue = memo.trim() || undefined;

      if (selectedRecipient.type === 'COACH') {
        const updatedCoach = await pointService.grantPointsToCoach(
          selectedRecipient.profile as CoachProfile,
          points,
          branchAdminUsername,
          memoValue
        );
        updatedPoints = updatedCoach.currentPoints ?? 0;
        const updatedRecipient: Recipient = {
          ...selectedRecipient,
          currentPoints: updatedPoints,
          profile: updatedCoach,
        };
        setSelectedRecipient(updatedRecipient);
        setRecipients((prev) =>
          prev.map((r) =>
            r.type === 'COACH' &&
            (r.profile as CoachProfile).id === updatedCoach.id
              ? updatedRecipient
              : r
          )
        );
      } else {
        const updatedClient = await pointService.grantPoints(
          selectedRecipient.profile as ClientProfile,
          points,
          branchAdminUsername,
          memoValue
        );
        updatedPoints = updatedClient.currentPoints ?? 0;
        const updatedRecipient: Recipient = {
          ...selectedRecipient,
          currentPoints: updatedPoints,
          profile: updatedClient,
        };
        setSelectedRecipient(updatedRecipient);
        setRecipients((prev) =>
          prev.map((r) =>
            r.type === 'MEMBER' &&
            r.name === updatedClient.name &&
            r.phone === updatedClient.phone
              ? updatedRecipient
              : r
          )
        );
      }

      setPointsInput('');
      setMemo('');
      const typeLabel = selectedRecipient.type === 'COACH' ? '코치' : '회원';
      onSuccess(
        `${selectedRecipient.name} ${typeLabel}에게 ${points.toLocaleString()} 포인트를 지급했습니다.`
      );
    } catch (e) {
      log.error('Failed to grant points', e);
      onError('포인트 지급 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
      <h3 className="font-bold text-gray-900">회원 포인트 지급</h3>

      {/* Member/Coach Search */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-gray-500 uppercase">
          회원 검색
        </label>

        {selectedRecipient ? (
          <div
            data-testid="selected-member-card"
            className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
          >
            <CheckCircle className="w-5 h-5 text-emerald-700 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">
                {selectedRecipient.name}
                <span
                  data-testid="recipient-type-badge"
                  className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded ${
                    selectedRecipient.type === 'COACH'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {selectedRecipient.type === 'COACH' ? '코치' : '회원'}
                </span>
              </p>
              <p className="text-xs text-gray-500">{selectedRecipient.phone}</p>
            </div>
            <span className="text-sm font-bold text-emerald-700 whitespace-nowrap">
              현재 잔액: {(selectedRecipient.currentPoints ?? 0).toLocaleString()} P
            </span>
            <button
              type="button"
              onClick={handleClearRecipient}
              aria-label="회원 선택 해제"
              className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 또는 전화번호로 검색"
                aria-label="회원 검색"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            {loading && (
              <p className="text-xs text-gray-400 px-1">회원 목록 불러오는 중...</p>
            )}

            {!loading && filteredRecipients.length > 0 && (
              <ul
                role="listbox"
                aria-label="회원 목록"
                className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden shadow-sm"
              >
                {filteredRecipients.slice(0, 5).map((r) => (
                  <li key={r.type === 'COACH' ? `COACH_${(r.profile as CoachProfile).id}` : `MEMBER_${r.name}_${r.phone}`} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => handleSelectRecipient(r)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 transition-colors text-left"
                    >
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {r.name}
                          <span
                            className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded ${
                              r.type === 'COACH'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {r.type === 'COACH' ? '코치' : '회원'}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">{r.phone}</p>
                      </div>
                      <span className="text-xs text-emerald-600 font-semibold whitespace-nowrap">
                        {(r.currentPoints ?? 0).toLocaleString()} P
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!loading && searchQuery.trim().length > 0 && filteredRecipients.length === 0 && (
              <p className="text-xs text-gray-400 px-1">검색 결과가 없습니다.</p>
            )}
          </>
        )}
      </div>

      {/* Points Input */}
      <div className="space-y-1">
        <label className="block text-xs font-bold text-gray-500 uppercase">
          지급 포인트 *
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={pointsInput}
          onChange={(e) => setPointsInput(e.target.value)}
          placeholder="예: 500"
          aria-label="지급 포인트"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {/* Memo Input */}
      <div className="space-y-1">
        <label className="block text-xs font-bold text-gray-500 uppercase">
          사유 / 메모 (선택)
        </label>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 이벤트 참여 보상"
          aria-label="사유 메모"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm py-3"
      >
        <Gift className="w-4 h-4" />
        {isSubmitting ? '처리 중...' : '포인트 지급'}
      </Button>
    </div>
  );
};
