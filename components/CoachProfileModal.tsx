import React, { useState } from 'react';
import { CoachProfile } from '../types';
import { Button } from './Button';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import {
  Calendar,
  CalendarDays,
  CreditCard,
  Edit2,
  LogOut,
  Mail,
  Phone,
  Save,
  User,
  Users,
} from 'lucide-react';

interface CoachProfileModalProps {
  isOpen: boolean;
  coachProfile: CoachProfile;
  onClose: () => void;
  onUpdate: (updatedProfile: CoachProfile) => void;
  onManageMembers: () => void;
  onManageReservations?: () => void;
  onLogout: () => void;
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 rounded-xl border border-line-subtle bg-bg-base p-3">
    <span className="mt-0.5 text-ink-muted">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-0.5 text-sm text-ink-high">{children}</div>
    </div>
  </div>
);

export const CoachProfileModal: React.FC<CoachProfileModalProps> = ({
  isOpen,
  coachProfile,
  onClose,
  onUpdate,
  onManageMembers,
  onManageReservations,
  onLogout,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(coachProfile.name);
  const [editPhone, setEditPhone] = useState(coachProfile.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    // Simulate API call
    setTimeout(() => {
      onUpdate({ ...coachProfile, name: editName, phone: editPhone });
      setIsEditing(false);
      setIsSaving(false);
    }, 500);
  };

  const handleCancel = () => {
    setEditName(coachProfile.name);
    setEditPhone(coachProfile.phone || '');
    setIsEditing(false);
  };

  const title = (
    <span className="flex items-center gap-3">
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-primary-300">
        <User className="h-6 w-6" />
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            title="정보 수정"
            aria-label="정보 수정"
            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white shadow-elev-1 hover:bg-primary-400"
          >
            <Edit2 className="h-3 w-3" />
          </button>
        )}
      </span>
      <span className="flex flex-col">
        {isEditing ? (
          <Input
            label="이름"
            srOnlyLabel
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            containerClassName="w-48"
          />
        ) : (
          <span className="text-lg font-semibold text-ink-high tracking-tight">
            {coachProfile.name} 프로
          </span>
        )}
        <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary-300/90">
          CoachX Certified Coach
        </span>
      </span>
    </span>
  );

  const footer = isEditing ? (
    <>
      <Button variant="ghost" onClick={handleCancel}>
        취소
      </Button>
      <Button onClick={handleSave} isLoading={isSaving} icon={<Save className="h-4 w-4" />}>
        저장
      </Button>
    </>
  ) : null;

  return (
    <Modal open={isOpen} onClose={onClose} title={title} size="sm" footer={footer}>
      <div className="space-y-3">
        <InfoRow icon={<Mail className="h-4 w-4" />} label="이메일 (ID)">
          <span className="break-all">{coachProfile.email}</span>
        </InfoRow>

        <InfoRow icon={<Phone className="h-4 w-4" />} label="전화번호">
          {isEditing ? (
            <Input
              label="전화번호"
              srOnlyLabel
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="010-0000-0000"
            />
          ) : (
            coachProfile.phone || '-'
          )}
        </InfoRow>

        <InfoRow icon={<CreditCard className="h-4 w-4" />} label="구독 상태">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-sm font-semibold ${
                coachProfile.isSubscribed ? 'text-primary-300' : 'text-ink-muted'
              }`}
            >
              {coachProfile.isSubscribed ? 'Premium Plan' : 'Free Plan'}
            </span>
            {coachProfile.isSubscribed && coachProfile.subscriptionEndDate && (
              <Badge tone="primary" size="sm">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                {new Date(coachProfile.subscriptionEndDate).toLocaleDateString()} 까지
              </Badge>
            )}
          </div>
        </InfoRow>

        {!isEditing && (
          <div className="space-y-2 pt-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={onManageMembers}
              icon={<Users className="h-4 w-4" />}
            >
              회원 목록 관리
            </Button>

            {onManageReservations && (
              <Button
                variant="secondary"
                fullWidth
                onClick={onManageReservations}
                icon={<CalendarDays className="h-4 w-4" />}
                className="border-primary-500/30 bg-primary-500/10 text-primary-200 hover:bg-primary-500/15"
              >
                예약 관리
              </Button>
            )}

            <Button
              variant="secondary"
              fullWidth
              onClick={onLogout}
              icon={<LogOut className="h-4 w-4" />}
              className="border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            >
              로그아웃
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
