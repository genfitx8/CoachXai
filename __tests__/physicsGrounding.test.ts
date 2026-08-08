/**
 * Tests for physicsGrounding — Trackman reference lookup + prompt block.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPhysicsReferenceBlock,
  getOptimalLaunchSpin,
  normaliseClubKey,
} from '../services/physicsGrounding';

describe('normaliseClubKey', () => {
  it('accepts canonical forms directly', () => {
    expect(normaliseClubKey('7I')).toBe('7I');
    expect(normaliseClubKey('DR')).toBe('DR');
    expect(normaliseClubKey('PW')).toBe('PW');
  });

  it('normalises Korean "드라이버" and "번 우드"', () => {
    expect(normaliseClubKey('드라이버')).toBe('DR');
    expect(normaliseClubKey('DRIVER')).toBe('DR');
    expect(normaliseClubKey('3번 우드')).toBe('3W');
  });

  it('handles various iron notations', () => {
    expect(normaliseClubKey('7 iron')).toBe('7I');
    expect(normaliseClubKey('7IRON')).toBe('7I');
    expect(normaliseClubKey('7번 아이언')).toBe('7I');
  });

  it('returns null for unknown clubs', () => {
    expect(normaliseClubKey('putter')).toBeNull();
    expect(normaliseClubKey('')).toBeNull();
    expect(normaliseClubKey('xyz')).toBeNull();
  });
});

describe('getOptimalLaunchSpin', () => {
  it('returns null for unknown clubs', () => {
    expect(getOptimalLaunchSpin('PUTTER', 100)).toBeNull();
  });

  it('returns the exact bin values when clubSpeed matches a bin', () => {
    // DR@105 is a direct hit.
    const r = getOptimalLaunchSpin('DR', 105);
    expect(r).not.toBeNull();
    expect(r!.launchDeg).toEqual([11.5, 14.0]);
    expect(r!.spinRpm).toEqual([2200, 2600]);
    expect(r!.extrapolated).toBe(false);
    expect(r!.referenceBinMph).toBe(105);
  });

  it('interpolates between two bracketing bins', () => {
    // 7I@74 mph falls between 70 and 75 bins.
    // Expected: launch ~15.6-17.6, spin ~7000-7850 (per lerp).
    const r = getOptimalLaunchSpin('7I', 74);
    expect(r).not.toBeNull();
    // Values should be pulled toward the closer 75mph bin (t=0.8).
    expect(r!.launchDeg[0]).toBeCloseTo(15.6, 1);
    expect(r!.launchDeg[1]).toBeCloseTo(17.6, 1);
    expect(r!.spinRpm[0]).toBeGreaterThanOrEqual(6900);
    expect(r!.spinRpm[0]).toBeLessThanOrEqual(7050);
    expect(r!.extrapolated).toBe(false);
  });

  it('clamps below range and flags as extrapolated', () => {
    // DR bins start at 80; 60 mph is below the range.
    const r = getOptimalLaunchSpin('DR', 60);
    expect(r).not.toBeNull();
    expect(r!.extrapolated).toBe(true);
    expect(r!.referenceBinMph).toBe(80);
  });

  it('clamps above range and flags as extrapolated', () => {
    // DR top bin 120; 130 mph is above.
    const r = getOptimalLaunchSpin('DR', 130);
    expect(r).not.toBeNull();
    expect(r!.extrapolated).toBe(true);
    expect(r!.referenceBinMph).toBe(120);
  });
});

describe('buildPhysicsReferenceBlock', () => {
  it('emits nothing when no lookup resolves', () => {
    expect(
      buildPhysicsReferenceBlock([{ club: 'PUTTER', clubSpeedMph: 100 }])
    ).toBe('');
  });

  it('renders a Trackman reference row per resolved club', () => {
    const md = buildPhysicsReferenceBlock([
      { club: 'DR', clubSpeedMph: 105 },
      { club: '7I', clubSpeedMph: 75 },
    ]);
    expect(md).toContain('Trackman / PGA 참조 최적 값');
    expect(md).toContain('드라이버');
    expect(md).toContain('7번 아이언');
    expect(md).toContain('11.5°–14°');
    expect(md).toMatch(/2200.*?2600 rpm/);
    // Instructs the AI to quote instead of invent.
    expect(md).toContain('지어내지 마세요');
  });

  it('flags extrapolated entries in the row', () => {
    const md = buildPhysicsReferenceBlock([
      { club: 'DR', clubSpeedMph: 200 },
    ]);
    expect(md).toContain('외삽');
  });
});
