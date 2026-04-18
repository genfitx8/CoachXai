
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 text-white text-center relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
                    <X className="w-5 h-5" />
                </button>
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg text-indigo-600 relative group">
                    <User className="w-10 h-10" />
                    {!isEditing && (
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="absolute bottom-0 right-0 p-1.5 bg-indigo-500 rounded-full text-white hover:bg-indigo-400 transition-colors shadow-sm"
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
                        className="bg-white/20 border border-white/30 text-white text-center font-bold text-xl rounded px-2 py-1 w-full outline-none focus:ring-2 focus:ring-white/50"
                    />
                ) : (
                    <h2 className="text-xl font-bold">{coachProfile.name} 프로</h2>
                )}
                <p className="text-indigo-200 text-sm">SwingNote Certified Coach</p>
            </div>
            
            <div className="p-6 space-y-4">
                {/* Info Fields */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                        <p className="text-xs text-gray-500">이메일 (ID)</p>
                        <p className="text-sm font-medium text-gray-900">{coachProfile.email}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                        <p className="text-xs text-gray-500">전화번호</p>
                        {isEditing ? (
                            <input 
                                type="tel" 
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500"
                                placeholder="010-0000-0000"
                            />
                        ) : (
                            <p className="text-sm font-medium text-gray-900">{coachProfile.phone || '-'}</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CreditCard className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                        <p className="text-xs text-gray-500">구독 상태</p>
                        <div className="flex justify-between items-center">
                            <p className={`text-sm font-bold ${coachProfile.isSubscribed ? 'text-indigo-600' : 'text-gray-500'}`}>
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
                             <Button onClick={handleSave} isLoading={isSaving} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                                <Save className="w-4 h-4 mr-1" /> 저장
                             </Button>
                        </div>
                    ) : (
                        <>
                            <Button 
                                onClick={onManageMembers} 
                                className="w-full bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 shadow-sm"
                            >
                                <Users className="w-4 h-4 mr-2" /> 회원 목록 관리
                            </Button>
                            
                            {onManageReservations && (
                                <Button 
                                    onClick={onManageReservations} 
                                    className="w-full bg-white text-green-600 border border-green-200 hover:bg-green-50 shadow-sm"
                                >
                                    <CalendarDays className="w-4 h-4 mr-2" /> 예약 관리
                                </Button>
                            )}
                            
                            <Button 
                                onClick={onLogout} 
                                variant="secondary"
                                className="w-full text-red-500 border-red-100 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
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
