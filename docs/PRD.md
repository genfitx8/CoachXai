# CoachX AI Product Requirements Document (PRD)

## Product Overview

CoachX is a coach-centered AI assistant that helps coaches record lessons, maintain student context/history, and organize notes into actionable summaries.

## Problem Statement

Coaches often document lessons in fragmented ways (paper notes, chat logs, memory, scattered apps). This creates context loss between sessions, inconsistent follow-up, and growing administrative overhead as student volume increases.

## Vision

CoachX becomes the default operating layer for coaching continuity: every lesson is captured, structured, and connected to student history, with AI assisting organization while coaches remain in control.

## Goals

1. Reduce lesson documentation time for coaches.
2. Improve continuity by making student history easy to retrieve and use.
3. Provide reliable AI-assisted note organization after each lesson.
4. Build a global-first foundation for language and regional expansion.

## Non-Goals

1. Building a full marketplace/discovery platform in MVP.
2. Replacing coach decision-making with autonomous AI recommendations.
3. Delivering advanced analytics dashboards before core note flow is stable.
4. Supporting full CRM/payment/video-call parity in the first release.

## Target Users

- Independent coaches managing recurring student lessons.
- Coaching teams that need shared consistency in lesson records.
- Early-stage global users who need multilingual, timezone-aware workflows.

## Core Pillars

1. **Coach-centered workflow**
2. **Student context/history continuity**
3. **AI-assisted organization of lesson notes**
4. **Global-first service readiness**

## MVP Scope

- Structured lesson note capture
- Student-linked lesson history
- AI-generated lesson organization/summary draft
- Review/edit before save
- Quick retrieval through home/student flows

## Out of Scope (MVP)

- Payments and billing expansion
- Marketplace/coach discovery
- Team workspace administration suite
- Deep BI/advanced analytics layer
- Scheduling ecosystem integrations beyond current essentials

## User Stories

1. As a coach, I want to quickly record what happened in a lesson so I can stay focused on coaching.
2. As a coach, I want to review a student’s prior notes before the next lesson so I can continue from context.
3. As a coach, I want AI to organize rough notes into clear summaries so I can save time on admin work.
4. As a coach, I want to edit AI outputs before saving so final records match my judgment.
5. As a coach working across regions, I want language/timezone support so records are usable globally.

## Core Flows

1. **Start Lesson Flow**: Home → Start Lesson → Select Student → Capture Notes
2. **AI Organization Flow**: Active Note → AI Organize → Review/Edit → Save
3. **Context Retrieval Flow**: Students → Student Detail → Notes History → Note Detail
4. **Draft Recovery Flow**: Home → Draft Notes → Continue → Save

## Functional Requirements

1. Coaches can create and edit lesson notes tied to a specific student.
2. Lesson notes support structured sections (coverage, feedback, progress, next actions, free notes).
3. System stores and surfaces student-linked note history chronologically.
4. AI can generate organized summaries from draft lesson notes.
5. Coach can review and modify AI output prior to save.
6. Home provides fast access to start lesson, drafts, and recent activity.
7. Student detail provides latest summary and historical notes.
8. Profile/settings include language and timezone controls.

## Non-Functional Requirements

1. Mobile-first usability for in-session note entry.
2. Reliable auto-save and draft recovery behavior.
3. Low-latency note interactions suitable for live coaching context.
4. Secure handling of lesson/student data.
5. Internationalization-ready architecture for multilingual support.
6. Timezone-consistent display/storage for lesson timestamps.

## Success Metrics

- Weekly active coaches recording lessons
- Lesson notes created per active coach per week
- Draft-to-saved conversion rate
- Time-to-save from lesson start
- Coach satisfaction with AI-organized summaries
- 4-week coach retention and repeat usage

## Roadmap / Next Direction

1. **Near-term**: refine structured note templates and AI summary quality.
2. **Mid-term**: add richer student progression views and coach workflow automation.
3. **Expansion**: regional localization depth, collaboration features, and optional ecosystem integrations.
