<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CoachX AI

CoachX is a global-first AI coach assistant for capturing, organizing, and reviewing lesson notes with student context.

## Product Overview

CoachX AI helps coaches record lessons quickly, preserve student history, and keep coaching records structured without adding admin burden.

## Product Vision

Build the most trusted AI assistant for coaches by turning each lesson into clear, actionable, student-centered context for the next session.

## MVP Focus

- Fast lesson recording during or right after a session
- Student-linked lesson history and context continuity
- AI-assisted organization of rough notes into usable summaries

## Target User

- Primary: independent and team-based coaches who run recurring student sessions
- Early usage: coaches who need simple, reliable lesson documentation before advanced CRM features

## Core Product Pillars

1. **Coach-centered workflow**: AI supports the coach instead of replacing judgment.
2. **Student context continuity**: every new lesson builds on prior notes/history.
3. **AI-assisted note organization**: transform raw inputs into clean, reviewable records.
4. **Global-first product foundation**: localization, timezone, and flexible usage patterns from day one.

## Basic IA / Key Flows

- **Home**: start lesson, resume draft, access recent students/notes
- **Students**: search student list, open student detail, review note history
- **Lesson Flow**: select student → record structured notes → AI organize/review → save
- **Profile/Settings**: language, timezone, and personal preferences

## Global Service Considerations

- Multi-language UX and AI output readiness
- Timezone-aware session records and timestamps
- Flexible formatting for date/time and culturally diverse naming conventions
- Scalable architecture for regional rollout and local compliance

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create a `.env` file in the root directory and set the following:

   ```
   GEMINI_API_KEY=your_gemini_api_key_here

   # Firebase Configuration (Optional)
   # If not set, the app will use local storage mode
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. Run the app:
   `npm run dev`

**Note:** If Firebase configuration is not provided or initialization fails, the app automatically falls back to local storage mode.
