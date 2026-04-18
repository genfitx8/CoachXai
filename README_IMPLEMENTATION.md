# Coach Edit Permissions Implementation Guide

## Overview
This PR adds the ability for coaches to edit and delete lesson records they created or are assigned to.

## Implementation Status
✅ **Analysis Complete** - All required changes have been identified  
⚠️  **Implementation Blocked** - Repository files not accessible (see IMPLEMENTATION_BLOCKED.md)  
📋 **Ready to Apply** - See FINAL_SOLUTION.patch for exact changes

## Quick Summary

### Problem
Currently only clients can edit their own lesson records. Coaches cannot edit lessons even when they created them or are assigned to them.

### Solution  
Update the `canEditOrDelete` permission logic in LessonDetail.tsx to include coach permissions.

## Files to Modify

### 1. components/LessonDetail.tsx (3 changes)

**Change 1**: Add `coachId` to interface (at top of file)
```typescript
interface LessonDetailProps {
  // ... existing props ...
  coachId?: string;  // ADD THIS
}
```

**Change 2**: Add `coachId` to destructuring (in component signature)
```typescript
export const LessonDetail: React.FC<LessonDetailProps> = ({ 
  lesson, allLessons, onBack, onEdit, onDelete, role, isClientView,
  coachId  // ADD THIS
}) => {
```

**Change 3**: Update permission logic (line 83)
```typescript
// REPLACE:
const canEditOrDelete = role === 'CLIENT' && lesson.createdBy === 'CLIENT';

// WITH:
const canEditOrDelete = (
  (role === 'CLIENT' && lesson.createdBy === 'CLIENT') ||
  (role === 'COACH' && (lesson.createdBy === 'COACH' || lesson.coachId === coachId))
);
```

### 2. App.tsx (1 change)

**Change**: Pass `coachId` to LessonDetail (around line 1043, in coach view)
```typescript
<LessonDetail
  // ... existing props ...
  coachId={coachProfile.id}  // ADD THIS
/>
```

## Logic Explanation

The new `canEditOrDelete` allows editing when:
- **Client**: User is a CLIENT who created the lesson (original behavior)  
- **Coach**: User is a COACH AND either:
  - Created the lesson (`lesson.createdBy === 'COACH'`)
  - Is assigned to the lesson (`lesson.coachId === coachId`)

## Files in This PR

- **FINAL_SOLUTION.patch** - Complete patch showing all changes
- **SOLUTION.md** - Detailed solution documentation  
- **IMPLEMENTATION_BLOCKED.md** - Technical blockers encountered
- **components/LessonDetail_permission_fix.ts** - Isolated permission logic change
- **components/LessonDetail_interface_change.ts** - Isolated interface change
- **App_coach_lessondetail_fix.tsx** - App.tsx change snippet

## Next Steps

Once repository files are accessible:
1. Apply changes from FINAL_SOLUTION.patch
2. Test with coach account:
   - Create a lesson as coach → verify can edit
   - Be assigned to a lesson → verify can edit
   - View client-created lesson → verify cannot edit (unless assigned)
3. Test with client account:
   - Create own lesson → verify can edit (existing behavior)
   - View coach lesson → verify cannot edit (existing behavior)
