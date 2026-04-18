# CoachX AI

**One-line description:** CoachX AI is a global AI assistant for coaches, focused on capturing and organizing lesson notes with student context.

## Product overview
CoachX AI helps coaches record what happened in each lesson, keep student history in one place, and turn raw notes into structured next-step summaries. The product is coach-first: AI supports the workflow, while the coach remains in control of decisions and communication.

## Product vision
Build the most trusted global coach assistant for day-to-day lesson operations by making session recording, context recall, and post-lesson organization fast and reliable.

## MVP focus
The current MVP is intentionally narrow:
- Fast lesson recording during or right after a session
- Student context/history per learner
- AI-assisted organization of lesson notes into clear summaries and next actions

## Core user
Primary user: **Coach / Instructor / Tutor / Trainer** (across domains such as sports, language, music, and academic tutoring).

## Core product pillars
1. **Capture fast** — frictionless lesson note entry and draft saving
2. **Context continuity** — student-centric history and quick recall of prior sessions
3. **AI organization** — convert unstructured notes into editable summaries
4. **Coach control** — AI drafts are reviewable; final output is coach-approved

## Basic information architecture and core flows
### IA (MVP)
- **Home**: Start lesson, resume drafts, recent students/notes
- **Students**: Student list, search, student detail timeline
- **Lesson Note Flow**: Select student → active note → AI summary review → save
- **Profile/Settings**: language, time zone, account preferences

### Core flows
1. **First use**: Sign up → set coach profile → add first student → start first lesson
2. **Record lesson**: Home “Start Lesson” → choose student → write structured notes → end lesson
3. **Organize note**: AI generates draft summary/next actions → coach edits/reviews → save
4. **Review history**: Open student profile → browse prior notes/summaries → prepare next lesson

## Global service considerations
- **Localization-ready UX**: simple English-first copy, i18n-friendly text keys, expandable layout for translation
- **Regional settings**: language, date format, and time zone support
- **Privacy by default**: lesson notes and student context treated as sensitive data
- **Reliable capture**: autosave/draft behavior to reduce note loss in variable network conditions

## Run locally
This repository includes a Vite frontend and an optional Node/Express backend.

### Prerequisites
- Node.js 20+
- npm

### 1) Install dependencies
From repository root:
```bash
npm install
```

(Optional backend dependencies):
```bash
cd server && npm install
```

### 2) Configure environment
Copy and edit environment variables:
```bash
cp .env.example .env
```

Important keys:
- `GEMINI_API_KEY` (for AI features)
- `VITE_API_BASE_URL` (frontend to backend API URL, default `http://localhost:4000`)
- Firebase variables are optional (local mode works without Firebase)

### 3) Start development
From repository root:
```bash
npm run dev
```

Optional combined frontend + backend run:
```bash
npm run dev:all
```

### 4) Validate build and tests
```bash
npm run build
npm test
```

> Note: In this environment, baseline tests currently include a pre-existing failing KakaoShare test set unrelated to this documentation rebrand.
