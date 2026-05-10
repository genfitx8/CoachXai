import React from 'react';
import { Bell, Calendar, ChevronRight } from 'lucide-react';
import { NotificationMessage } from '../types';
import { Button } from './Button';
import { Modal } from './ui/Modal';

interface CoachReservationNotificationModalProps {
  notifications: NotificationMessage[];
  onClose: () => void;
  onGoToReservations?: () => void;
}

/**
 * Modal popup shown to a coach on login when there are unread lesson
 * reservation request notifications. Built on the shared Modal primitive
 * (focus trap, ESC, body-scroll lock, mobile bottom-sheet).
 */
export const CoachReservationNotificationModal: React.FC<
  CoachReservationNotificationModalProps
> = ({ notifications, onClose, onGoToReservations }) => {
  if (notifications.length === 0) return null;

  const handleGoToReservations = () => {
    onClose();
    onGoToReservations?.();
  };

  const title = (
    <span className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300">
        <Bell className="h-5 w-5" />
      </span>
      새 레슨 예약 요청
    </span>
  );

  const description = `${notifications.length}건의 미확인 요청이 있습니다.`;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose}>
        나중에 보기
      </Button>
      {onGoToReservations && (
        <Button
          onClick={handleGoToReservations}
          icon={<ChevronRight className="h-4 w-4" />}
        >
          예약 요청 확인하기
        </Button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={footer}
    >
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {notifications.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-3 rounded-xl border border-line-subtle bg-bg-base p-3"
          >
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" />
            <p className="text-sm leading-snug text-ink-high">{n.body}</p>
          </li>
        ))}
      </ul>
    </Modal>
  );
};
