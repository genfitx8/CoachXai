import React from 'react';
import { Bell, X, Calendar, ChevronRight } from 'lucide-react';
import { NotificationMessage } from '../types';
import { Button } from './Button';

interface CoachReservationNotificationModalProps {
  notifications: NotificationMessage[];
  onClose: () => void;
  onGoToReservations?: () => void;
}

/**
 * Modal popup shown to a coach on login when there are unread lesson
 * reservation request notifications.
 */
export const CoachReservationNotificationModal: React.FC<
  CoachReservationNotificationModalProps
> = ({ notifications, onClose, onGoToReservations }) => {
  if (notifications.length === 0) return null;

  const handleGoToReservations = () => {
    onClose();
    onGoToReservations?.();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-bg-raised rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-700 to-slate-900 p-5 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-xl p-2">
              <Bell className="w-6 h-6 fill-current" />
            </div>
            <div>
              <h2 className="text-lg font-bold">새 레슨 예약 요청</h2>
              <p className="text-indigo-200 text-sm">
                {notifications.length}건의 미확인 요청이 있습니다.
              </p>
            </div>
          </div>
        </div>

        {/* Notification list */}
        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 bg-bg-base rounded-xl p-3"
            >
              <Calendar className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-ink-high leading-snug">{n.body}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-4 flex flex-col gap-2 border-t border-line-subtle">
          {onGoToReservations && (
            <Button
              onClick={handleGoToReservations}
              className="w-full bg-slate-700 hover:bg-slate-800 text-white"
              icon={<ChevronRight className="w-4 h-4" />}
            >
              예약 요청 확인하기
            </Button>
          )}
          <Button
            onClick={onClose}
            variant="secondary"
            className="w-full text-ink-medium border-line-default hover:bg-bg-base"
          >
            나중에 보기
          </Button>
        </div>
      </div>
    </div>
  );
};
