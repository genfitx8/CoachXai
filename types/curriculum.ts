export type PartStatus = 'not_started' | 'in_progress' | 'completed';

export type CurriculumPartKey =
  | 'physical'
  | 'swing_technique'
  | 'equipment'
  | 'course_management'
  | 'mental';

export interface CurriculumPart {
  id: string;
  curriculumId: string;
  partKey: CurriculumPartKey;
  order: number;
  title: string;
  content: string;
  keyPoints: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CurriculumPartTemplate {
  partKey: CurriculumPartKey;
  order: number;
  title: string;
  content: string;
  keyPoints: string[];
  updatedAt: number;
}

export interface Curriculum {
  id: string;
  title: string;
  description?: string;
  coachId?: string;
  parts?: CurriculumPart[];
  createdAt: number;
  updatedAt: number;
}

export interface PartProgressItem {
  status: PartStatus;
  completedAt?: number;
  lessonRecordIds: string[];
}

export interface StudentCurriculumProgress {
  id: string;
  studentId: string;
  curriculumId: string;
  partProgress: Record<string, PartProgressItem>;
  overallProgress: number;
  completedAt?: number;
  assignedAt: number;
  updatedAt: number;
}

export interface PartLessonMedia {
  id: string;
  url: string;
  type: 'video' | 'image';
  key?: string;
}

export interface PartChecklistItem {
  text: string;
  checked: boolean;
}

export interface PartLessonRecord {
  id: string;
  partId: string;
  curriculumId: string;
  studentId: string;
  studentName: string;
  coachId: string;
  lessonDate: string;
  textMemo: string;
  mediaFiles: PartLessonMedia[];
  checklist: PartChecklistItem[];
  linkedLessonId?: string;
  coachFeedback?: string;
  createdAt: number;
  updatedAt: number;
}
