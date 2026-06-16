export interface ClubBenchmarkPoint {
  clubSpeedMps: number;
  ballSpeedMps: number;
  smashFactor: number;
  launchAngleDeg: number;
  spinRateRpm: number;
  carryDistanceM: number;
}

export interface ClubOptimizationStandard {
  clubType: string;
  label: string;
  benchmarks: ClubBenchmarkPoint[];
}

// Trackman-based reference benchmarks per club, ordered by clubSpeedMps ascending.
// Values represent optimal targets for each speed range.
export const CLUB_OPTIMIZATION_STANDARDS: ClubOptimizationStandard[] = [
  {
    clubType: 'driver',
    label: '드라이버',
    benchmarks: [
      { clubSpeedMps: 32, ballSpeedMps: 45, smashFactor: 1.40, launchAngleDeg: 14, spinRateRpm: 3200, carryDistanceM: 140 },
      { clubSpeedMps: 37, ballSpeedMps: 52, smashFactor: 1.41, launchAngleDeg: 13, spinRateRpm: 3000, carryDistanceM: 170 },
      { clubSpeedMps: 41, ballSpeedMps: 58, smashFactor: 1.42, launchAngleDeg: 13, spinRateRpm: 2800, carryDistanceM: 195 },
      { clubSpeedMps: 46, ballSpeedMps: 66, smashFactor: 1.44, launchAngleDeg: 12, spinRateRpm: 2600, carryDistanceM: 225 },
      { clubSpeedMps: 51, ballSpeedMps: 75, smashFactor: 1.47, launchAngleDeg: 11, spinRateRpm: 2400, carryDistanceM: 255 },
      { clubSpeedMps: 56, ballSpeedMps: 83, smashFactor: 1.48, launchAngleDeg: 10, spinRateRpm: 2200, carryDistanceM: 285 },
    ],
  },
  {
    clubType: '3-wood',
    label: '3번 우드',
    benchmarks: [
      { clubSpeedMps: 30, ballSpeedMps: 42, smashFactor: 1.39, launchAngleDeg: 16, spinRateRpm: 4000, carryDistanceM: 140 },
      { clubSpeedMps: 35, ballSpeedMps: 49, smashFactor: 1.40, launchAngleDeg: 15, spinRateRpm: 3800, carryDistanceM: 165 },
      { clubSpeedMps: 40, ballSpeedMps: 56, smashFactor: 1.41, launchAngleDeg: 14, spinRateRpm: 3500, carryDistanceM: 190 },
      { clubSpeedMps: 45, ballSpeedMps: 64, smashFactor: 1.42, launchAngleDeg: 13, spinRateRpm: 3200, carryDistanceM: 215 },
      { clubSpeedMps: 50, ballSpeedMps: 71, smashFactor: 1.43, launchAngleDeg: 12, spinRateRpm: 3000, carryDistanceM: 240 },
    ],
  },
  {
    clubType: '5-wood',
    label: '5번 우드',
    benchmarks: [
      { clubSpeedMps: 28, ballSpeedMps: 38, smashFactor: 1.37, launchAngleDeg: 18, spinRateRpm: 4400, carryDistanceM: 125 },
      { clubSpeedMps: 33, ballSpeedMps: 45, smashFactor: 1.37, launchAngleDeg: 17, spinRateRpm: 4200, carryDistanceM: 150 },
      { clubSpeedMps: 38, ballSpeedMps: 52, smashFactor: 1.38, launchAngleDeg: 16, spinRateRpm: 4000, carryDistanceM: 175 },
      { clubSpeedMps: 43, ballSpeedMps: 60, smashFactor: 1.39, launchAngleDeg: 15, spinRateRpm: 3800, carryDistanceM: 200 },
      { clubSpeedMps: 48, ballSpeedMps: 67, smashFactor: 1.40, launchAngleDeg: 14, spinRateRpm: 3600, carryDistanceM: 225 },
    ],
  },
  {
    clubType: 'hybrid',
    label: '하이브리드',
    benchmarks: [
      { clubSpeedMps: 28, ballSpeedMps: 38, smashFactor: 1.36, launchAngleDeg: 19, spinRateRpm: 4600, carryDistanceM: 120 },
      { clubSpeedMps: 33, ballSpeedMps: 45, smashFactor: 1.37, launchAngleDeg: 18, spinRateRpm: 4400, carryDistanceM: 145 },
      { clubSpeedMps: 38, ballSpeedMps: 52, smashFactor: 1.38, launchAngleDeg: 17, spinRateRpm: 4200, carryDistanceM: 170 },
      { clubSpeedMps: 43, ballSpeedMps: 59, smashFactor: 1.39, launchAngleDeg: 16, spinRateRpm: 4000, carryDistanceM: 195 },
      { clubSpeedMps: 48, ballSpeedMps: 67, smashFactor: 1.40, launchAngleDeg: 15, spinRateRpm: 3800, carryDistanceM: 220 },
    ],
  },
  {
    clubType: '3-iron',
    label: '3번 아이언',
    benchmarks: [
      { clubSpeedMps: 28, ballSpeedMps: 38, smashFactor: 1.36, launchAngleDeg: 20, spinRateRpm: 5200, carryDistanceM: 120 },
      { clubSpeedMps: 33, ballSpeedMps: 45, smashFactor: 1.37, launchAngleDeg: 19, spinRateRpm: 5000, carryDistanceM: 145 },
      { clubSpeedMps: 38, ballSpeedMps: 52, smashFactor: 1.38, launchAngleDeg: 18, spinRateRpm: 4800, carryDistanceM: 170 },
      { clubSpeedMps: 43, ballSpeedMps: 59, smashFactor: 1.39, launchAngleDeg: 17, spinRateRpm: 4600, carryDistanceM: 195 },
    ],
  },
  {
    clubType: '4-iron',
    label: '4번 아이언',
    benchmarks: [
      { clubSpeedMps: 26, ballSpeedMps: 35, smashFactor: 1.35, launchAngleDeg: 22, spinRateRpm: 5600, carryDistanceM: 110 },
      { clubSpeedMps: 31, ballSpeedMps: 42, smashFactor: 1.36, launchAngleDeg: 21, spinRateRpm: 5400, carryDistanceM: 135 },
      { clubSpeedMps: 36, ballSpeedMps: 49, smashFactor: 1.37, launchAngleDeg: 20, spinRateRpm: 5200, carryDistanceM: 160 },
      { clubSpeedMps: 41, ballSpeedMps: 56, smashFactor: 1.38, launchAngleDeg: 19, spinRateRpm: 5000, carryDistanceM: 185 },
    ],
  },
  {
    clubType: '5-iron',
    label: '5번 아이언',
    benchmarks: [
      { clubSpeedMps: 24, ballSpeedMps: 32, smashFactor: 1.34, launchAngleDeg: 24, spinRateRpm: 6200, carryDistanceM: 100 },
      { clubSpeedMps: 29, ballSpeedMps: 39, smashFactor: 1.35, launchAngleDeg: 23, spinRateRpm: 6000, carryDistanceM: 125 },
      { clubSpeedMps: 34, ballSpeedMps: 46, smashFactor: 1.37, launchAngleDeg: 22, spinRateRpm: 5700, carryDistanceM: 150 },
      { clubSpeedMps: 39, ballSpeedMps: 54, smashFactor: 1.38, launchAngleDeg: 21, spinRateRpm: 5400, carryDistanceM: 175 },
      { clubSpeedMps: 44, ballSpeedMps: 61, smashFactor: 1.39, launchAngleDeg: 20, spinRateRpm: 5200, carryDistanceM: 200 },
    ],
  },
  {
    clubType: '6-iron',
    label: '6번 아이언',
    benchmarks: [
      { clubSpeedMps: 22, ballSpeedMps: 29, smashFactor: 1.33, launchAngleDeg: 26, spinRateRpm: 6800, carryDistanceM: 90 },
      { clubSpeedMps: 27, ballSpeedMps: 37, smashFactor: 1.35, launchAngleDeg: 25, spinRateRpm: 6500, carryDistanceM: 115 },
      { clubSpeedMps: 32, ballSpeedMps: 44, smashFactor: 1.37, launchAngleDeg: 24, spinRateRpm: 6200, carryDistanceM: 140 },
      { clubSpeedMps: 37, ballSpeedMps: 51, smashFactor: 1.38, launchAngleDeg: 23, spinRateRpm: 6000, carryDistanceM: 165 },
      { clubSpeedMps: 42, ballSpeedMps: 59, smashFactor: 1.39, launchAngleDeg: 22, spinRateRpm: 5700, carryDistanceM: 190 },
    ],
  },
  {
    clubType: '7-iron',
    label: '7번 아이언',
    benchmarks: [
      { clubSpeedMps: 21, ballSpeedMps: 28, smashFactor: 1.32, launchAngleDeg: 28, spinRateRpm: 7200, carryDistanceM: 85 },
      { clubSpeedMps: 26, ballSpeedMps: 35, smashFactor: 1.34, launchAngleDeg: 27, spinRateRpm: 7000, carryDistanceM: 110 },
      { clubSpeedMps: 31, ballSpeedMps: 42, smashFactor: 1.36, launchAngleDeg: 26, spinRateRpm: 6700, carryDistanceM: 135 },
      { clubSpeedMps: 36, ballSpeedMps: 50, smashFactor: 1.37, launchAngleDeg: 25, spinRateRpm: 6400, carryDistanceM: 160 },
      { clubSpeedMps: 41, ballSpeedMps: 57, smashFactor: 1.38, launchAngleDeg: 24, spinRateRpm: 6200, carryDistanceM: 185 },
    ],
  },
  {
    clubType: '8-iron',
    label: '8번 아이언',
    benchmarks: [
      { clubSpeedMps: 20, ballSpeedMps: 26, smashFactor: 1.31, launchAngleDeg: 30, spinRateRpm: 7800, carryDistanceM: 80 },
      { clubSpeedMps: 25, ballSpeedMps: 33, smashFactor: 1.33, launchAngleDeg: 29, spinRateRpm: 7500, carryDistanceM: 103 },
      { clubSpeedMps: 30, ballSpeedMps: 40, smashFactor: 1.35, launchAngleDeg: 28, spinRateRpm: 7200, carryDistanceM: 126 },
      { clubSpeedMps: 35, ballSpeedMps: 47, smashFactor: 1.36, launchAngleDeg: 27, spinRateRpm: 7000, carryDistanceM: 150 },
      { clubSpeedMps: 40, ballSpeedMps: 54, smashFactor: 1.37, launchAngleDeg: 26, spinRateRpm: 6800, carryDistanceM: 175 },
    ],
  },
  {
    clubType: '9-iron',
    label: '9번 아이언',
    benchmarks: [
      { clubSpeedMps: 19, ballSpeedMps: 25, smashFactor: 1.30, launchAngleDeg: 32, spinRateRpm: 8300, carryDistanceM: 75 },
      { clubSpeedMps: 24, ballSpeedMps: 32, smashFactor: 1.32, launchAngleDeg: 31, spinRateRpm: 8000, carryDistanceM: 98 },
      { clubSpeedMps: 29, ballSpeedMps: 39, smashFactor: 1.34, launchAngleDeg: 30, spinRateRpm: 7700, carryDistanceM: 121 },
      { clubSpeedMps: 34, ballSpeedMps: 46, smashFactor: 1.35, launchAngleDeg: 29, spinRateRpm: 7400, carryDistanceM: 145 },
      { clubSpeedMps: 39, ballSpeedMps: 53, smashFactor: 1.36, launchAngleDeg: 28, spinRateRpm: 7200, carryDistanceM: 168 },
    ],
  },
  {
    clubType: 'pw',
    label: 'PW',
    benchmarks: [
      { clubSpeedMps: 18, ballSpeedMps: 24, smashFactor: 1.30, launchAngleDeg: 34, spinRateRpm: 9000, carryDistanceM: 70 },
      { clubSpeedMps: 23, ballSpeedMps: 30, smashFactor: 1.31, launchAngleDeg: 33, spinRateRpm: 8700, carryDistanceM: 90 },
      { clubSpeedMps: 28, ballSpeedMps: 37, smashFactor: 1.32, launchAngleDeg: 32, spinRateRpm: 8400, carryDistanceM: 113 },
      { clubSpeedMps: 33, ballSpeedMps: 44, smashFactor: 1.33, launchAngleDeg: 31, spinRateRpm: 8100, carryDistanceM: 136 },
      { clubSpeedMps: 38, ballSpeedMps: 51, smashFactor: 1.34, launchAngleDeg: 30, spinRateRpm: 7800, carryDistanceM: 160 },
    ],
  },
  {
    clubType: 'sw',
    label: 'SW',
    benchmarks: [
      { clubSpeedMps: 16, ballSpeedMps: 21, smashFactor: 1.29, launchAngleDeg: 37, spinRateRpm: 9800, carryDistanceM: 58 },
      { clubSpeedMps: 21, ballSpeedMps: 27, smashFactor: 1.30, launchAngleDeg: 36, spinRateRpm: 9500, carryDistanceM: 78 },
      { clubSpeedMps: 26, ballSpeedMps: 34, smashFactor: 1.31, launchAngleDeg: 35, spinRateRpm: 9200, carryDistanceM: 100 },
      { clubSpeedMps: 31, ballSpeedMps: 40, smashFactor: 1.32, launchAngleDeg: 34, spinRateRpm: 9000, carryDistanceM: 123 },
      { clubSpeedMps: 36, ballSpeedMps: 47, smashFactor: 1.33, launchAngleDeg: 33, spinRateRpm: 8700, carryDistanceM: 148 },
    ],
  },
];
