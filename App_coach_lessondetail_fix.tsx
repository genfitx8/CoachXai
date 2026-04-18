// App.tsx - Update LessonDetail component call in coach view (around line 1043)
// ADD coachId prop:

<LessonDetail
  lesson={selectedLesson}
  allLessons={clientLessons}
  onBack={() => setSelectedLesson(null)}
  onEdit={handleEditLesson}
  onDelete={handleDeleteLesson}
  role="COACH"
  coachId={coachProfile.id}  // 🔧 ADD THIS LINE
/>
