// LessonDetailProps interface - ADD coachId prop
interface LessonDetailProps {
  lesson: Lesson;
  allLessons: Lesson[];
  onBack: () => void;
  onEdit?: (lesson: Lesson) => void;
  onDelete?: (lessonId: string) => void;
  role?: UserRole;
  isClientView?: boolean;
  coachId?: string;  // 🔧 ADD THIS LINE
}
