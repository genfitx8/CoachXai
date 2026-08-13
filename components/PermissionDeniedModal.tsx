import React from 'react';
import { AlertCircle, X, Settings, RefreshCw } from 'lucide-react';
import {
  canJumpToAppSettings,
  getPermissionCopy,
  openAppSettings,
  type MediaKind,
} from '../utils/mediaPermissions';
import { useLanguage } from './LanguageContext';

interface PermissionDeniedModalProps {
  open: boolean;
  kind: MediaKind;
  onClose: () => void;
  onRetry?: () => void;
}

/**
 * Full-screen modal shown when the app tries to use the camera or
 * microphone but the OS / browser has denied the permission.
 *
 * On iOS (native shell) a single tap of "설정 열기" jumps straight into
 * the app's Settings pane. On Android and on the web that jump isn't
 * available from JavaScript, so we surface the exact step-by-step
 * instructions the user needs to follow instead.
 */
export const PermissionDeniedModal: React.FC<PermissionDeniedModalProps> = ({
  open,
  kind,
  onClose,
  onRetry,
}) => {
  const { language } = useLanguage();
  if (!open) return null;

  const copy = getPermissionCopy(kind, language);
  const canJump = canJumpToAppSettings();

  const handleOpenSettings = () => {
    const jumped = openAppSettings();
    if (!jumped) {
      // Nothing more to do — the step-by-step list is already visible.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="permission-modal-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md bg-white/[0.04] text-ink-high rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2
                id="permission-modal-title"
                className="text-lg font-bold leading-snug"
              >
                {copy.title}
              </h2>
              <p className="text-sm text-ink-medium mt-1">{copy.intro}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeLabel}
            className="p-1 -mr-1 text-ink-muted hover:text-ink-medium transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2">
          <ol className="space-y-2.5">
            {copy.steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-ink-high leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-5 pb-5 pt-4 space-y-2">
          {canJump && (
            <button
              type="button"
              onClick={handleOpenSettings}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
            >
              <Settings className="w-4 h-4" />
              {copy.primaryLabel}
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-ink-high font-semibold transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {copy.retryLabel}
            </button>
          )}
          {!canJump && !onRetry && (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-ink-high font-semibold transition-colors"
            >
              {copy.closeLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PermissionDeniedModal;
