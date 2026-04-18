// Line 83 in LessonDetail.tsx
// OLD CODE (only allows clients to edit their own records):
// const canEditOrDelete = role === 'CLIENT' && lesson.createdBy === 'CLIENT';

// NEW CODE (allows coaches to edit lessons they created or are assigned to):
const canEditOrDelete = (
  (role === 'CLIENT' && lesson.createdBy === 'CLIENT') ||
  (role === 'COACH' && (lesson.createdBy === 'COACH' || lesson.coachId === coachId))
);
