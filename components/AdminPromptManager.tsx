import React, { useState, useEffect, useRef } from 'react';
import { PromptTemplate, PromptAttachment, PromptTarget } from '../types';
import { Button } from './Button';
import {
  Plus,
  Save,
  Trash2,
  Edit2,
  CheckCircle,
  Circle,
  Paperclip,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Download,
  Sparkles,
} from 'lucide-react';
import { promptService } from '../services/promptService';

interface AdminPromptManagerProps {
  isFirebaseMode: boolean;
}

const TARGET_LABELS: Record<PromptTarget, string> = {
  coachx_chat: 'CoachX Chat',
  coachx_insights: 'CoachX Insights',
  weekly_insight: 'Weekly Insight',
  coach_material: 'Coach Material',
};

const TARGET_DESCRIPTIONS: Record<PromptTarget, string> = {
  coachx_chat: 'Controls how CoachX answers coach questions in the chat interface.',
  coachx_insights: 'Controls the structured JSON insights generated on the CoachX dashboard.',
  weekly_insight: 'Controls how weekly practice insights are generated for members.',
  coach_material: 'Controls how coaching material drafts are generated.',
};

const ALL_TARGETS: PromptTarget[] = [
  'coachx_chat',
  'coachx_insights',
  'weekly_insight',
  'coach_material',
];

const EMPTY_TEMPLATE = (): Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '',
  target: 'coachx_chat',
  systemPrompt: '',
  developerNote: '',
  isActive: false,
  language: 'all',
  attachments: [],
});

