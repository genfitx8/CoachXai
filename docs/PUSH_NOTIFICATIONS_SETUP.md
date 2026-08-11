# Push Notifications Setup

FCM-based push notifications between the Coach and Student native apps.
Web/PWA builds are intentionally excluded — this is Android + iOS only.

## Overview

```
[Coach App]     [Student App]              [Express server]        [FCM]
    │  register    │  register                    │                   │
    ├──────────────┼───────► POST /api/push/register-token ─────► Postgres
    │              │                              │                   │
    │  upload lesson video                        │                   │
    ├──────────────────────► POST /api/push/lesson-uploaded ────► FCM ─► [Student]
    │              │                              │                   │
    │              │  log practice                │                   │
    │              ├───────► POST /api/push/practice-logged ────► FCM ─► [Coach]
    │              │                              │                   │
    │  broadcast                                  │                   │
    ├──────────────────────► POST /api/push/broadcast ─────────► FCM ─► [All students]
    │              │                              │                   │
    │              │                cron every 1 min                  │
    │              │                reads scheduled_notifications     │
    │              │                fires reminders ────────────► FCM ─► [Coach + Student]
```

## Server env vars

Set on the Render/production server:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — the full contents of a Firebase
  service-account JSON (from Firebase Console → Project settings →
  Service accounts → Generate new private key). Paste the entire JSON as
  a single-line string.
- (alternate) `GOOGLE_APPLICATION_CREDENTIALS` — filesystem path to the
  service-account JSON. Use this for local dev.

Without either, the server still boots but push endpoints become no-ops
and `/api/push/broadcast` returns 503.

## Android setup

1. Create a Firebase project (or reuse the existing one).
2. Add an Android app with package name `com.coachxai.coach` and another
   with `com.coachxai.student`.
3. Download `google-services.json` for each and drop into:
   - `native/coach/android/app/google-services.json`
   - `native/student/android/app/google-services.json`
4. Verify `native/*/android/app/build.gradle` includes:
   ```
   apply plugin: 'com.google.gms.google-services'
   dependencies {
     implementation platform('com.google.firebase:firebase-bom:33.7.0')
     implementation 'com.google.firebase:firebase-messaging'
   }
   ```
5. Rebuild the APK — `npm run cap:sync:coach` then open in Android Studio.

## iOS setup

1. In the Apple Developer portal, enable **Push Notifications** capability
   for both app IDs (`com.coachxai.coach`, `com.coachxai.student`).
2. Create an APNs key (Certificates, Identifiers & Profiles → Keys →
   `+` → APNs). Download the `.p8` file.
3. Upload it to Firebase Console → Project settings → Cloud Messaging →
   Apple app configuration. Provide the Key ID and Team ID.
4. In Xcode (open via `npm run cap:open:coach:ios` and same for student):
   - Signing & Capabilities → `+ Capability` → **Push Notifications**
   - `+ Capability` → **Background Modes** → check *Remote notifications*
5. Rebuild.

## How it fires

| Event                        | Trigger site                            | Endpoint                          |
|------------------------------|-----------------------------------------|-----------------------------------|
| Coach uploads lesson video   | `App.tsx#handleSaveLesson` (coach path) | `POST /api/push/lesson-uploaded`  |
| Student logs practice        | `App.tsx#handleSaveLesson` (client path)| `POST /api/push/practice-logged`  |
| Reservation confirmed/moved  | `reservationService#persistReservation` | `POST /api/push/schedule-lesson-reminders` |
| Reservation cancelled        | `reservationService#persistReservation` | `POST /api/push/cancel-lesson-reminders`   |
| Coach broadcast              | Coach profile modal → 학생 전체 공지    | `POST /api/push/broadcast`        |
| Lesson-starting-soon         | `scheduledPushRunner` (cron 1/min)      | direct FCM send                   |

## Data model (Postgres)

- `device_tokens (token PK, user_id, user_role, platform, app_variant, ...)`
- `notification_preferences (user_id + user_role PK, lesson_reminder_minutes, channels JSONB, quiet_hours_*)`
- `scheduled_notifications (id, target_user_id, target_role, fire_at, type, dedup_key, payload, status, ...)`
- `broadcasts (id, coach_id, title, body, recipient_count, delivered_count, failed_count, created_at)`

## User-facing controls

- **Coach app** → Profile modal → 알림 설정 (reminder timing, channel toggles, quiet hours)
- **Coach app** → Profile modal → 학생 전체 공지 (compose + send broadcast)
- **Student app** → My Info → 알림 설정 (reminder timing, channel toggles, quiet hours)

## Notes

- Quiet hours suppress everything **except** lesson-start reminders — the
  runner exempts them so a user doesn't miss the start of a lesson.
- Reminder timing is per-user: the same reservation can fire the coach's
  reminder at −60 min and the student's at −15 min if that's their prefs.
- Rescheduling a confirmed reservation cancels prior PENDING reminders
  (via `dedup_key LIKE 'reservation:<id>%'`) before inserting fresh ones,
  so time changes stay consistent.
- Invalid device tokens (FCM `registration-token-not-registered`) are
  auto-pruned by `fcm.ts` on every send.
