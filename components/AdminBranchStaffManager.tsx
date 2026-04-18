import React, { useState, useEffect } from 'react';
import { Branch, BranchAdminAccount } from '../types';
import { Button } from './Button';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import {
  Plus,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Users,
  CheckCircle,
  XCircle,
  KeyRound,
} from 'lucide-react';

interface AdminBranchStaffManagerProps {
  isFirebaseMode: boolean;
}

/** Generate a random alphanumeric password of the given length. */
const generatePassword = (length = 12): string => {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
};

export const AdminBranchStaffManager: React.FC<
  AdminBranchStaffManagerProps
> = ({ isFirebaseMode }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<BranchAdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [username, setUsername] = useState('');
  const [generatedPw, setGeneratedPw] = useState<string | null>(null);
  const [copiedPw, setCopiedPw] = useState(false);
  const [resetPw, setResetPw] = useState<{ pw: string; accountLabel: string } | null>(null);
  const [copiedResetPw, setCopiedResetPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterBranchId, setFilterBranchId] = useState('');

  useEffect(() => {
    loadAll();
  }, [isFirebaseMode]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [bData, aData] = await Promise.all([
        isFirebaseMode
          ? firebaseService.getBranches()
          : Promise.resolve(storageService.getBranches()),
        isFirebaseMode
          ? firebaseService.getBranchAdminAccounts()
          : Promise.resolve(storageService.getBranchAdminAccounts()),
      ]);
      setBranches(bData.filter((b) => b.isActive));
      setAccounts(aData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateForm = () => {
    setSelectedBranchId('');
    setUsername('');
    setGeneratedPw(null);
    setCopiedPw(false);
    setError(null);
    setShowForm(true);
  };

  const handleGenerateAndSave = async () => {
    if (!selectedBranchId) {
      setError('지점을 선택해주세요.');
      return;
    }
    if (!username.trim()) {
      setError('유저이름을 입력해주세요.');
      return;
    }

    const branch = branches.find((b) => b.id === selectedBranchId);
    if (!branch) {
      setError('선택한 지점을 찾을 수 없습니다.');
      return;
    }

    const accountId = `${selectedBranchId}:${username.trim()}`;

    // Check for duplicate
    const existing = accounts.find((a) => a.id === accountId);
    if (existing) {
      setError('해당 지점에 이미 같은 유저이름이 존재합니다.');
      return;
    }

    const password = generatePassword();
    const now = Date.now();
    const account: BranchAdminAccount = {
      id: accountId,
      branchId: selectedBranchId,
      branchName: branch.name,
      username: username.trim(),
      password, // MVP: plaintext. Do NOT use in production without hashing.
      isActive: true,
      createdAt: now,
    };

    try {
      if (isFirebaseMode) {
        await firebaseService.saveBranchAdminAccount(account);
      } else {
        storageService.saveBranchAdminAccount(account);
      }
      setGeneratedPw(password);
      setError(null);
      await loadAll();
    } catch (e) {
      setError('저장 중 오류가 발생했습니다.');
    }
  };

  const handleResetPassword = async (account: BranchAdminAccount) => {
    if (
      !confirm(
        `${account.branchName} > ${account.username}의 비밀번호를 재발급하시겠습니까?`
      )
    )
      return;

    const newPw = generatePassword();
    const updated: BranchAdminAccount = {
      ...account,
      password: newPw,
      updatedAt: Date.now(),
    };

    try {
      if (isFirebaseMode) {
        await firebaseService.saveBranchAdminAccount(updated);
      } else {
        storageService.saveBranchAdminAccount(updated);
      }
      setResetPw({
        pw: newPw,
        accountLabel: `${account.branchName}:${account.username}`,
      });
      setCopiedResetPw(false);
      await loadAll();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleActive = async (account: BranchAdminAccount) => {
    const updated: BranchAdminAccount = {
      ...account,
      isActive: !account.isActive,
      updatedAt: Date.now(),
    };
    try {
      if (isFirebaseMode) {
        await firebaseService.saveBranchAdminAccount(updated);
      } else {
        storageService.saveBranchAdminAccount(updated);
      }
      await loadAll();
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPw(true);
      setTimeout(() => setCopiedPw(false), 2000);
    } catch {
      // Fallback
    }
  };

  const copyResetPwToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedResetPw(true);
      setTimeout(() => setCopiedResetPw(false), 2000);
    } catch {
      // Fallback
    }
  };

  const filteredAccounts = filterBranchId
    ? accounts.filter((a) => a.branchId === filterBranchId)
    : accounts;

  return (
    <div className="space-y-4">
      {/* Reset Password Modal */}
      {resetPw && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-amber-900">비밀번호 재발급 완료</h3>
          <p className="text-sm text-amber-800">
            <span className="font-mono font-semibold">{resetPw.accountLabel}</span>의 새 비밀번호입니다.{' '}
            <span className="font-semibold text-red-600">
              이 화면을 닫으면 다시 확인할 수 없습니다.
            </span>
          </p>
          <div className="bg-gray-900 text-emerald-400 font-mono text-base rounded-xl p-4 flex items-center justify-between gap-3">
            <span className="break-all">{resetPw.pw}</span>
            <button
              onClick={() => copyResetPwToClipboard(resetPw.pw)}
              className="flex-shrink-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title="복사"
            >
              {copiedResetPw ? (
                <Check className="w-4 h-4 text-emerald-300" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
          <Button
            onClick={() => setResetPw(null)}
            className="w-full py-2 bg-amber-600 hover:bg-amber-700"
          >
            확인 완료
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Users className="w-5 h-5" /> 지점 직원 관리
        </h2>
        <Button
          onClick={openCreateForm}
          className="flex items-center gap-2 text-sm py-2 px-4"
        >
          <Plus className="w-4 h-4" /> 직원 계정 추가
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-gray-900">새 직원 계정 추가</h3>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {generatedPw ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                계정이 생성되었습니다. 아래 비밀번호를 반드시 직원에게 안전하게 전달하세요.
                <br />
                <span className="text-red-500 font-semibold">
                  이 창을 닫으면 비밀번호를 다시 확인할 수 없습니다.
                </span>
              </p>
              <div className="bg-gray-900 text-emerald-400 font-mono text-base rounded-xl p-4 flex items-center justify-between gap-3">
                <span className="break-all">{generatedPw}</span>
                <button
                  onClick={() => copyToClipboard(generatedPw)}
                  className="flex-shrink-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  title="복사"
                >
                  {copiedPw ? (
                    <Check className="w-4 h-4 text-emerald-300" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <Button
                onClick={() => {
                  setShowForm(false);
                  setGeneratedPw(null);
                }}
                className="w-full py-2"
              >
                완료
              </Button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                  지점 선택 *
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-700 outline-none"
                >
                  <option value="">-- 지점 선택 --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                  유저이름 *
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-700 outline-none"
                  placeholder="예: mina"
                />
                <p className="text-xs text-gray-400 mt-1">
                  로그인 아이디:{' '}
                  <span className="font-mono">
                    {selectedBranchId
                      ? `${branches.find((b) => b.id === selectedBranchId)?.name ?? ''}:${username || '유저이름'}`
                      : '지점이름:유저이름'}
                  </span>
                </p>
              </div>

              <p className="text-xs text-gray-400">
                비밀번호는 자동으로 생성됩니다 (12자 임의 문자).
              </p>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleGenerateAndSave} className="flex-1 py-2">
                  계정 생성 및 비밀번호 발급
                </Button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  취소
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filter by branch */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
          지점 필터
        </label>
        <select
          value={filterBranchId}
          onChange={(e) => setFilterBranchId(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
        >
          <option value="">전체</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Account List */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
      ) : filteredAccounts.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          등록된 직원 계정이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-bold text-gray-600">지점</th>
                <th className="px-4 py-3 font-bold text-gray-600">유저이름</th>
                <th className="px-4 py-3 font-bold text-gray-600">로그인 아이디</th>
                <th className="px-4 py-3 font-bold text-gray-600">상태</th>
                <th className="px-4 py-3 font-bold text-gray-600">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAccounts.map((account) => (
                <tr
                  key={account.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {account.branchName}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{account.username}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    {account.branchName}:{account.username}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        account.isActive
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {account.isActive ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {account.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleResetPassword(account)}
                        className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="비밀번호 재발급"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(account)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          account.isActive
                            ? 'text-emerald-600 hover:bg-emerald-50'
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={account.isActive ? '비활성화' : '활성화'}
                      >
                        {account.isActive ? (
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