export const AdminPromptManager: React.FC<AdminPromptManagerProps> = ({ isFirebaseMode }) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE());
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [isFirebaseMode]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const data = await promptService.getAll(isFirebaseMode);
      // Sort: active first, then by updatedAt desc
      setTemplates(
        [...data].sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        })
      );
    } catch (e) {
      console.error('Failed to load prompt templates:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_TEMPLATE());
    setEditingId(null);
    setIsEditing(false);
  };

  const handleEdit = (template: PromptTemplate) => {
    setForm({
      name: template.name,
      target: template.target,
      systemPrompt: template.systemPrompt,
      developerNote: template.developerNote ?? '',
      isActive: template.isActive,
      language: template.language ?? 'all',
      attachments: template.attachments,
    });
    setEditingId(template.id);
    setIsEditing(true);
    setExpandedId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('프롬프트 이름을 입력해주세요.');
      return;
    }
    if (!form.systemPrompt.trim()) {
      alert('시스템 프롬프트 내용을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      const now = Date.now();
      const template: PromptTemplate = {
        id: editingId ?? crypto.randomUUID(),
        name: form.name.trim(),
        target: form.target,
        systemPrompt: form.systemPrompt.trim(),
        developerNote: form.developerNote?.trim() || undefined,
        isActive: form.isActive,
        language: form.language,
        attachments: form.attachments,
        createdAt: editingId
          ? (templates.find((t) => t.id === editingId)?.createdAt ?? now)
          : now,
        updatedAt: now,
      };
      await promptService.save(template, isFirebaseMode);
      await loadTemplates();
      resetForm();
    } catch (e) {
      console.error('Failed to save prompt template:', e);
      alert('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 프롬프트 템플릿을 삭제하시겠습니까?\n첨부된 파일도 함께 삭제됩니다.')) return;
    try {
      await promptService.delete(id, isFirebaseMode);
      await loadTemplates();
      if (editingId === id) resetForm();
    } catch (e) {
      console.error('Failed to delete prompt template:', e);
      alert('삭제에 실패했습니다.');
    }
  };

  const handleActivate = async (template: PromptTemplate) => {
    try {
      const updated: PromptTemplate = { ...template, isActive: true, updatedAt: Date.now() };
      await promptService.save(updated, isFirebaseMode);
      await loadTemplates();
    } catch (e) {
      console.error('Failed to activate prompt template:', e);
      alert('활성화에 실패했습니다.');
    }
  };

  const handleDeactivate = async (template: PromptTemplate) => {
    try {
      const updated: PromptTemplate = { ...template, isActive: false, updatedAt: Date.now() };
      await promptService.save(updated, isFirebaseMode);
      await loadTemplates();
    } catch (e) {
      console.error('Failed to deactivate prompt template:', e);
    }
  };

  // File attachment upload for an *existing* saved template
  const handleAttachFile = async (templateId: string, file: File) => {
    setUploadingFor(templateId);
    try {
      await promptService.uploadAttachment(templateId, file, isFirebaseMode);
      await loadTemplates();
    } catch (e) {
      console.error('Failed to upload attachment:', e);
      alert('파일 첨부에 실패했습니다.');
    } finally {
      setUploadingFor(null);
    }
  };

  const handleDeleteAttachment = async (
    templateId: string,
    attachment: PromptAttachment
  ) => {
    if (!confirm(`"${attachment.fileName}" 파일을 삭제하시겠습니까?`)) return;
    try {
      await promptService.deleteAttachment(
        templateId,
        attachment.id,
        attachment.storagePath,
        isFirebaseMode
      );
      await loadTemplates();
    } catch (e) {
      console.error('Failed to delete attachment:', e);
      alert('파일 삭제에 실패했습니다.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" /> AI 프롬프트 관리
        </h2>
        <Button
          onClick={() => {
            resetForm();
            setIsEditing(true);
          }}
          icon={<Plus className="w-4 h-4" />}
        >
          새 프롬프트 추가
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-indigo-700">
          각 AI 기능마다 <strong>활성(Active)</strong> 상태인 프롬프트가 Gemini 호출 시 사용됩니다.
          활성 프롬프트가 없으면 내장 기본 프롬프트가 사용됩니다.
          {!isFirebaseMode && (
            <span className="block mt-1 text-indigo-500 text-xs">
              ⚠️ 현재 로컬 모드 — Firebase 연결 시 Firestore에 저장됩니다.
            </span>
          )}
        </p>
      </div>

      {/* Edit / Create form */}
      {isEditing && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-200 animate-fade-in space-y-5">
          <h3 className="font-bold text-gray-800 text-base">
            {editingId ? '프롬프트 수정' : '새 프롬프트 작성'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">프롬프트 이름 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: CoachX Chat — 한국어 v1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">AI 기능 대상 *</label>
              <select
                value={form.target}
                onChange={(e) =>
                  setForm((f) => ({ ...f, target: e.target.value as PromptTarget }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                {ALL_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {TARGET_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">언어 범위</label>
              <select
                value={form.language ?? 'all'}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    language: e.target.value as PromptTemplate['language'],
                  }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                <option value="all">모든 언어 (all)</option>
                <option value="ko">한국어 (ko)</option>
                <option value="en">English (en)</option>
                <option value="ja">日本語 (ja)</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 accent-indigo-600"
                />
                <span className="text-sm font-bold text-gray-700">저장 시 즉시 활성화</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              시스템 프롬프트 * <span className="font-normal text-gray-400">(Gemini에 전달되는 역할/규칙 지시문)</span>
            </label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="You are CoachX, an AI coaching assistant..."
              rows={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              {form.systemPrompt.length}자
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              개발자 메모 <span className="font-normal text-gray-400">(관리자 전용 — Gemini에 전달되지 않음)</span>
            </label>
            <textarea
              value={form.developerNote ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, developerNote: e.target.value }))}
              placeholder="변경 이력, 테스트 결과, 주의사항 등..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={resetForm}>
              취소
            </Button>
            <Button onClick={handleSave} isLoading={isSaving} icon={<Save className="w-4 h-4" />}>
              {editingId ? '수정 저장' : '프롬프트 저장'}
            </Button>
          </div>
        </div>
      )}

      {/* Template list */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">등록된 프롬프트 템플릿이 없습니다.</p>
          <p className="text-gray-300 text-xs mt-1">
            위 버튼으로 새 프롬프트를 추가하거나, 내장 기본 프롬프트가 자동으로 사용됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Group by target */}
          {ALL_TARGETS.map((target) => {
            const group = templates.filter((t) => t.target === target);
            if (group.length === 0) return null;
            return (
              <div key={target}>
                <div className="flex items-center gap-2 mb-2 mt-4">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                    {TARGET_LABELS[target]}
                  </span>
                  <span className="text-xs text-gray-400">— {TARGET_DESCRIPTIONS[target]}</span>
                </div>
                <div className="space-y-2">
                  {group.map((template) => (
                    <PromptCard
                      key={template.id}
                      template={template}
                      isExpanded={expandedId === template.id}
                      isUploadingAttachment={uploadingFor === template.id}
                      onToggleExpand={() =>
                        setExpandedId((id) => (id === template.id ? null : template.id))
                      }
                      onEdit={() => handleEdit(template)}
                      onDelete={() => handleDelete(template.id)}
                      onActivate={() => handleActivate(template)}
                      onDeactivate={() => handleDeactivate(template)}
                      onAttachFile={(file) => handleAttachFile(template.id, file)}
                      onDeleteAttachment={(att) => handleDeleteAttachment(template.id, att)}
                      formatFileSize={formatFileSize}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PromptCard sub-component
// ---------------------------------------------------------------------------

interface PromptCardProps {
  template: PromptTemplate;
  isExpanded: boolean;
  isUploadingAttachment: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onAttachFile: (file: File) => void;
  onDeleteAttachment: (att: PromptAttachment) => void;
  formatFileSize: (bytes: number) => string;
}

const PromptCard: React.FC<PromptCardProps> = ({
  template,
  isExpanded,
  isUploadingAttachment,
  onToggleExpand,
  onEdit,
  onDelete,
  onActivate,
  onDeactivate,
  onAttachFile,
  onDeleteAttachment,
  formatFileSize,
}) => {
  const localFileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAttachFile(file);
    e.target.value = '';
  };

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm transition-all ${
        template.isActive ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'
      }`}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4">
        {/* Active badge */}
        <button
          onClick={template.isActive ? onDeactivate : onActivate}
          title={template.isActive ? '비활성화' : '활성화'}
          className="flex-shrink-0"
        >
          {template.isActive ? (
            <CheckCircle className="w-5 h-5 text-indigo-500" />
          ) : (
            <Circle className="w-5 h-5 text-gray-300 hover:text-indigo-400 transition-colors" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-sm truncate">{template.name}</span>
            {template.isActive && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                ACTIVE
              </span>
            )}
            {template.language && template.language !== 'all' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full uppercase">
                {template.language}
              </span>
            )}
            {template.attachments.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full flex items-center gap-0.5">
                <Paperclip className="w-2.5 h-2.5" /> {template.attachments.length}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(template.updatedAt).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="수정"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleExpand}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
            title={isExpanded ? '접기' : '펼치기'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">시스템 프롬프트</p>
            <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
              {template.systemPrompt}
            </pre>
          </div>

          {template.developerNote && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">개발자 메모</p>
              <p className="text-xs text-gray-600 bg-amber-50 rounded-lg p-3">
                {template.developerNote}
              </p>
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-500 flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> 첨부 파일 ({template.attachments.length})
              </p>
              <div>
                <input
                  ref={localFileRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept="*/*"
                />
                <button
                  onClick={() => localFileRef.current?.click()}
                  disabled={isUploadingAttachment}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
                >
                  {isUploadingAttachment ? (
                    '업로드 중...'
                  ) : (
                    <>
                      <Plus className="w-3 h-3" /> 파일 첨부
                    </>
                  )}
                </button>
              </div>
            </div>

            {template.attachments.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-lg">
                첨부된 파일이 없습니다.
              </p>
            ) : (
              <div className="space-y-1">
                {template.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{att.fileName}</p>
                      <p className="text-[10px] text-gray-400">
                        {formatFileSize(att.fileSize)} · {att.mimeType}
                      </p>
                    </div>
                    {att.downloadUrl && (
                      <a
                        href={att.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="다운로드"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => onDeleteAttachment(att)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="삭제"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
