import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './Button';
import { Plus, Trash2, ToggleLeft, ToggleRight, Save, X } from 'lucide-react';
import { BayPriceRule, DAY_OF_WEEK_LABELS } from '../types';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

// ─── helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `bpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sat..Sun

function ruleLabel(rule: BayPriceRule): string {
  const day = DAY_OF_WEEK_LABELS[rule.dayOfWeek] ?? `요일(${rule.dayOfWeek})`;
  const h = String(rule.startHour).padStart(2, '0');
  return `${day} ${h}:00 ~ ${String(rule.startHour + 1).padStart(2, '0')}:00`;
}

// Unified persistence helper
const pricePersist = {
  getRules: async (branchId: string): Promise<BayPriceRule[]> =>
    firebaseService.isInitialized()
      ? firebaseService.getBayPriceRules(branchId)
      : Promise.resolve(storageService.getBayPriceRules(branchId)),

  saveRule: async (rule: BayPriceRule): Promise<void> => {
    if (firebaseService.isInitialized()) {
      await firebaseService.saveBayPriceRule(rule);
    } else {
      storageService.saveBayPriceRule(rule);
    }
  },

  deleteRule: async (ruleId: string): Promise<void> => {
    if (firebaseService.isInitialized()) {
      await firebaseService.deleteBayPriceRule(ruleId);
    } else {
      storageService.deleteBayPriceRule(ruleId);
    }
  },
};

// ─── form state ───────────────────────────────────────────────────────────────

interface FormState {
  dayOfWeek: number;
  startHour: number;
  pricePoints: string; // string for controlled input
  isActive: boolean;
}

const DEFAULT_FORM: FormState = {
  dayOfWeek: 1,
  startHour: 9,
  pricePoints: '',
  isActive: true,
};

// ─── props ────────────────────────────────────────────────────────────────────

