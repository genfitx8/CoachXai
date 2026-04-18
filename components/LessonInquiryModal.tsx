import React, { useState } from 'react';
import { X, Send, CheckCircle, AlertCircle, Loader2, Calendar, MessageSquare } from 'lucide-react';
import { Button } from './Button';
import { ClientProfile, CoachFinderResult } from '../types';
import { lessonInquiryService } from '../services/lessonInquiryService';

interface LessonInquiryModalProps {
  coach: CoachFinderResult;
  clientProfile: ClientProfile;
  onClose: () => void;
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export const LessonInquiryModal: React.FC<LessonInquiryModalProps> = ({
  coach,
  clientProfile,
  onClose,
}) => {
  const [message, setMessage] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const clientId = `${clientProfile.name}_${clientProfile.phone}`.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitState('loading');
    setErrorMsg('');

    try {
      await lessonInquiryService.createInquiry({
        coachId: coach.id,
        coachName: coach.name,
        clientId,
        clientName: clientProfile.name,
        clientPhone: clientProfile.phone,
        message: message.trim(),
        preferredDate: preferredDate || undefined,
        preferredTime: preferredTime || undefined,
      });
      setSubmitState('success');
    } catch (err) {
      console.error('LessonInquiry submit failed', err);
      setErrorMsg('문의 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      setSubmitState('error');
    }
  };

  // Determine today's date as min for the date picker
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">레슨 문의</h2>
            <p className="text-xs text-gray-500 mt-0.5">{coach.name} 코치님께 문의</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {submitState === 'success' ? (
            // ─── Success state ─────────────────────────────────────────────
            <div className="flex flex-col items-center text-center py-6 gap-4">
              <div className="bg-emerald-100 p-4 rounded-full">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 mb-1">문의가 전송되었습니다!</h3>
                <p className="text-sm text-gray-600">
                  {coach.name} 코치님이 확인 후 연락드릴 예정입니다.
                </p>
              </div>
              <Button onClick={onClose} className="mt-2 w-full">
                확인
              </Button>
            </div>
          ) : (
            // ─── Form ──────────────────────────────────────────────────────
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Coach info summary */}
              <div className="bg-emerald-50 rounded-xl p-3 flex items-center gap-3">
                <div className="bg-emerald-100 p-2.5 rounded-full text-emerald-600 shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{coach.name} 코치</p>
                  <p className="text-xs text-emerald-700 truncate">{coach.region ?? '지역 미설정'}</p>
                </div>
              </div>

              {/* Message */}
              <div>
                <label
                  htmlFor="inquiry-message"
                  className="block text-sm font-bold text-gray-900 mb-1.5"
                >
                  문의 내용 <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="inquiry-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="레슨 목표, 현재 실력, 궁금한 점 등을 자유롭게 적어 주세요."
                  rows={4}
                  maxLength={500}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none transition-all"
                />
                <p className="text-right text-xs text-gray-400 mt-1">{message.length} / 500</p>
              </div>

              {/* Preferred date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="inquiry-date"
                    className="block text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-1"
                  >
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    희망 날짜
                  </label>
                  <input
                    id="inquiry-date"
                    type="date"
                    value={preferredDate}
                    min={todayStr}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label
                    htmlFor="inquiry-time"
                    className="block text-sm font-bold text-gray-900 mb-1.5"
                  >
                    희망 시간
                  </label>
                  <input
                    id="inquiry-time"
                    type="time"
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Error state */}
              {submitState === 'error' && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                isLoading={submitState === 'loading'}
                disabled={!message.trim() || submitState === 'loading'}
                icon={<Send className="w-4 h-4" />}
                className="w-full"
              >
                문의 보내기
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
