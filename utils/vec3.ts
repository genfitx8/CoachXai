import type { SkeletonKeypoint } from '../types/postureAnalysis';

export type Vec3 = { x: number; y: number; z: number };

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Narrow a keypoint to a Vec3, or return undefined if it lacks 3D data. */
export function toVec3(kp: SkeletonKeypoint | undefined): Vec3 | undefined {
  if (!kp || kp.z == null) return undefined;
  return { x: kp.x, y: kp.y, z: kp.z };
}
