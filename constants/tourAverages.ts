// Reference tour average carry+total distances by club, compiled from commonly
// published PGA Tour / LPGA Tour player distance data (TrackMan / tour stat
// roundups). These are approximate reference figures for comparison purposes,
// not official per-club statistics published by the tours themselves.

export type TourGender = 'MALE' | 'FEMALE';

const YARD_TO_METER = 0.9144;

// Average total distance in yards, keyed by the exact club name strings used
// in NewLessonForm's CLUB_GROUPS / Lesson.club.
const PGA_TOUR_AVG_YARDS: Record<string, number> = {
  'Driver': 296,
  '3 Wood': 265,
  '4 Wood': 255,
  '5 Wood': 248,
  '6 Wood': 240,
  '7 Wood': 233,
  '8 Wood': 225,
  '9 Wood': 218,
  'Hybrid 1': 245,
  'Hybrid 2': 238,
  'Hybrid 3': 230,
  'Hybrid 4': 222,
  'Hybrid 5': 214,
  'Hybrid 6': 206,
  'Hybrid 7': 198,
  '1 Iron': 235,
  '2 Iron': 225,
  '3 Iron': 215,
  '4 Iron': 205,
  '5 Iron': 195,
  '6 Iron': 185,
  '7 Iron': 172,
  '8 Iron': 160,
  '9 Iron': 148,
  'PW': 136,
  'AW': 120,
  'SW': 100,
  'LW': 80,
  '46°': 130,
  '48°': 122,
  '50°': 114,
  '52°': 106,
  '54°': 98,
  '56°': 90,
  '58°': 80,
  '60°': 70,
};

const LPGA_TOUR_AVG_YARDS: Record<string, number> = {
  'Driver': 240,
  '3 Wood': 215,
  '4 Wood': 208,
  '5 Wood': 200,
  '6 Wood': 193,
  '7 Wood': 186,
  '8 Wood': 178,
  '9 Wood': 170,
  'Hybrid 1': 195,
  'Hybrid 2': 188,
  'Hybrid 3': 180,
  'Hybrid 4': 172,
  'Hybrid 5': 165,
  'Hybrid 6': 158,
  'Hybrid 7': 150,
  '1 Iron': 185,
  '2 Iron': 178,
  '3 Iron': 170,
  '4 Iron': 162,
  '5 Iron': 154,
  '6 Iron': 145,
  '7 Iron': 135,
  '8 Iron': 125,
  '9 Iron': 113,
  'PW': 100,
  'AW': 90,
  'SW': 75,
  'LW': 60,
  '46°': 96,
  '48°': 90,
  '50°': 84,
  '52°': 78,
  '54°': 72,
  '56°': 66,
  '58°': 58,
  '60°': 50,
};

export const getTourAverageDistanceM = (club: string, gender: TourGender): number | null => {
  const table = gender === 'MALE' ? PGA_TOUR_AVG_YARDS : LPGA_TOUR_AVG_YARDS;
  const yards = table[club];
  if (yards === undefined) return null;
  return Math.round(yards * YARD_TO_METER);
};

export const getTourLabel = (gender: TourGender): string => (gender === 'MALE' ? 'PGA 투어' : 'LPGA 투어');
