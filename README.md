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

## ⚠️ Security Notice — Rotate Exposed Secrets Immediately

> **If you received this repository with real credentials already committed in `.env` or `.env.bak`, those secrets must be considered compromised.**
>
> Take the following steps immediately:
>
> 1. **Rotate/revoke the exposed Google API key** (`API_KEY`) in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
> 2. **Rotate/revoke the exposed Firebase API key** (`VITE_FIREBASE_API_KEY`) — regenerate it in the [Firebase Console](https://console.firebase.google.com/) and review your Firebase Security Rules.
> 3. **Rotate/revoke the exposed Gemini API key** (`GEMINI_API_KEY`) in [Google AI Studio](https://aistudio.google.com/app/apikey).
> 4. **Rotate any KakaoTalk app key** (`VITE_KAKAO_APP_KEY`) in the [Kakao Developers Console](https://developers.kakao.com/).
> 5. **Do not reuse the old key values.** Push the newly generated values to your deployment platform's secret store (e.g., Vercel Project Environment Variables), never back to the repository.
>
> `.env` and `.env.bak` are now removed from git tracking and covered by `.gitignore`. Run `git log --all -- .env` to confirm they no longer appear in new commits. For a full history purge, use [`git filter-repo`](https://github.com/newren/git-filter-repo) or the [BFG Repo Cleaner](https://rtyley.github.io/bfg-repo-cleaner/).

## Environment Setup

**Never commit real secrets to the repository.** All environment variables are managed via a local `.env` file that is excluded from git.

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```
2. Fill in your own values in `.env`. See `.env.example` for all available variables and their descriptions.
3. For deployments (e.g., Vercel), add the variables through the platform's environment variable UI — never hard-code them in source files.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up your environment file (see [Environment Setup](#environment-setup) above).
3. Run the app:
   ```bash
   npm run dev
   ```

**Note:** If Firebase configuration is not provided or initialization fails, the app automatically falls back to local storage mode.
