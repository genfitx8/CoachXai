import React, { useEffect, useState } from 'react';
import { Save, Plus, Trash2, KeyRound, ListChecks, RefreshCcw } from 'lucide-react';
import { Button } from './Button';
import type { CurriculumPartTemplate, CurriculumPartItem } from '../types/curriculum';
import {
  listCurriculumTemplates,
  updateCurriculumTemplate,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
} from '../services/curriculumTemplateService';

interface EditState {
  title: string;
  content: string;
  keyPoints: string[];
  items: CurriculumPartItem[];
}

function toEditState(t: CurriculumPartTemplate): EditState {
  return {
    title: t.title,
    content: t.content ?? '',
    keyPoints: [...t.keyPoints],
    items: (t.items ?? []).map((item) => ({ ...item })),
  };
}

function isDirty(a: EditState, b: EditState): boolean {
  return (
    a.title !== b.title ||
    a.content !== b.content ||
    a.keyPoints.length !== b.keyPoints.length ||
    a.keyPoints.some((v, i) => v !== b.keyPoints[i]) ||
    a.items.length !== b.items.length ||
    a.items.some((v, i) => v.text !== b.items[i]?.text || v.section !== b.items[i]?.section)
  );
}

export const AdminCurriculumTemplateManager: React.FC = () => {
  const [tokenInput, setTokenInput] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const [templates, setTemplates] = useState<CurriculumPartTemplate[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function tryLoad(): Promise<boolean> {
    try {
      const list = await listCurriculumTemplates();
      setTemplates(list);
      setEdits(Object.fromEntries(list.map((t) => [t.partKey, toEditState(t)])));
      setAuthorized(true);
      setAuthError(null);
      return true;
    } catch (e) {
      clearAdminToken();
      setAuthorized(false);
      setAuthError(e instanceof Error ? e.message : '알 수 없는 오류');
      return false;
    }
  }

  useEffect(() => {
    (async () => {
      setChecking(true);
      if (getAdminToken()) {
        await tryLoad();
      }
      setChecking(false);
    })();
  }, []);

  async function handleUnlock() {
    if (!tokenInput.trim()) return;
    setChecking(true);
    setAdminToken(tokenInput.trim());
    const ok = await tryLoad();
    if (!ok) setTokenInput('');
    setChecking(false);
  }

  async function handleSave(partKey: string) {
    const edit = edits[partKey];
    if (!edit) return;
    setSavingKey(partKey);
    setError(null);
    try {
      const updated = await updateCurriculumTemplate(partKey, {
        title: edit.title,
        content: edit.content,
        keyPoints: edit.keyPoints.filter((k) => k.trim().length > 0),
        items: edit.items.filter((item) => item.text.trim().length > 0),
      });
      setTemplates((prev) => prev.map((t) => (t.partKey === partKey ? updated : t)));
      setEdits((prev) => ({ ...prev, [partKey]: toEditState(updated) }));
      setSavedKey(partKey);
      setTimeout(() => setSavedKey((k) => (k === partKey ? null : k)), 2000);
    } catch (e) {
      console.error('[AdminCurriculumTemplateManager] save error:', e);
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  }

  function updateEdit(partKey: string, patch: Partial<EditState>) {
    setEdits((prev) => ({ ...prev, [partKey]: { ...prev[partKey], ...patch } }));
  }

  function updateKeyPoint(partKey: string, index: number, value: string) {
    setEdits((prev) => {
      const kp = [...(prev[partKey]?.keyPoints ?? [])];
      kp[index] = value;
      return { ...prev, [partKey]: { ...prev[partKey], keyPoints: kp } };
    });
  }

  function addKeyPoint(partKey: string) {
    setEdits((prev) => ({
      ...prev,
      [partKey]: { ...prev[partKey], keyPoints: [...(prev[partKey]?.keyPoints ?? []), ''] },
    }));
  }

  function removeKeyPoint(partKey: string, index: number) {
    setEdits((prev) => ({
      ...prev,
      [partKey]: { ...prev[partKey], keyPoints: prev[partKey].keyPoints.filter((_, i) => i !== index) },
    }));
  }

  function updateItem(partKey: string, index: number, patch: Partial<CurriculumPartItem>) {
    setEdits((prev) => {
      const items = [...(prev[partKey]?.items ?? [])];
      items[index] = { ...items[index], ...patch };
      return { ...prev, [partKey]: { ...prev[partKey], items } };
    });
  }

  function addItem(partKey: string) {
    setEdits((prev) => ({
      ...prev,
      [partKey]: { ...prev[partKey], items: [...(prev[partKey]?.items ?? []), { text: '' }] },
    }));
  }

  function removeItem(partKey: string, index: number) {
    setEdits((prev) => ({
      ...prev,
      [partKey]: { ...prev[partKey], items: prev[partKey].items.filter((_, i) => i !== index) },
    }));
  }

  if (checking) {
    return <div className="text-sm text-gray-500 py-8 text-center">확인 중...</div>;
  }

  if (!authorized) {
    return (
      <div className="max-w-md space-y-4">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-indigo-500" />
          커리큘럼 콘텐츠 관리
        </h2>
        <p className="text-sm text-gray-500">
          이 화면은 별도의 관리자 토큰이 필요합니다. 서버 환경변수 <code className="bg-gray-100 px-1 rounded">ADMIN_API_TOKEN</code>과 동일한 값을 입력하세요.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
            placeholder="관리자 토큰"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          />
          <Button onClick={handleUnlock}>확인</Button>
        </div>
        {authError && <p className="text-sm text-red-500">{authError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-indigo-500" />
          커리큘럼 콘텐츠 관리
        </h2>
        <button
          onClick={() => { clearAdminToken(); setAuthorized(false); }}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          잠금
        </button>
      </div>

      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <p className="text-sm text-indigo-700">
          여기서 수정한 내용은 <strong>앞으로 새로 생성되는 커리큘럼</strong>의 기본 콘텐츠에 적용됩니다.
          이미 생성된 커리큘럼에는 영향을 주지 않습니다.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="space-y-4">
        {templates
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((t) => {
            const edit = edits[t.partKey] ?? toEditState(t);
            const dirty = isDirty(edit, toEditState(t));
            return (
              <div key={t.partKey} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                      {t.order}
                    </span>
                    <input
                      type="text"
                      value={edit.title}
                      onChange={(e) => updateEdit(t.partKey, { title: e.target.value })}
                      className="font-bold text-gray-800 text-base px-2 py-1 border border-transparent hover:border-gray-300 focus:border-indigo-400 rounded-lg outline-none"
                    />
                  </div>
                  {savedKey === t.partKey && (
                    <span className="text-xs font-semibold text-emerald-600">저장됨</span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">콘텐츠 (마크다운)</label>
                  <textarea
                    value={edit.content}
                    onChange={(e) => updateEdit(t.partKey, { content: e.target.value })}
                    rows={8}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-gray-500">핵심 포인트</label>
                    <button
                      onClick={() => addKeyPoint(t.partKey)}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      추가
                    </button>
                  </div>
                  <div className="space-y-2">
                    {edit.keyPoints.map((point, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={point}
                          onChange={(e) => updateKeyPoint(t.partKey, i, e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                        <button
                          onClick={() => removeKeyPoint(t.partKey, i)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {edit.keyPoints.length === 0 && (
                      <p className="text-xs text-gray-400">등록된 핵심 포인트가 없습니다.</p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-gray-500">
                      훈련 내용 체크리스트 항목
                    </label>
                    <button
                      onClick={() => addItem(t.partKey)}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      추가
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    학생/코치가 하나씩 체크 완료할 수 있는 세부 훈련 항목입니다. 구분(섹션)은 선택 입력입니다.
                  </p>
                  <div className="space-y-2">
                    {edit.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.section ?? ''}
                          onChange={(e) => updateItem(t.partKey, i, { section: e.target.value || undefined })}
                          placeholder="구분"
                          className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-500"
                        />
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => updateItem(t.partKey, i, { text: e.target.value })}
                          placeholder="훈련 항목"
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                        <button
                          onClick={() => removeItem(t.partKey, i)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {edit.items.length === 0 && (
                      <p className="text-xs text-gray-400">등록된 훈련 항목이 없습니다.</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => handleSave(t.partKey)}
                    disabled={!dirty || savingKey === t.partKey}
                    isLoading={savingKey === t.partKey}
                    icon={<Save className="w-4 h-4" />}
                  >
                    저장
                  </Button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
