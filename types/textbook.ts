export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';
export type ChapterStatus = 'not_started' | 'in_progress' | 'passed';
export type TextbookLevel = 'beginner' | 'intermediate' | 'advanced' | 'pro';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  points: number;
}

export interface ChapterQuiz {
  id: string;
  chapterId: string;
  passingScore: number;
  questions: QuizQuestion[];
}

export interface TextbookChapter {
  id: string;
  textbookId: string;
  partNumber: number;
  chapterNumber: number;
  partTitle: string;
  title: string;
  content: string;
  keyPoints: string[];
  quiz?: ChapterQuiz;
  createdAt: number;
  updatedAt: number;
}

export interface Textbook {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  targetLevel: TextbookLevel;
  isOfficial: boolean;
  coachId?: string;
  chapters?: TextbookChapter[];
  chaptersCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface QuizAnswer {
  questionId: string;
  answer: string;
  isCorrect: boolean;
  pointsEarned: number;
}

export interface QuizAttempt {
  id: string;
  studentId: string;
  chapterId: string;
  textbookId: string;
  attemptNumber: number;
  score: number;
  passed: boolean;
  answers: QuizAnswer[];
  takenAt: number;
}

export interface ChapterProgressItem {
  status: ChapterStatus;
  bestScore: number;
  attempts: number;
  lastAttemptAt?: number;
  completedAt?: number;
  lessonRecordIds: string[];
}

export interface StudentTextbookProgress {
  id: string;
  studentId: string;
  textbookId: string;
  chapterProgress: Record<string, ChapterProgressItem>;
  overallProgress: number;
  completedAt?: number;
  assignedAt: number;
  updatedAt: number;
}

export interface ChapterLessonMedia {
  id: string;
  url: string;
  type: 'video' | 'image';
  key?: string;
}

export interface ChapterChecklistItem {
  text: string;
  checked: boolean;
}

export interface ChapterLessonRecord {
  id: string;
  chapterId: string;
  textbookId: string;
  studentId: string;
  studentName: string;
  coachId: string;
  lessonDate: string;
  textMemo: string;
  mediaFiles: ChapterLessonMedia[];
  checklist: ChapterChecklistItem[];
  linkedLessonId?: string;
  coachFeedback?: string;
  createdAt: number;
  updatedAt: number;
}