interface BayPriceRuleManagerProps {
  branchId: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export const BayPriceRuleManager: React.FC<BayPriceRuleManagerProps> = ({
  branchId,
  onSuccess,
  onError,
}) => {
  const [rules, setRules] = useState<BayPriceRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [saving, setSaving] = useState(false);

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pricePersist.getRules(branchId);
      // Sort: active first, then by dayOfWeek (Mon-first), then startHour
      const sorted = [...data].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const dayA = DAYS_ORDER.indexOf(a.dayOfWeek);
        const dayB = DAYS_ORDER.indexOf(b.dayOfWeek);
        if (dayA !== dayB) return dayA - dayB;
        return a.startHour - b.startHour;
      });
      setRules(sorted);
    } catch (e) {
      console.error('Failed to fetch price rules:', e);
      onError?.('가격 규칙을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [branchId, onError]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // ── validation ─────────────────────────────────────────────────────────────

  const validateForm = (f: FormState, skipId?: string): string | null => {
    if (f.pricePoints.trim() === '') {
      return '포인트를 입력해주세요.';
    }
    const points = Number(f.pricePoints);
    if (!Number.isInteger(points) || points <= 0) {
      return '포인트는 1 이상의 정수여야 합니다.';
    }
    if (f.startHour < 0 || f.startHour > 23) {
      return '시작 시간은 0~23 사이여야 합니다.';
    }
    // Duplicate check: same dayOfWeek + startHour among active rules (excluding self)
    const duplicate = rules.find(
      (r) =>
        r.id !== skipId &&
        r.isActive &&
        r.dayOfWeek === f.dayOfWeek &&
        r.startHour === f.startHour
    );
    if (duplicate) {
      return `${ruleLabel(duplicate)} 에 이미 활성 규칙이 존재합니다.`;
    }
    return null;
  };

  // ── open create form ───────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({ ...DEFAULT_FORM });
    setShowForm(true);
  };

  // ── open edit form ─────────────────────────────────────────────────────────

  const handleOpenEdit = (rule: BayPriceRule) => {
    setEditingId(rule.id);
    setForm({
      dayOfWeek: rule.dayOfWeek,
      startHour: rule.startHour,
      pricePoints: String(rule.pricePoints),
      isActive: rule.isActive,
    });
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  // ── save (create or edit) ──────────────────────────────────────────────────

  const handleSave = async () => {
    const err = validateForm(form, editingId ?? undefined);
    if (err) {
      onError?.(err);
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      let rule: BayPriceRule;
      if (editingId) {
        const existing = rules.find((r) => r.id === editingId);
        if (!existing) {
          onError?.('수정할 규칙을 찾을 수 없습니다.');
          return;
        }
        rule = {
          ...existing,
          dayOfWeek: form.dayOfWeek,
          startHour: form.startHour,
          pricePoints: Number(form.pricePoints),
          isActive: form.isActive,
          updatedAt: now,
        };
      } else {
        rule = {
          id: generateId(),
          branchId,
          dayOfWeek: form.dayOfWeek,
          startHour: form.startHour,
          pricePoints: Number(form.pricePoints),
          isActive: form.isActive,
          createdAt: now,
        };
      }

      await pricePersist.saveRule(rule);
      onSuccess?.(editingId ? '가격 규칙이 수정되었습니다.' : '가격 규칙이 추가되었습니다.');
      setShowForm(false);
      setEditingId(null);
      await fetchRules();
    } catch (e) {
      console.error('Failed to save price rule:', e);
      onError?.('가격 규칙 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // ── toggle active ──────────────────────────────────────────────────────────

  const handleToggleActive = async (rule: BayPriceRule) => {
    // If activating, check for duplicate active rules
    if (!rule.isActive) {
      const duplicate = rules.find(
        (r) =>
          r.id !== rule.id &&
          r.isActive &&
          r.dayOfWeek === rule.dayOfWeek &&
          r.startHour === rule.startHour
      );
      if (duplicate) {
        onError?.(`${ruleLabel(rule)} 에 이미 활성 규칙이 존재합니다. 먼저 비활성화해주세요.`);
        return;
      }
    }

    try {
      const updated: BayPriceRule = { ...rule, isActive: !rule.isActive, updatedAt: Date.now() };
      await pricePersist.saveRule(updated);
      onSuccess?.(updated.isActive ? '규칙이 활성화되었습니다.' : '규칙이 비활성화되었습니다.');
      await fetchRules();
    } catch (e) {
      console.error('Failed to toggle price rule:', e);
      onError?.('상태 변경 중 오류가 발생했습니다.');
    }
  };

  // ── delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (rule: BayPriceRule) => {
    if (!window.confirm(`"${ruleLabel(rule)}" 규칙을 삭제하시겠습니까?`)) return;
    try {
      await pricePersist.deleteRule(rule.id);
      onSuccess?.('가격 규칙이 삭제되었습니다.');
      await fetchRules();
    } catch (e) {
      console.error('Failed to delete price rule:', e);
      onError?.('가격 규칙 삭제 중 오류가 발생했습니다.');
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">가격 규칙 관리</h3>
        {!showForm && (
          <Button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm py-2 px-4"
          >
            <Plus className="w-4 h-4" />
            규칙 추가
          </Button>
        )}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-emerald-800">
            {editingId ? '규칙 수정' : '새 규칙 추가'}
          </h4>

          {/* Day of week */}
          <div className="space-y-1">
            <label className="text-xs text-gray-600 font-medium">요일</label>
            <select
              value={form.dayOfWeek}
              onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              {DAYS_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_OF_WEEK_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          {/* Start hour */}
          <div className="space-y-1">
            <label className="text-xs text-gray-600 font-medium">시작 시간</label>
            <select
              value={form.startHour}
              onChange={(e) => setForm((f) => ({ ...f, startHour: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, '0')}:00 ~ {String(i + 1).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>

          {/* Price points */}
          <div className="space-y-1">
            <label className="text-xs text-gray-600 font-medium">포인트 (1시간)</label>
            <input
              type="number"
              min={1}
              value={form.pricePoints}
              onChange={(e) => setForm((f) => ({ ...f, pricePoints: e.target.value }))}
              placeholder="예: 500"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 font-medium">활성화</label>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
              className="flex items-center gap-1 text-sm"
            >
              {form.isActive ? (
                <ToggleRight className="w-6 h-6 text-emerald-500" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-gray-400" />
              )}
              <span className={form.isActive ? 'text-emerald-600' : 'text-gray-400'}>
                {form.isActive ? '활성' : '비활성'}
              </span>
            </button>
          </div>

          {/* Form actions */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm py-2 px-4 flex-1 justify-center"
            >
              <Save className="w-4 h-4" />
              {saving ? '저장 중...' : '저장'}
            </Button>
            <Button
              onClick={handleCancelForm}
              disabled={saving}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm py-2 px-4"
            >
              <X className="w-4 h-4" />
              취소
            </Button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">불러오는 중...</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">등록된 가격 규칙이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                rule.isActive
                  ? 'bg-white border-gray-100'
                  : 'bg-gray-50 border-gray-100 opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{ruleLabel(rule)}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {rule.pricePoints.toLocaleString()} 포인트 / 1시간
                  {!rule.isActive && (
                    <span className="ml-2 text-gray-400 italic">비활성</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {/* Edit button */}
                <button
                  onClick={() => handleOpenEdit(rule)}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  aria-label="규칙 수정"
                >
                  수정
                </button>

                {/* Toggle active */}
                <button
                  onClick={() => handleToggleActive(rule)}
                  className="text-gray-400 hover:text-emerald-500 transition-colors"
                  aria-label={rule.isActive ? '비활성화' : '활성화'}
                >
                  {rule.isActive ? (
                    <ToggleRight className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(rule)}
                  className="text-red-400 hover:text-red-600 transition-colors"
                  aria-label="규칙 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
