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
> 1. **Rotate/revoke any exposed Google API key** (`API_KEY`) in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
> 2. **Rotate/revoke the exposed Firebase API key** (`VITE_FIREBASE_API_KEY`) — regenerate it in the [Firebase Console](https://console.firebase.google.com/) and review your Firebase Security Rules.
> 3. **Rotate/revoke any exposed AI/GCP credentials** used for backend runtime access (service account keys, workload identity bindings, etc.).
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

### Firebase Google auth setup

To use **Google login/signup**, set these client environment variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Optional (recommended when using additional Firebase features):

- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

Then configure Firebase Console:

1. **Authentication → Sign-in method**: enable **Google** provider.
2. **Authentication → Settings → Authorized domains**: add your production domain and local development domains (for example `localhost` and `127.0.0.1`).

If these values are missing or incomplete, Google auth fails gracefully with an actionable error message in the UI.

### Password recovery mail (SMTP)

Configure the following environment variables to enable password recovery emails from **CoachXai**:

- `SMTP_HOST`
- `SMTP_PORT` (default: `587`)
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM` (example: `CoachXai <no-reply@coachxai.local>`)

If SMTP is not configured in development, the server logs the recovery message content to the console instead.

### Google Cloud Agent Platform Runtime (backend-mediated)

CoachXai **does not deploy agents from this TypeScript repository**.  
This app only invokes an already deployed Google Cloud Agent Platform Runtime agent through the Express backend (`/api/ai/invoke`).

#### What this app is responsible for

- Frontend calls backend AI endpoints (no direct browser Gemini SDK calls)
- Backend forwards requests to your deployed Agent Runtime endpoint
- Backend uses Google Cloud auth (`google-auth-library`) and server-side env config

#### What operators must do separately (Python-first flow)

- Deploy the agent using Google Cloud Agent Platform / Agent Runtime tooling (Python SDK)
  - e.g. `google-cloud-aiplatform[agent_engines,...]`
- Ensure project + billing + IAM are configured
- Ensure a deployed agent resource exists and is callable
- Prefer Agent identity setup per docs (for example `types.IdentityType.AGENT_IDENTITY`)

#### Required server environment variables

The backend supports two runtime modes. **Option A** (Agent Platform Runtime) is preferred and is used automatically when its variables are set. **Option B** (Legacy Agent Runtime) is the fallback.

**Option A – Agent Platform Runtime (preferred)**

- `AGENT_PLATFORM_AGENT_RESOURCE`: full agent resource path, e.g.  
  `projects/<project-id>/locations/<location>/reasoningEngines/<agent-id>`
- `AGENT_PLATFORM_LOCATION` (optional, default `us-central1`): Vertex AI region
- `AGENT_PLATFORM_RUNTIME_ENDPOINT` (optional): overrides the derived endpoint URL
- `AGENT_PLATFORM_ACCESS_TOKEN` (optional): static Bearer token for local testing (instead of ADC)

**Option B – Legacy Agent Runtime (fallback)**

- `GCP_PROJECT_ID`: Google Cloud project ID
- `GCP_LOCATION`: Vertex AI / Agent Runtime region (for example `us-central1`)
- `GCP_AGENT_RESOURCE_NAME`: full deployed resource name  
  Example: `projects/<project-id>/locations/<location>/reasoningEngines/<agent-id>`
- `GCP_AGENT_PLATFORM_API_BASE_URL` (optional): defaults to `https://<location>-aiplatform.googleapis.com/v1`

#### Authentication approach

Backend calls use **Application Default Credentials (ADC)** via `google-auth-library`.
Use one of the standard Google Cloud server auth setups:

- local development: `gcloud auth application-default login` (or explicit service account key)
- cloud runtime: Workload Identity / attached service account with required Vertex AI Agent Runtime permissions

#### Local development steps

1. Copy env file: `cp .env.example .env`
2. Fill the Agent Runtime variables above
3. Run backend and frontend together: `npm run dev:all`
4. Optional health checks:
   - Backend health: `GET /api/health`
   - AI config status: `GET /api/ai/status`

If Agent Runtime is not configured/reachable, CoachXai keeps existing fallback behavior for AI-assisted features where possible.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up your environment file (see [Environment Setup](#environment-setup) above).
3. Run the app:
   ```bash
   npm run dev:all
   ```
   (`dev:all` starts both Vite frontend and Express backend for AI runtime calls.)

**Note:** If Firebase configuration is not provided or initialization fails, the app automatically falls back to local storage mode.
