export type ImpactData = {
  face: number;
  path: number;
  attack: number;
};

export function classifyShot(data: ImpactData): ImpactData {
  return {
    face: normalize(data.face, -4, 4),
    path: normalize(data.path, -4, 4),
    attack: normalize(data.attack, -7, 7),
  };
}

function normalize(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
