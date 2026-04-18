import React, { useState, useEffect } from 'react';
import { CalendarIntegration as CalendarIntegrationType, CalendarProvider, Lesson } from '../types';
import { calendarIntegrationService } from '../services/calendarIntegrationService';
import { icalService } from '../services/icalService';
import { googleCalendarService } from '../services/googleCalendarService';
import { ArrowLeft, Calendar, Check, Download, Link2, RefreshCw, X } from 'lucide-react';

interface CalendarIntegrationProps {
  userId: string;
  userRole: 'COACH' | 'CLIENT';
  lessons?: Lesson[];
  onBack: () => void;
}

const CalendarIntegrationComponent: React.FC<CalendarIntegrationProps> = ({
  userId,
  userRole,
  lessons = [],
  onBack,
}) => {
  const [integrations, setIntegrations] = useState<CalendarIntegrationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIntegrations();
  }, [userId]);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const data = await calendarIntegrationService.getAllIntegrations(userId);
      setIntegrations(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      setError(null);
      await calendarIntegrationService.initGoogleCalendarAuth();
      
      // Create integration record
      const integration: CalendarIntegrationType = {
        id: `google_${userId}_${Date.now()}`,
        userId,
        provider: 'GOOGLE',
        accessToken: googleCalendarService.getAccessToken() || undefined,
        isActive: true,
        syncEnabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await calendarIntegrationService.saveIntegration(integration);
      await loadIntegrations();
      alert('구글 캘린더 연동이 완료되었습니다!');
    } catch (err: any) {
      setError(err.message || '구글 캘린더 연동에 실패했습니다.');
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    if (!confirm('정말로 연동을 해제하시겠습니까?')) return;

    try {
      await calendarIntegrationService.removeIntegration(integrationId);
      await loadIntegrations();
      alert('연동이 해제되었습니다.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSync = async (integrationId: string) => {
    try {
      setSyncing(integrationId);
      setError(null);
      const result = await calendarIntegrationService.syncCalendar(integrationId);
      
      if (result.success) {
        alert(`${result.synced}개의 일정이 동기화되었습니다.`);
        await loadIntegrations();
      } else {
        setError(result.errors.join(', '));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(null);
    }
  };

  const handleDownloadICal = async () => {
    try {
      setError(null);
      const events = icalService.convertLessonsToICalEvents(lessons);
      const icalContent = await icalService.generateICalFile(events);
      icalService.downloadICalFile(icalContent, 'swingnote-lessons.ics');
      alert('iCal 파일 다운로드가 완료되었습니다!');
    } catch (err: any) {
      setError(err.message || 'iCal 파일 생성에 실패했습니다.');
    }
  };

  const handleCopySubscriptionUrl = () => {
    // Generate a simple token based on user ID (in production, use a proper JWT or secure token)
    const token = btoa(userId + '-' + Date.now());
    const url = icalService.generateSubscriptionUrl(userId, token);
    navigator.clipboard.writeText(url);
    alert('구독 URL이 클립보드에 복사되었습니다!');
  };

  const handleExportToGoogle = async () => {
    try {
      const googleIntegration = integrations.find((i) => i.provider === 'GOOGLE' && i.isActive);
      
      if (!googleIntegration) {
        alert('먼저 구글 캘린더를 연동해주세요.');
        return;
      }

      setError(null);
      await calendarIntegrationService.exportToCalendar(googleIntegration, lessons);
      alert('구글 캘린더로 내보내기가 완료되었습니다!');
    } catch (err: any) {
      setError(err.message || '내보내기에 실패했습니다.');
    }
  };

  const getProviderColor = (provider: CalendarProvider) => {
    switch (provider) {
      case 'GOOGLE':
        return 'bg-blue-500';
      case 'APPLE':
        return 'bg-gray-500';
      case 'ICAL':
        return 'bg-orange-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getProviderName = (provider: CalendarProvider) => {
    switch (provider) {
      case 'GOOGLE':
        return '구글 캘린더';
      case 'APPLE':
        return 'Apple 캘린더';
      case 'ICAL':
        return 'iCal';
      default:
        return provider;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>뒤로가기</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">캘린더 연동</h1>
          <div className="w-20"></div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-800">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">빠른 작업</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={handleDownloadICal}
              className="flex items-center gap-2 px-4 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Download className="w-5 h-5" />
              <span>.ics 다운로드</span>
            </button>
            <button
              onClick={handleCopySubscriptionUrl}
              className="flex items-center gap-2 px-4 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              <Link2 className="w-5 h-5" />
              <span>구독 URL 복사</span>
            </button>
            <button
              onClick={handleExportToGoogle}
              className="flex items-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Calendar className="w-5 h-5" />
              <span>구글로 내보내기</span>
            </button>
          </div>
        </div>

        {/* Calendar Providers */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">캘린더 서비스</h2>

          {/* Google Calendar */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 ${getProviderColor('GOOGLE')} rounded-lg flex items-center justify-center`}>
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{getProviderName('GOOGLE')}</h3>
                  <p className="text-sm text-gray-500">구글 계정과 연동하여 일정을 동기화</p>
                </div>
              </div>
              {integrations.find((i) => i.provider === 'GOOGLE' && i.isActive) ? (
                <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  <Check className="w-4 h-4" />
                  연결됨
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                  미연결
                </span>
              )}
            </div>

            {integrations.find((i) => i.provider === 'GOOGLE' && i.isActive) ? (
              <div className="space-y-3">
                {integrations
                  .filter((i) => i.provider === 'GOOGLE')
                  .map((integration) => (
                    <div key={integration.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm text-gray-600">
                          마지막 동기화:{' '}
                          {integration.lastSyncAt
                            ? new Date(integration.lastSyncAt).toLocaleString('ko-KR')
                            : '없음'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSync(integration.id)}
                          disabled={syncing === integration.id}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${syncing === integration.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDisconnect(integration.id)}
                          className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                        >
                          연동 해제
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <button
                onClick={handleConnectGoogle}
                className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                구글 계정으로 연결
              </button>
            )}
          </div>

          {/* iCal/Webcal */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 ${getProviderColor('ICAL')} rounded-lg flex items-center justify-center`}>
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">iCal / Webcal</h3>
                  <p className="text-sm text-gray-500">모든 캘린더 앱에서 사용 가능한 표준 형식</p>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-600 space-y-2">
              <p>• .ics 파일을 다운로드하여 Apple 캘린더, Outlook 등에서 가져오기</p>
              <p>• 구독 URL을 복사하여 자동 업데이트 수신</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarIntegrationComponent;
