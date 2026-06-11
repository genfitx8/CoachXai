import React, { useRef, useState } from 'react';
import { Camera, ChevronDown, ChevronUp, Monitor, Plus, Trash2, Upload, Video } from 'lucide-react';
import { SwingMotionCapture, SwingMotionData } from '../../types/diagnosis';
import { Button } from '../Button';
import { ScreenCaptureDialog } from './ScreenCaptureDialog';

interface Props {
  data: SwingMotionData;
  onChange: (data: SwingMotionData) => void;
  clubOptions: { value: string; label: string }[];
}

const METRIC_FIELDS: { field: keyof SwingMotionCapture; label: string; unit: string }[] = [
  { field: 'swingPath',          label: '클럽 패스',     unit: '°' },
  { field: 'faceAngle',         label: '페이스 앵글',   unit: '°' },
  { field: 'attackAngle',       label: '어택 앵글',     unit: '°' },
  { field: 'dynamicLoft',       label: '다이나믹 로프트', unit: '°' },
  { field: 'spinLoft',          label: '스핀 로프트',   unit: '°' },
  { field: 'hipRotation',       label: '힙 회전',      unit: '°' },
  { field: 'shoulderRotation',  label: '어깨 회전',     unit: '°' },
  { field: 'swingPlane',        label: '스윙 플레인',   unit: '°' },
];

const createCapture = (clubType: string): SwingMotionCapture => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  clubType,
  label: '',
  capturedImageUrl: undefined,
  videoObjectUrl: undefined,
  videoFileName: undefined,
  swingPath: null,
  faceAngle: null,
  attackAngle: null,
  dynamicLoft: null,
  spinLoft: null,
  hipRotation: null,
  shoulderRotation: null,
  swingPlane: null,
  tempoRatio: '',
  coachNote: '',
});

const parseNullable = (raw: string): number | null => {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
};

