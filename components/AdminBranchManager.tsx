import React, { useState, useEffect } from 'react';
import { Branch } from '../types';
import { Button } from './Button';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import {
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Building2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { createLogger } from '../utils/logger';

const log = createLogger('adminBranchManager');

interface AdminBranchManagerProps {
  isFirebaseMode: boolean;
}

const EMPTY_FORM: Omit<Branch, 'id' | 'createdAt'> = {
  name: '',
  holidays: [],
  isActive: true,
  timeZone: 'Asia/Seoul',
};

export const AdminBranchManager: React.FC<AdminBranchManagerProps> = ({
  isFirebaseMode,
}) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState<Omit<Branch, 'id' | 'createdAt'>>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBranches();
  }, [isFirebaseMode]);

  const loadBranches = async () => {
    setIsLoading(true);
    try {
      const data = isFirebaseMode
        ? await firebaseService.getBranches()
        : storageService.getBranches();
      setBranches(data);
    } catch (e) {
      log.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingBranch(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  };

  const openEditForm = (branch: Branch) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      holidays: branch.holidays,
      isActive: branch.isActive,
      timeZone: branch.timeZone ?? 'Asia/Seoul',
      openingHours: branch.openingHours,
    });
    setError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('지점 이름을 입력해주세요.');
      return;
    }

    const now = Date.now();
    const branch: Branch = editingBranch
      ? { ...editingBranch, ...form, name: form.name.trim(), updatedAt: now }
      : {
          id: crypto.randomUUID(),
          ...form,
          name: form.name.trim(),
          createdAt: now,
        };

    try {
      if (isFirebaseMode) {
        await firebaseService.saveBranch(branch);
      } else {
        storageService.saveBranch(branch);
      }
      setShowForm(false);
      await loadBranches();
    } catch (e) {
      setError('저장 중 오류가 발생했습니다.');
    }
  };

  const handleToggleActive = async (branch: Branch) => {
    const updated: Branch = {
      ...branch,
      isActive: !branch.isActive,
      updatedAt: Date.now(),
    };
    try {
      if (isFirebaseMode) {
        await firebaseService.saveBranch(updated);
      } else {
        storageService.saveBranch(updated);
      }
      await loadBranches();
    } catch (e) {
      log.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-high flex items-center gap-2">
          <Building2 className="w-5 h-5" /> 지점 관리
        </h2>
        <Button
          onClick={openCreateForm}
          className="flex items-center gap-2 text-sm py-2 px-4"
        >
          <Plus className="w-4 h-4" /> 지점 추가
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-bg-raised rounded-xl border border-line-default shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-ink-high">
            {editingBranch ? '지점 수정' : '새 지점 추가'}
          </h3>

          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-ink-medium mb-1 uppercase">
              지점 이름 *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 bg-bg-raised text-ink-high border border-line-default rounded-xl focus:ring-2 focus:ring-emerald-700 outline-none"
              placeholder="예: 강남점"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-medium mb-1 uppercase">
              시간대
            </label>
            <input
              type="text"
              value={form.timeZone ?? 'Asia/Seoul'}
              onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
              className="w-full px-4 py-2 bg-bg-raised text-ink-high border border-line-default rounded-xl focus:ring-2 focus:ring-emerald-700 outline-none"
              placeholder="Asia/Seoul"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-ink-medium uppercase">
              활성화
            </label>
            <button
              type="button"
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className={`flex items-center gap-1 text-sm font-semibold rounded-full px-3 py-1 transition-colors ${
                form.isActive
                  ? 'bg-primary-500/15 text-primary-300'
                  : 'bg-bg-overlay text-ink-medium'
              }`}
            >
              {form.isActive ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {form.isActive ? '활성' : '비활성'}
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 py-2">
              저장
            </Button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 text-sm font-bold text-ink-medium bg-bg-overlay hover:bg-bg-inset rounded-xl transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Branch List */}
      {isLoading ? (
        <div className="text-center py-10 text-ink-muted text-sm">불러오는 중...</div>
      ) : branches.length === 0 ? (
        <div className="text-center py-10 text-ink-muted text-sm">
          등록된 지점이 없습니다. 지점을 추가해주세요.
        </div>
      ) : (
        <div className="bg-bg-raised rounded-xl border border-line-default shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-bg-base border-b border-line-default">
              <tr>
                <th className="px-4 py-3 font-bold text-ink-medium">지점명</th>
                <th className="px-4 py-3 font-bold text-ink-medium">시간대</th>
                <th className="px-4 py-3 font-bold text-ink-medium">상태</th>
                <th className="px-4 py-3 font-bold text-ink-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {branches.map((branch) => (
                <tr key={branch.id} className="hover:bg-bg-base transition-colors">
                  <td className="px-4 py-3 font-semibold text-ink-high">
                    {branch.name}
                  </td>
                  <td className="px-4 py-3 text-ink-medium">
                    {branch.timeZone ?? 'Asia/Seoul'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        branch.isActive
                          ? 'bg-primary-500/15 text-primary-300'
                          : 'bg-bg-overlay text-ink-medium'
                      }`}
                    >
                      {branch.isActive ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {branch.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditForm(branch)}
                        className="p-1.5 text-ink-medium hover:text-ink-high hover:bg-bg-overlay rounded-lg transition-colors"
                        title="수정"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(branch)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          branch.isActive
                            ? 'text-emerald-600 hover:bg-primary-500/10'
                            : 'text-ink-muted hover:bg-bg-overlay'
                        }`}
                        title={branch.isActive ? '비활성화' : '활성화'}
                      >
                        {branch.isActive ? (
                          <ToggleRight className="w-4 h-4" />
                        ) : (
                          <ToggleLeft className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
