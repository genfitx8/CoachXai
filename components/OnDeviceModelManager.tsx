/**
 * OnDeviceModelManager — compact card that lets the user download / delete
 * the on-device AI model (Gemma) and shows its live status.
 *
 * Renders nothing when the deployment has no on-device model configured
 * (VITE_ON_DEVICE_MODEL_URL unset), so shipping this mounted is safe.
 */
import React, { useEffect, useState } from 'react';
import { Cpu, Download, Trash2, CheckCircle2, AlertTriangle, WifiOff } from 'lucide-react';
import { useLanguage } from './LanguageContext';
import {
  deleteModel,
  disposeOnDeviceEngine,
  downloadModel,
  getModelDownloadState,
  isLikelyMeteredConnection,
  isOnDeviceLlmEnabled,
  refreshModelStatus,
  subscribeModelDownload,
  type ModelDownloadState,
} from '../services/onDeviceLlm';

const labels = {
  ko: {
    title: '온디바이스 AI',
    ready: '설치됨 — 간단한 질문은 기기에서 즉시 답변됩니다',
    notDownloaded: '모델을 설치하면 간단한 질문은 오프라인에서도 즉시 답변됩니다 (약 300MB)',
    downloading: '다운로드 중…',
    unsupported: '이 기기는 온디바이스 AI를 지원하지 않습니다',
    error: '다운로드 실패',
    download: '설치',
    delete: '삭제',
    retry: '다시 시도',
    metered: '셀룰러 연결 상태입니다 — Wi-Fi 사용을 권장합니다',
  },
  en: {
    title: 'On-device AI',
    ready: 'Installed — simple questions are answered instantly on your device',
    notDownloaded: 'Install the model to answer simple questions instantly, even offline (~300MB)',
    downloading: 'Downloading…',
    unsupported: 'This device does not support on-device AI',
    error: 'Download failed',
    download: 'Install',
    delete: 'Remove',
    retry: 'Retry',
    metered: 'You appear to be on cellular — Wi-Fi is recommended',
  },
  ja: {
    title: 'オンデバイスAI',
    ready: 'インストール済み — 簡単な質問は端末上で即座に回答されます',
    notDownloaded: 'モデルをインストールすると、簡単な質問はオフラインでも即座に回答されます（約300MB）',
    downloading: 'ダウンロード中…',
    unsupported: 'この端末はオンデバイスAIに対応していません',
    error: 'ダウンロードに失敗しました',
    download: 'インストール',
    delete: '削除',
    retry: '再試行',
    metered: 'モバイル回線のようです — Wi-Fiを推奨します',
  },
} as const;

const formatMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(0)}MB`;

export const OnDeviceModelManager: React.FC = () => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';
  const L = labels[lang];

  const [state, setState] = useState<ModelDownloadState>(getModelDownloadState());

  useEffect(() => {
    const unsubscribe = subscribeModelDownload(setState);
    void refreshModelStatus().then(() => setState(getModelDownloadState()));
    return unsubscribe;
  }, []);

  if (!isOnDeviceLlmEnabled() || state.status === 'disabled') return null;

  const handleDelete = async () => {
    disposeOnDeviceEngine();
    await deleteModel();
  };

  const pct = Math.round(state.progress * 100);

  return (
    <div className="mx-3 my-2 rounded-xl border border-line-subtle bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg border flex items-center justify-center bg-emerald-500/10 border-emerald-300/20">
          <Cpu className="w-4 h-4 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-high flex items-center gap-1.5">
            {L.title}
            {state.status === 'ready' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />}
          </p>
          <p className="text-[11px] text-ink-muted leading-snug">
            {state.status === 'ready' && L.ready}
            {state.status === 'not_downloaded' && L.notDownloaded}
            {state.status === 'downloading' &&
              `${L.downloading} ${formatMb(state.receivedBytes)}${state.totalBytes ? ` / ${formatMb(state.totalBytes)}` : ''}`}
            {state.status === 'unsupported' && L.unsupported}
            {state.status === 'error' && `${L.error}${state.errorMessage ? ` — ${state.errorMessage}` : ''}`}
          </p>
        </div>
        {state.status === 'not_downloaded' && (
          <button
            type="button"
            onClick={() => void downloadModel()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-200 border border-emerald-300/25 hover:bg-emerald-500/25 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {L.download}
          </button>
        )}
        {state.status === 'error' && (
          <button
            type="button"
            onClick={() => void downloadModel()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-200 border border-amber-300/25 hover:bg-amber-500/25 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {L.retry}
          </button>
        )}
        {state.status === 'ready' && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            aria-label={L.delete}
            className="p-2 rounded-lg text-ink-muted hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {state.status === 'downloading' && (
        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      )}

      {state.status === 'not_downloaded' && isLikelyMeteredConnection() && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300/90">
          <WifiOff className="w-3.5 h-3.5" />
          {L.metered}
        </p>
      )}
    </div>
  );
};
