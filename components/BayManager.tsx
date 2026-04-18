import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './Button';
import { LayoutGrid, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Bay } from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

// ─── helpers ──────────────────────────────────────────────────────────────────

function bayLabel(bay: Bay): string {
  return `${bay.floor}층 ${bay.roomNumber}번`;
}

function generateId(): string {
  return `bay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Unified persistence helper (Firebase when available, localStorage otherwise)
const bayPersist = {
  getBays: async (branchId: string): Promise<Bay[]> =>
    firebaseService.isInitialized()
      ? firebaseService.getBays(branchId)
      : Promise.resolve(storageService.getBays(branchId)),

  saveBay: async (bay: Bay): Promise<void> => {
    if (firebaseService.isInitialized()) {
      await firebaseService.saveBay(bay);
    } else {
      storageService.saveBay(bay);
    }
  },

  updateBay: async (bayId: string, fields: Partial<Omit<Bay, 'id'>>): Promise<void> => {
    if (firebaseService.isInitialized()) {
      await firebaseService.updateBay(bayId, fields);
    } else {
      storageService.updateBay(bayId, fields);
    }
  },

  deleteBay: async (bayId: string): Promise<void> => {
    if (firebaseService.isInitialized()) {
      await firebaseService.deleteBay(bayId);
    } else {
      storageService.deleteBay(bayId);
    }
  },
};

// ─── types ────────────────────────────────────────────────────────────────────

interface BayManagerProps {
  branchId: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export const BayManager: React.FC<BayManagerProps> = ({
  branchId,
  onSuccess,
  onError,
}) => {
  const [bays, setBays] = useState<Bay[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New bay form
  const [newFloor, setNewFloor] = useState('');
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // ── fetch ────────────────────────────────────────────────────────────────────

  const fetchBays = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bayPersist.getBays(branchId);
      // Show active bays first, then inactive; within each group sort by floor then roomNumber
      const sorted = [...data].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.floor !== b.floor) return a.floor.localeCompare(b.floor, 'ko');
        return a.roomNumber.localeCompare(b.roomNumber, 'ko', { numeric: true });
      });
      setBays(sorted);
    } catch (e) {
      console.error('Failed to fetch bays:', e);
      onError?.('타석 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [branchId, onError]);

  useEffect(() => {
    fetchBays();
  }, [fetchBays]);

  // ── add bay ──────────────────────────────────────────────────────────────────

  const handleAddBay = async () => {
    setFormError(null);
    if (!newFloor.trim()) {
      setFormError('층을 입력해주세요.');
      return;
    }
    if (!newRoomNumber.trim()) {
      setFormError('번호를 입력해주세요.');
      return;
    }

    const duplicate = bays.find(
      (b) =>
        b.isActive &&
        b.floor === newFloor.trim() &&
        b.roomNumber === newRoomNumber.trim()
    );
    if (duplicate) {
      setFormError('이미 등록된 타석입니다.');
      return;
    }

    setSaving(true);
    try {
      const bay: Bay = {
        id: generateId(),
        branchId,
        floor: newFloor.trim(),
        roomNumber: newRoomNumber.trim(),
        isActive: true,
        createdAt: Date.now(),
      };

      await bayPersist.saveBay(bay);

      setNewFloor('');
      setNewRoomNumber('');
      await fetchBays();
      onSuccess?.(`${bayLabel(bay)} 타석이 추가되었습니다.`);
    } catch (e) {
      console.error('Failed to add bay:', e);
      onError?.('타석 추가 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // ── toggle active ────────────────────────────────────────────────────────────

  const handleToggleActive = async (bay: Bay) => {
    setSaving(true);
    try {
      const newActive = !bay.isActive;
      await bayPersist.updateBay(bay.id, { isActive: newActive });
      await fetchBays();
      onSuccess?.(
        `${bayLabel(bay)} 타석이 ${newActive ? '활성화' : '비활성화'}되었습니다.`
      );
    } catch (e) {
      console.error('Failed to toggle bay:', e);
      onError?.('타석 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // ── delete ───────────────────────────────────────────────────────────────────

  const handleDeleteBay = async (bay: Bay) => {
    if (!window.confirm(`${bayLabel(bay)} 타석을 비활성화하시겠습니까?`)) return;
    setSaving(true);
    try {
      await bayPersist.deleteBay(bay.id);
      await fetchBays();
      onSuccess?.(`${bayLabel(bay)} 타석이 비활성화되었습니다.`);
    } catch (e) {
      console.error('Failed to delete bay:', e);
      onError?.('타석 삭제 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // ── render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
      <h3 className="font-bold text-gray-900 flex items-center gap-2">
        <LayoutGrid className="w-4 h-4 text-emerald-600" />
        타석 관리
      </h3>

      {/* Add form */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newFloor}
            onChange={(e) => setNewFloor(e.target.value)}
            placeholder="층 (예: 1, B1)"
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
          <input
            type="text"
            value={newRoomNumber}
            onChange={(e) => setNewRoomNumber(e.target.value)}
            placeholder="번호 (예: 01)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddBay();
            }}
          />
          <Button
            onClick={handleAddBay}
            disabled={saving || !newFloor.trim() || !newRoomNumber.trim()}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm py-2 px-4 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            추가
          </Button>
        </div>
        {formError && (
          <p className="text-xs text-red-500">{formError}</p>
        )}
      </div>

      {/* Bay list */}
      {bays.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          등록된 타석이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {bays.map((bay) => (
            <li
              key={bay.id}
              className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                bay.isActive ? 'bg-gray-50' : 'bg-gray-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    bay.isActive ? 'bg-emerald-700' : 'bg-gray-400'
                  }`}
                />
                <span className="text-sm font-medium text-gray-700">
                  {bayLabel(bay)}
                </span>
                {!bay.isActive && (
                  <span className="text-xs text-gray-400">(비활성)</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(bay)}
                  disabled={saving}
                  className={`transition-colors ${
                    bay.isActive
                      ? 'text-emerald-700 hover:text-emerald-700'
                      : 'text-gray-400 hover:text-emerald-700'
                  }`}
                  aria-label={bay.isActive ? '비활성화' : '활성화'}
                  title={bay.isActive ? '비활성화' : '활성화'}
                >
                  {bay.isActive ? (
                    <ToggleRight className="w-5 h-5" />
                  ) : (
                    <ToggleLeft className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={() => handleDeleteBay(bay)}
                  disabled={saving}
                  className="text-red-400 hover:text-red-600 transition-colors"
                  aria-label={`${bayLabel(bay)} 삭제`}
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Summary */}
      {bays.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          전체 {bays.length}개 · 활성 {bays.filter((b) => b.isActive).length}개
        </p>
      )}
    </div>
  );
};
