# CoachX AI — Product Requirements Document (MVP)

## 1. Product summary
CoachX AI is a global AI assistant for coaches. The MVP focuses on helping coaches record lessons, preserve student context/history, and organize raw notes into actionable summaries.

## 2. Problem statement
Coaches often lose time and quality when lesson records are fragmented across memory, chat apps, and scattered notes. This creates weak continuity between sessions and inconsistent follow-up for students.

## 3. Product goals
- Reduce effort to capture lesson details during/after sessions
- Improve continuity by keeping student context in one timeline
- Speed up post-lesson organization with AI-assisted summaries
- Support global usage patterns from day one (language/time zone/date format readiness)

## 4. Scope
### In scope (MVP)
- Coach account onboarding basics
- Create/manage student profiles (lightweight)
- Start a lesson note linked to a student
- Structured lesson note sections (covered, feedback, progress, next actions, free notes)
- Draft autosave and resume
- AI organization into editable summary
- Student history view with previous notes and summaries

### Out of scope (MVP)
- Marketplace/discovery
- Payments/subscriptions redesign
- Scheduling platform replacement
- Video calling/live lesson delivery
- Advanced analytics dashboards
- Full CRM automation

## 5. Core user
- Primary: Active coaches, tutors, and instructors who run repeated sessions and need reliable records
- Secondary (later): Team managers/admins who need reporting across multiple coaches

## 6. User stories
1. As a coach, I want to start recording a lesson in a few taps so I can capture details without interrupting teaching.
2. As a coach, I want lesson notes attached to a specific student so I can quickly review history before the next session.
3. As a coach, I want AI to organize rough notes into a clear draft summary so I can save time on admin work.
4. As a coach, I want to edit AI output before saving so I remain responsible for final recommendations.
5. As a global user, I want language/time zone/date preferences so the product fits my local context.

## 7. Functional requirements
### FR-1 Lesson recording
- Coach can start a new lesson note from Home or Student Detail.
- Coach selects a student (or creates one quickly) before entering notes.
- Note form supports structured fields + optional free notes.

### FR-2 Draft reliability
- Notes autosave at short intervals and can be resumed.
- Draft state is clearly visible (saving/saved/error).

### FR-3 AI organization
- Coach can trigger AI organization from the lesson note.
- System returns an editable summary with key feedback and next actions.
- Save action stores both source note and reviewed summary.

### FR-4 Student context/history
- Student detail page shows chronological lesson history.
- Coach can open previous notes and summaries from student profile.

### FR-5 Global readiness (MVP level)
- Support language preference in settings.
- Support time zone and date-format aware presentation.
- Use neutral UX copy and avoid region-specific assumptions in core flows.

## 8. Non-functional requirements
- **Performance:** start lesson flow should feel immediate on typical mobile networks.
- **Availability/reliability:** draft persistence must minimize data loss risk.
- **Privacy/security:** student and lesson data treated as sensitive; access controlled and private-by-default.
- **Usability:** coach can begin note capture within 3 taps from Home.
- **Accessibility baseline:** clear contrast, touch targets, and keyboard/screen-reader-compatible structure.

## 9. Success metrics (MVP)
- Activation: % of new coaches who create first lesson note within first session
- Capture speed: median time from app open to first note entry
- Continuity: % of active coaches reviewing prior student notes before creating next note
- AI utility: % of notes where AI summary is generated and saved after review
- Retention proxy: weekly coaches with 3+ lesson notes created

## 10. Information architecture and key flows
### IA
- Home
- Students (list + detail)
- Lesson Note (active)
- AI Summary Review
- Profile/Settings

### Key flows
- Onboarding flow: sign-up → coach setup → add first student → first lesson
- Note flow: start lesson → capture notes → AI organize → review/edit → save
- Recall flow: student detail → history → prior note detail → start next lesson

## 11. Delivery roadmap framing
### Phase 0 (Now): Foundation
- Stable lesson note model
- Student-note linking
- Draft persistence

### Phase 1: MVP launch
- Core lesson capture UX
- AI summary generation + editing
- Student history timeline
- Global baseline settings (language/time zone/date format)

### Phase 2: Post-MVP optimization
- Better templates/chips for faster note-taking
- Search/filter improvements in student and note lists
- Quality improvements for AI summary consistency

### Phase 3: Expansion candidates
- Voice note capture
- Coach-client sharing workflow
- Reminders/goal tracking

## 12. Implementation notes for engineering
- Keep MVP schema simple: `Coach`, `Student`, `LessonNote`, `LessonSummary`.
- Prioritize data model stability for student-linked note history.
- Design AI output as editable draft, not authoritative final output.
- Instrument events for activation, note creation, AI summary usage, and save completion.
