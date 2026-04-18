# Solution: Add Coach Edit Permissions for Lesson Records

## Problem
Currently, only clients can edit their own lesson records. Coaches cannot edit lessons they created or are assigned to.

## Current Code (Line 83 in LessonDetail.tsx)
```typescript
const canEditOrDelete = role === 'CLIENT' && lesson.createdBy === 'CLIENT';
```

## Required Changes

### 1. Update LessonDetailProps Interface
Add `coachId` as an optional prop:
```typescript
interface LessonDetailProps {
  lesson: Lesson;
  allLessons: Lesson[];
  onBack: () => void;
  onEdit?: (lesson: Lesson) => void;
  onDelete?: (lessonId: string) => void;
  role?: UserRole;
  isClientView?: boolean;
  coachId?: string;  // <-- Add this
}
```

### 2. Update canEditOrDelete Logic (Line 83)
Replace the existing line with:
```typescript
const canEditOrDelete = (
  (role === 'CLIENT' && lesson.createdBy === 'CLIENT') ||
  (role === 'COACH' && (lesson.createdBy === 'COACH' || lesson.coachId === coachId))
);
```

### 3. Update App.tsx
When rendering LessonDetail for coaches, pass the coachId prop:
```typescript
// In coach view section (around line 1043 based on PR#9 notes)
<LessonDetail
  lesson={selectedLesson}
  allLessons={clientLessons}
  onBack={() => setSelectedLesson(null)}
  onEdit={handleEditLesson}
  onDelete={handleDeleteLesson}
  role="COACH"
  coachId={coachProfile.id}  // <-- Add this
/>
```

## Explanation
The new logic allows edit/delete when:
1. User is a CLIENT who created the lesson themselves (original behavior)
2. User is a COACH AND either:
   - The coach created the lesson (`lesson.createdBy === 'COACH'`)
   - The lesson is assigned to this coach (`lesson.coachId === coachId`)

This maintains existing client permissions while adding appropriate coach permissions.
