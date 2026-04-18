import React, { useState, useEffect } from 'react';
import { googleCalendarService } from '../services/googleCalendarService';
import { X, Calendar, Check } from 'lucide-react';

interface GoogleCalendarModalProps {
  onClose: () => void;
  onSuccess: (calendarId: string) => void;
}

const GoogleCalendarModal: React.FC<GoogleCalendarModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'AUTH' | 'SELECT_CALENDAR' | 'SETTINGS' | 'COMPLETE'>('AUTH');
  const [calendars, setCalendars] = useState<any[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('primary');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncSettings, setSyncSettings] = useState({
    autoSync: true,
    syncInterval: 60,
    syncDirection: 'EXPORT_ONLY' as const,
  });

  const handleAuth = async () => {
    try {
      setLoading(true);
      setError(null);
      await googleCalendarService.initiateAuth();
      
      if (googleCalendarService.isSignedIn()) {
        setStep('SELECT_CALENDAR');
        await loadCalendars();
      } else {
        setError('인증에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || '구글 계정 인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadCalendars = async () => {
    try {
      setLoading(true);
      const calendarList = await googleCalendarService.listCalendars();
      setCalendars(calendarList);
    } catch (err: any) {
      setError(err.message || '캘린더 목록을 가져오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCalendar = () => {
    if (!selectedCalendarId) {
      setError('캘린더를 선택해주세요.');
      return;
    }
    setStep('SETTINGS');
  };

  const handleComplete = () => {
    setStep('COMPLETE');
    setTimeout(() => {
      onSuccess(selectedCalendarId);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">구글 캘린더 연동</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Step 1: Authentication */}
          {step === 'AUTH' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">구글 계정 인증</h3>
                <p className="text-gray-600 text-sm mb-6">
                  SwingNote가 구글 캘린더에 접근할 수 있도록 권한을 부여해주세요.
                </p>
              </div>
              <button
                onClick={handleAuth}
                disabled={loading}
                className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '인증 중...' : '구글 계정으로 로그인'}
              </button>
            </div>
          )}

          {/* Step 2: Select Calendar */}
          {step === 'SELECT_CALENDAR' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">캘린더 선택</h3>
                <p className="text-gray-600 text-sm mb-4">
                  일정을 동기화할 캘린더를 선택해주세요.
                </p>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-2 text-gray-600 text-sm">캘린더 목록 불러오는 중...</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {calendars.map((calendar) => (
                    <label
                      key={calendar.id}
                      className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="radio"
                        name="calendar"
                        value={calendar.id}
                        checked={selectedCalendarId === calendar.id}
                        onChange={(e) => setSelectedCalendarId(e.target.value)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{calendar.summary}</p>
                        {calendar.description && (
                          <p className="text-sm text-gray-500">{calendar.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('AUTH')}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={handleSelectCalendar}
                  disabled={!selectedCalendarId}
                  className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Sync Settings */}
          {step === 'SETTINGS' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">동기화 설정</h3>
                <p className="text-gray-600 text-sm mb-4">
                  캘린더 동기화 옵션을 설정해주세요.
                </p>
              </div>

              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <span className="text-gray-700">자동 동기화</span>
                  <input
                    type="checkbox"
                    checked={syncSettings.autoSync}
                    onChange={(e) =>
                      setSyncSettings({ ...syncSettings, autoSync: e.target.checked })
                    }
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                </label>

                {syncSettings.autoSync && (
                  <div>
                    <label className="block text-gray-700 mb-2">동기화 간격 (분)</label>
                    <select
                      value={syncSettings.syncInterval}
                      onChange={(e) =>
                        setSyncSettings({
                          ...syncSettings,
                          syncInterval: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value={15}>15분</option>
                      <option value={30}>30분</option>
                      <option value={60}>1시간</option>
                      <option value={180}>3시간</option>
                      <option value={360}>6시간</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-gray-700 mb-2">동기화 방향</label>
                  <select
                    value={syncSettings.syncDirection}
                    onChange={(e) =>
                      setSyncSettings({
                        ...syncSettings,
                        syncDirection: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="EXPORT_ONLY">내보내기만</option>
                    <option value="IMPORT_ONLY">가져오기만</option>
                    <option value="BIDIRECTIONAL">양방향</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('SELECT_CALENDAR')}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={handleComplete}
                  className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  완료
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'COMPLETE' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">연동 완료!</h3>
              <p className="text-gray-600 text-sm">
                구글 캘린더 연동이 성공적으로 완료되었습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoogleCalendarModal;
