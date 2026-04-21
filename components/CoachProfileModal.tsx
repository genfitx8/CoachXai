
import React, { useState } from 'react';
import { CoachProfile } from '../types';
import { Button } from './Button';
import { X, User, Mail, Phone, CreditCard, Calendar, Users, LogOut, Edit2, Save, XCircle, CalendarDays } from 'lucide-react';

interface CoachProfileModalProps {
  isOpen: boolean;
  coachProfile: CoachProfile;
  onClose: () => void;
  onUpdate: (updatedProfile: CoachProfile) => void;
  onManageMembers: () => void;
  onManageReservations?: () => void;
  onLogout: () => void;
}

export const CoachProfileModal: React.FC<CoachProfileModalProps> = ({ 
  isOpen, 
  coachProfile, 
  onClose, 
  onUpdate, 
  onManageMembers,
  onManageReservations,
  onLogout 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(coachProfile.name);
  const [editPhone, setEditPhone] = useState(coachProfile.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
      setIsSaving(true);
      // Simulate API call
      setTimeout(() => {
          onUpdate({
              ...coachProfile,
              name: editName,
              phone: editPhone
          });
          setIsEditing(false);
          setIsSaving(false);
      }, 500);
  };

  const handleCancel = () => {
      setEditName(coachProfile.name);
      setEditPhone(coachProfile.phone || '');
      setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-slate-900 text-slate-100 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-700/80">
            <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 p-6 text-white text-center relative border-b border-slate-700/80">
                <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
                    <X className="w-5 h-5" />
                </button>
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg text-indigo-600 relative group">
                    <User className="w-10 h-10" />
                    {!isEditing && (
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="absolute bottom-0 right-0 p-1.5 bg-indigo-600 rounded-full text-white hover:bg-indigo-500 transition-colors shadow-sm"
                            title="정보 수정"
                        >
                            <Edit2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
                {isEditing ? (
                    <input 
                        type="text" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-slate-700/80 border border-slate-500 text-white text-center font-bold text-xl rounded-xl px-2 py-1.5 w-full outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                ) : (
                    <h2 className="text-xl font-bold">{coachProfile.name} 프로</h2>
                )}
                <p className="text-indigo-200 text-sm">CoachX Certified Coach</p>
            </div>
            
            <div className="p-6 space-y-4">
                {/* Info Fields */}
                <div className="flex items-center gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/70">
                    <Mail className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                        <p className="text-xs text-slate-500">이메일 (ID)</p>
                        <p className="text-sm font-medium text-slate-100">{coachProfile.email}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/70">
                    <Phone className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                        <p className="text-xs text-slate-500">전화번호</p>
                        {isEditing ? (
                            <input 
                                type="tel" 
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="010-0000-0000"
                            />
                        ) : (
                            <p className="text-sm font-medium text-slate-100">{coachProfile.phone || '-'}</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/70">
                    <CreditCard className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                        <p className="text-xs text-slate-500">구독 상태</p>
                        <div className="flex justify-between items-center">
                            <p className={`text-sm font-bold ${coachProfile.isSubscribed ? 'text-indigo-300' : 'text-slate-400'}`}>
                                {coachProfile.isSubscribed ? 'Premium Plan' : 'Free Plan'}
                            </p>
                            {coachProfile.isSubscribed && coachProfile.subscriptionEndDate && (
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(coachProfile.subscriptionEndDate).toLocaleDateString()} 까지
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 space-y-3">
                    {isEditing ? (
                        <div className="flex gap-2">
                             <Button onClick={handleCancel} variant="secondary" className="flex-1">취소</Button>
                             <Button onClick={handleSave} isLoading={isSaving} className="flex-1 bg-indigo-600 hover:bg-indigo-500">
                                <Save className="w-4 h-4 mr-1" /> 저장
                             </Button>
                        </div>
                    ) : (
                        <>
                            <Button 
                                onClick={onManageMembers} 
                                className="w-full bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700 shadow-sm"
                            >
                                <Users className="w-4 h-4 mr-2" /> 회원 목록 관리
                            </Button>
                            
                            {onManageReservations && (
                                <Button 
                                    onClick={onManageReservations} 
                                    className="w-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 shadow-sm"
                                >
                                    <CalendarDays className="w-4 h-4 mr-2" /> 예약 관리
                                </Button>
                            )}
                            
                            <Button 
                                onClick={onLogout} 
                                variant="secondary"
                                className="w-full text-red-300 border-red-500/30 hover:bg-red-500/10 hover:text-red-200 hover:border-red-500/50"
                            >
                                <LogOut className="w-4 h-4 mr-2" /> 로그아웃
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};
