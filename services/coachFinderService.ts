/**
 * coachFinderService.ts
 *
 * Location-based / region-based coach finder service.
 *
 * Design notes:
 * - Real coach data is loaded from Firebase (or localStorage fallback).
 * - Location-based search uses Haversine distance calculation.
 * - When a coach's CoachProfile has no `region` / `introduction` the service
 *   augments it from MOCK_COACH_LOCATION_DATA so the UI is always populated
 *   during development.  Replace / remove the mock once real data is available.
 */

import { firebaseService } from './firebase';
import { storageService } from './storage';
import { CoachProfile, CoachFinderResult } from '../types';

// ─── Geolocation helper ──────────────────────────────────────────────────────

export interface GeoCoords {
  latitude: number;
  longitude: number;
}

const GEOLOCATION_TIMEOUT_MS = 10_000;
const GEOLOCATION_MAX_AGE_MS = 60_000;

/** Promisified wrapper around the browser Geolocation API. */
export function getUserGeolocation(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 브라우저는 위치 정보를 지원하지 않습니다.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS }
    );
  });
}

/** Haversine formula – returns distance in km. */
function haversineKm(from: GeoCoords, to: GeoCoords): number {
  const R = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.latitude * Math.PI) / 180) *
      Math.cos((to.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Mock location data ──────────────────────────────────────────────────────
// Used when CoachProfile has no `region` field.
// Swap these out once the real backend stores region / coords per coach.

interface MockLocationEntry {
  region: string;
  introduction: string;
  isLessonAvailable: boolean;
  coords: GeoCoords; // approximate centre of the region
}

const MOCK_COACH_LOCATION_DATA: MockLocationEntry[] = [
  {
    region: '서울 강남구',
    introduction: '10년 경력의 티칭 프로. 초보부터 싱글까지 맞춤 레슨.',
    isLessonAvailable: true,
    coords: { latitude: 37.5173, longitude: 127.0473 },
  },
  {
    region: '서울 서초구',
    introduction: '스윙 메카닉 전문가. 영상 분석 기반 과학적 레슨.',
    isLessonAvailable: true,
    coords: { latitude: 37.4837, longitude: 127.0324 },
  },
  {
    region: '경기 성남시',
    introduction: '주니어·시니어 전문 코치. 그룹·개인 레슨 가능.',
    isLessonAvailable: false,
    coords: { latitude: 37.4449, longitude: 127.1388 },
  },
  {
    region: '경기 수원시',
    introduction: '전 KLPGA 선수 출신. 실전 코스 전략 레슨 특화.',
    isLessonAvailable: true,
    coords: { latitude: 37.2636, longitude: 127.0286 },
  },
  {
    region: '부산 해운대구',
    introduction: '20년 경력 베테랑 코치. 정확한 피드백으로 빠른 실력 향상.',
    isLessonAvailable: true,
    coords: { latitude: 35.163, longitude: 129.1639 },
  },
];

/** Internal type that carries resolved mock coordinates for distance calculation. */
type CoachWithCoords = CoachFinderResult & { _mockCoords: GeoCoords };

/** Augment a CoachProfile with mock location data when real data is missing. */
function augmentWithMockLocation(
  coach: CoachProfile,
  index: number
): CoachWithCoords {
  const mock = MOCK_COACH_LOCATION_DATA[index % MOCK_COACH_LOCATION_DATA.length];
  return {
    ...coach,
    region: coach.region ?? mock.region,
    introduction: coach.introduction ?? mock.introduction,
    isLessonAvailable: coach.isLessonAvailable ?? mock.isLessonAvailable,
    _mockCoords: mock.coords,
  };
}

// ─── Service class ────────────────────────────────────────────────────────────

class CoachFinderService {
  /** Load all coaches from Firebase or localStorage. */
  private async loadCoaches(): Promise<CoachProfile[]> {
    try {
      if (firebaseService.isInitialized()) {
        return await firebaseService.getCoaches();
      }
    } catch (e) {
      console.error('CoachFinderService: Firebase load failed, falling back to storage', e);
    }
    return storageService.getCoaches();
  }

  /**
   * Search coaches by region keyword.
   * Returns all coaches whose `region` contains the search term (case-insensitive).
   * Falls back to all coaches when the term is empty.
   */
  async searchByRegion(regionTerm: string): Promise<CoachFinderResult[]> {
    const coaches = await this.loadCoaches();
    const augmented = coaches.map((c, i) => augmentWithMockLocation(c, i));

    const results = !regionTerm.trim()
      ? augmented
      : augmented.filter((c) =>
          (c.region ?? '').toLowerCase().includes(regionTerm.trim().toLowerCase())
        );

    // Return CoachFinderResult without internal coords field
    return results.map(({ _mockCoords: _omitted, ...result }) => result);
  }

  /**
   * Search coaches near the given coordinates, sorted by distance.
   * Only coaches within `maxKm` (default 50 km) are returned.
   */
  async searchNearby(origin: GeoCoords, maxKm = 50): Promise<CoachFinderResult[]> {
    const coaches = await this.loadCoaches();
    const augmented = coaches.map((c, i) => augmentWithMockLocation(c, i));

    return augmented
      .map(({ _mockCoords, ...result }) => ({
        ...result,
        distanceKm: haversineKm(origin, _mockCoords),
      }))
      .filter((c) => (c.distanceKm ?? Infinity) <= maxKm)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }
}

export const coachFinderService = new CoachFinderService();
