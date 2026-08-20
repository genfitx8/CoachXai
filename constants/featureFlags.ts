import { readBooleanPref } from '../utils/safeStorage';

/**
 * Companion-lesson-first relaunch (2026-08) — feature gates.
 *
 * The service is refocused on the coach agent + 동반 레슨(live lesson
 * companion) loop: 브리핑(에이전트 대화) → 동반 레슨 → AI 레슨 기록 →
 * 학생 히스토리. Everything outside that loop is gated OFF here rather
 * than deleted, so the code stays healthy and any feature can be
 * re-enabled for a build (or a single device, via the localStorage
 * override below) without a revert.
 *
 * Override per device for QA / dogfooding from the devtools console:
 *
 *   localStorage.setItem('coachxai_ff_reservations', 'true'); location.reload()
 *
 * The key is `coachxai_ff_<flagName>`; any stored boolean wins over the
 * default. Clearing the key returns the flag to its default.
 */
const flag = (name: string, defaultValue: boolean): boolean =>
  readBooleanPref(`coachxai_ff_${name}`, defaultValue);

export const FEATURES = {
  /** 레슨 예약 관리 탭 + 예약 요청 알림 팝업 + 예약 기반 레슨 시작 제안. */
  reservations: flag('reservations', false),
  /** 타석 예약 (코치/학생 공용 골프연습장 예약). */
  bayReservations: flag('bayReservations', false),
  /** 정밀진단 프로그램 (6단계 퍼포먼스 진단). */
  diagnosis: flag('diagnosis', false),
  /** 교육 커리큘럼 관리. */
  curriculum: flag('curriculum', false),
  /** 자동 영상 편집 (레슨 업로드 → 임팩트 선택 파이프라인). */
  automatedVideoEditing: flag('automatedVideoEditing', false),
  /** 홈 헤더의 스탠드얼론 스윙 분석(/swing.html) 바로가기. */
  swingAnalysisShortcut: flag('swingAnalysisShortcut', false),
} as const;

export type FeatureName = keyof typeof FEATURES;
