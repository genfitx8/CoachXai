import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Search,
  ChevronLeft,
  User,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from 'lucide-react';
import { Button } from './Button';
import { LessonInquiryModal } from './LessonInquiryModal';
import { coachFinderService, GeoCoords, getCurrentPosition } from '../services/coachFinderService';
import { ClientProfile, CoachFinderResult } from '../types';

interface CoachFinderProps {
  clientProfile: ClientProfile;
  onBack: () => void;
}

type SearchMode = 'region' | 'location';
type LoadState = 'idle' | 'loading' | 'success' | 'error';

const REGIONS = [
  '서울 강남구', '서울 서초구', '서울 마포구', '서울 송파구',
  '경기 성남시', '경기 수원시', '경기 고양시',
  '부산 해운대구', '부산 남구',
  '인천 연수구', '대구 수성구', '광주 서구',
];

export const CoachFinder: React.FC<CoachFinderProps> = ({ clientProfile, onBack }) => {
  const [searchMode, setSearchMode] = useState<SearchMode>('region');
  const [regionTerm, setRegionTerm] = useState('');
  const [coaches, setCoaches] = useState<CoachFinderResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedCoachId, setExpandedCoachId] = useState<string | null>(null);
  const [inquiryCoach, setInquiryCoach] = useState<CoachFinderResult | null>(null);
  const [userCoords, setUserCoords] = useState<GeoCoords | null>(null);
  const [locationError, setLocationError] = useState('');

  const handleRegionSearch = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg('');
    try {
      const results = await coachFinderService.searchByRegion(regionTerm);
      setCoaches(results);
      setLoadState('success');
    } catch (e) {
      console.error(e);
      setErrorMsg('코치 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setLoadState('error');
    }
  }, [regionTerm]);

  const handleLocationSearch = useCallback(async (coords: GeoCoords) => {
    setLoadState('loading');
    setErrorMsg('');
    try {
      const results = await coachFinderService.searchNearby(coords);
      setCoaches(results);
      setLoadState('success');
    } catch (e) {
      console.error(e);
      setErrorMsg('주변 코치 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setLoadState('error');
    }
  }, []);

  const handleGetLocation = async () => {
    setLocationError('');
    try {
      const coords = await getCurrentPosition();
      setUserCoords(coords);
      await handleLocationSearch(coords);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : '위치를 가져올 수 없습니다.';
      setLocationError(msg);
    }
  };

  // Auto-load for region mode whenever mode switches
  useEffect(() => {
    if (searchMode === 'region') {
      handleRegionSearch();
    }
  }, [searchMode, handleRegionSearch]);

  const handleRegionFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRegionSearch();
  };

  const toggleExpand = (coachId: string) => {
    setExpandedCoachId((prev) => (prev === coachId ? null : coachId));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 pb-1">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          aria-label="뒤로 가기"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full" />
        <div>
          <h2 className="text-xl font-black text-gray-900">코치 찾기</h2>
          <p className="text-xs text-gray-500">지역 또는 현재 위치로 코치를 검색하세요</p>
        </div>
      </div>

      {/* ── Mode selector ── */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setSearchMode('region')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            searchMode === 'region'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MapPin className="w-4 h-4" />
          지역 선택
        </button>
        <button
          onClick={() => setSearchMode('location')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            searchMode === 'location'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Navigation className="w-4 h-4" />
          현재 위치
        </button>
      </div>

      {/* ── Search controls ── */}
      {searchMode === 'region' ? (
        <form onSubmit={handleRegionFormSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="지역명 입력 (예: 강남, 수원)"
              value={regionTerm}
              onChange={(e) => setRegionTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <Button type="submit" isLoading={loadState === 'loading'} className="px-4 py-2.5 text-sm shrink-0">
            검색
          </Button>
        </form>
      ) : (
        <div className="space-y-2">
          <Button
            onClick={handleGetLocation}
            isLoading={loadState === 'loading'}
            icon={<Navigation className="w-4 h-4" />}
            className="w-full"
          >
            현재 위치로 코치 검색
          </Button>
          {userCoords && (
            <p className="text-xs text-center text-emerald-600 font-medium">
              📍 위치 확인됨 (위도 {userCoords.latitude.toFixed(4)}, 경도 {userCoords.longitude.toFixed(4)})
            </p>
          )}
          {locationError && (
            <p className="text-xs text-center text-red-600 flex items-center justify-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {locationError}
            </p>
          )}
        </div>
      )}

      {/* ── Region quick-picks ── */}
      {searchMode === 'region' && (
        <div className="flex flex-wrap gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRegionTerm(r);
                setLoadState('loading');
                setErrorMsg('');
                coachFinderService
                  .searchByRegion(r)
                  .then((res) => {
                    setCoaches(res);
                    setLoadState('success');
                  })
                  .catch((e) => {
                    console.error(e);
                    setErrorMsg('코치 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
                    setLoadState('error');
                  });
              }}
              className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-emerald-100 hover:text-emerald-700 text-gray-600 rounded-full font-medium transition-colors border border-gray-200 hover:border-emerald-300"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loadState === 'loading' && (
        <div className="flex flex-col items-center py-10 gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-sm font-medium">코치를 검색하는 중…</p>
        </div>
      )}

      {/* ── Error ── */}
      {loadState === 'error' && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {loadState === 'success' && coaches.length === 0 && (
        <div className="flex flex-col items-center py-10 gap-3 text-gray-400">
          <User className="w-12 h-12 text-gray-300" />
          <p className="text-sm font-bold text-gray-500">검색 결과가 없습니다</p>
          <p className="text-xs text-gray-400 text-center">
            다른 지역명을 입력하거나 현재 위치 검색을 이용해 보세요.
          </p>
        </div>
      )}

      {/* ── Coach list ── */}
      {loadState === 'success' && coaches.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium">
            {coaches.length}명의 코치를 찾았습니다
          </p>
          {coaches.map((coach) => (
            <CoachCard
              key={coach.id}
              coach={coach}
              isExpanded={expandedCoachId === coach.id}
              onToggleExpand={() => toggleExpand(coach.id)}
              onInquiry={() => setInquiryCoach(coach)}
            />
          ))}
        </div>
      )}

      {/* ── Inquiry modal ── */}
      {inquiryCoach && (
        <LessonInquiryModal
          coach={inquiryCoach}
          clientProfile={clientProfile}
          onClose={() => setInquiryCoach(null)}
        />
      )}
    </div>
  );
};

// ─── Coach Card ───────────────────────────────────────────────────────────────

interface CoachCardProps {
  coach: CoachFinderResult;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onInquiry: () => void;
}

const CoachCard: React.FC<CoachCardProps> = ({
  coach,
  isExpanded,
  onToggleExpand,
  onInquiry,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md">
      {/* Card header */}
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <div className="bg-gradient-to-br from-emerald-100 to-teal-100 p-3 rounded-full shrink-0">
          <User className="w-7 h-7 text-emerald-600" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-black text-gray-900 text-base">{coach.name}</h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                coach.isLessonAvailable !== false
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {coach.isLessonAvailable !== false ? (
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> 레슨 가능
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> 레슨 불가
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="truncate">{coach.region ?? '지역 미설정'}</span>
          </div>

          {coach.distanceKm !== undefined && (
            <p className="text-xs text-emerald-600 font-semibold mt-0.5">
              약 {coach.distanceKm.toFixed(1)} km
            </p>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
          aria-label={isExpanded ? '접기' : '더 보기'}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 animate-fade-in">
          {coach.introduction && (
            <p className="text-sm text-gray-700 leading-relaxed">{coach.introduction}</p>
          )}

          {coach.workingSchedule && (
            <div className="text-xs text-gray-500">
              <span className="font-bold text-gray-700">운영 시간</span>{' '}
              레슨 스케줄은 예약 화면에서 확인하세요.
            </div>
          )}

          <Button
            onClick={onInquiry}
            icon={<MessageSquare className="w-4 h-4" />}
            className="w-full text-sm"
            disabled={coach.isLessonAvailable === false}
          >
            {coach.isLessonAvailable !== false ? '레슨 문의하기' : '현재 레슨 불가'}
          </Button>
        </div>
      )}

      {/* CTA when collapsed */}
      {!isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          <button
            onClick={onInquiry}
            disabled={coach.isLessonAvailable === false}
            className="w-full text-center text-sm font-bold text-emerald-600 hover:text-emerald-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-4 h-4" />
            {coach.isLessonAvailable !== false ? '레슨 문의' : '레슨 불가'}
          </button>
        </div>
      )}
    </div>
  );
};