export const SwingMotionSection: React.FC<Props> = ({ data, onChange, clubOptions }) => {
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [captureTargetId, setCaptureTargetId] = useState<string | null>(null);
  const [pendingClub, setPendingClub] = useState('');
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const videoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const update = (id: string, patch: Partial<SwingMotionCapture>) => {
    onChange({
      ...data,
      captures: data.captures.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const addCapture = () => {
    if (!pendingClub) return;
    const newCapture = createCapture(pendingClub);
    onChange({ ...data, captures: [...data.captures, newCapture] });
    setExpandedCards((prev) => ({ ...prev, [newCapture.id]: true }));
    setPendingClub('');
  };

  const removeCapture = (id: string) => {
    const target = data.captures.find((c) => c.id === id);
    if (target?.videoObjectUrl) URL.revokeObjectURL(target.videoObjectUrl);
    onChange({ ...data, captures: data.captures.filter((c) => c.id !== id) });
  };

  const toggleCard = (id: string) =>
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));

  // Screen capture handlers
  const handleScreenCapture = (imageDataUrl: string) => {
    if (!captureTargetId) return;
    update(captureTargetId, { capturedImageUrl: imageDataUrl, videoObjectUrl: undefined, videoFileName: undefined });
    setCaptureTargetId(null);
  };

  // Image upload handler
  const handleImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      update(id, { capturedImageUrl: ev.target?.result as string, videoObjectUrl: undefined, videoFileName: undefined });
    };
    reader.readAsDataURL(file);
    if (imageInputRefs.current[id]) imageInputRefs.current[id]!.value = '';
  };

  // Video upload handler
  const handleVideoUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const existing = data.captures.find((c) => c.id === id);
    if (existing?.videoObjectUrl) URL.revokeObjectURL(existing.videoObjectUrl);
    const objectUrl = URL.createObjectURL(file);
    update(id, { videoObjectUrl: objectUrl, videoFileName: file.name, capturedImageUrl: undefined });
    if (videoInputRefs.current[id]) videoInputRefs.current[id]!.value = '';
  };

  const clubLabel = (value: string) =>
    clubOptions.find((c) => c.value === value)?.label ?? value;

  const hasMedia = (c: SwingMotionCapture) => !!(c.capturedImageUrl || c.videoObjectUrl);
  const hasMetrics = (c: SwingMotionCapture) =>
    METRIC_FIELDS.some((f) => (c[f.field] as number | null) !== null) || c.tempoRatio.trim();

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-violet-300">스윙 모션 데이터</h4>
        <p className="text-xs text-slate-400 mt-1">
          클럽별 스윙을 화면 캡처·이미지·영상으로 기록하고 트랙맨 모션 지표를 입력하세요.
        </p>
      </div>

      {/* Add new capture */}
      <div className="flex gap-2">
        <select
          value={pendingClub}
          onChange={(e) => setPendingClub(e.target.value)}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
          data-testid="swing-motion-club-select"
        >
          <option value="">클럽 선택</option>
          {clubOptions.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <Button
          onClick={addCapture}
          disabled={!pendingClub}
          className="flex items-center gap-1.5 whitespace-nowrap"
          data-testid="swing-motion-add-btn"
        >
          <Plus className="w-4 h-4" />
          추가
        </Button>
      </div>

      {/* Capture cards */}
      <div className="space-y-3">
        {data.captures.map((capture) => {
          const isOpen = !!expandedCards[capture.id];
          return (
            <div key={capture.id} className="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleCard(capture.id)}
                  className="flex-1 flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                >
                  <span className="text-sm font-semibold text-slate-100">
                    {clubLabel(capture.clubType)}
                  </span>
                  {capture.label.trim() && (
                    <span className="text-xs text-slate-400">{capture.label}</span>
                  )}
                  <div className="flex gap-1.5 ml-auto mr-2">
                    {hasMedia(capture) && (
                      <span className="text-xs text-emerald-400">
                        {capture.videoObjectUrl ? '영상' : '이미지'}
                      </span>
                    )}
                    {hasMetrics(capture) && (
                      <span className="text-xs text-violet-400">지표 입력됨</span>
                    )}
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeCapture(capture.id)}
                  className="p-1 text-red-400 hover:text-red-300 transition-colors shrink-0"
                  data-testid={`swing-remove-${capture.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Card body */}
              {isOpen && (
                <div className="px-3 pb-4 space-y-4 border-t border-slate-800 pt-3">

                  {/* Label */}
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">라벨 (선택)</span>
                    <input
                      type="text"
                      value={capture.label}
                      onChange={(e) => update(capture.id, { label: e.target.value })}
                      placeholder="예: 임팩트 교정 전, 레슨 3회차"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                    />
                  </label>

                  {/* Media capture / upload */}
                  <div>
                    <p className="text-xs text-slate-400 mb-2">미디어 — 화면 캡처, 이미지 또는 영상 업로드</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCaptureTargetId(capture.id)}
                        className="flex items-center gap-1.5 text-xs h-8 px-3"
                        data-testid={`swing-screen-capture-${capture.id}`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        화면 캡처
                      </Button>

                      {/* Image upload */}
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={(el) => { imageInputRefs.current[capture.id] = el; }}
                          onChange={(e) => handleImageUpload(capture.id, e)}
                          data-testid={`swing-image-upload-${capture.id}`}
                        />
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-transparent px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors cursor-pointer h-8">
                          <Camera className="w-3.5 h-3.5" />
                          이미지 업로드
                        </span>
                      </label>

                      {/* Video upload */}
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          ref={(el) => { videoInputRefs.current[capture.id] = el; }}
                          onChange={(e) => handleVideoUpload(capture.id, e)}
                          data-testid={`swing-video-upload-${capture.id}`}
                        />
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-transparent px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors cursor-pointer h-8">
                          <Video className="w-3.5 h-3.5" />
                          영상 업로드
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Media preview */}
                  {capture.capturedImageUrl && (
                    <div className="relative">
                      <img
                        src={capture.capturedImageUrl}
                        alt="스윙 캡처"
                        className="w-full max-h-56 object-contain rounded-lg border border-slate-700 bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => update(capture.id, { capturedImageUrl: undefined })}
                        className="absolute top-1.5 right-1.5 rounded-full bg-slate-800/90 p-1 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {capture.videoObjectUrl && (
                    <div className="relative">
                      <video
                        src={capture.videoObjectUrl}
                        controls
                        playsInline
                        className="w-full max-h-56 rounded-lg border border-slate-700 bg-slate-950"
                      />
                      <p className="text-xs text-slate-500 mt-1 truncate">{capture.videoFileName}</p>
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(capture.videoObjectUrl!);
                          update(capture.id, { videoObjectUrl: undefined, videoFileName: undefined });
                        }}
                        className="absolute top-1.5 right-1.5 rounded-full bg-slate-800/90 p-1 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Motion metrics grid */}
                  <div>
                    <p className="text-xs text-slate-400 mb-2">트랙맨 모션 지표</p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      {METRIC_FIELDS.map(({ field, label, unit }) => (
                        <label key={field} className="space-y-1">
                          <span className="text-xs text-slate-500">
                            {label} ({unit})
                          </span>
                          <input
                            type="number"
                            value={(capture[field] as number | null) ?? ''}
                            onChange={(e) =>
                              update(capture.id, { [field]: parseNullable(e.target.value) })
                            }
                            placeholder="—"
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500 text-center"
                            data-testid={`swing-metric-${capture.id}-${field}`}
                          />
                        </label>
                      ))}
                      {/* Tempo ratio — text field */}
                      <label className="space-y-1">
                        <span className="text-xs text-slate-500">템포 비율</span>
                        <input
                          type="text"
                          value={capture.tempoRatio}
                          onChange={(e) => update(capture.id, { tempoRatio: e.target.value })}
                          placeholder="예: 3:1"
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500 text-center"
                          data-testid={`swing-metric-${capture.id}-tempoRatio`}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Coach note */}
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">코치 메모</span>
                    <textarea
                      value={capture.coachNote}
                      onChange={(e) => update(capture.id, { coachNote: e.target.value })}
                      placeholder="스윙 특이사항, 교정 포인트 등"
                      rows={2}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500 resize-none"
                      data-testid={`swing-note-${capture.id}`}
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}

        {data.captures.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-4">
            클럽을 선택하고 [추가] 버튼을 눌러 스윙 모션 데이터를 기록하세요.
          </p>
        )}
      </div>

      {/* Screen capture dialog */}
      {captureTargetId && (
        <ScreenCaptureDialog
          onCapture={handleScreenCapture}
          onClose={() => setCaptureTargetId(null)}
        />
      )}
    </div>
  );
};
