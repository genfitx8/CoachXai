# Deployment — Render

CoachX AI ships as two services and one database, all defined in the
top-level [`render.yaml`](../render.yaml) blueprint:

| Service          | Type        | What it runs                                  |
| ---------------- | ----------- | --------------------------------------------- |
| `coachxai-api`   | Web (Node)  | Express backend in `server/`                  |
| `coachxai-web`   | Static site | Vite-built React frontend (`dist/`)           |
| `coachxai-db`    | Postgres    | Provisioned, currently unused by the code     |

A single Blueprint apply spins up all three, wires inter-service URLs
automatically, and creates the empty secret slots for you to fill.

---

## 1. One-time setup

1. **Sign in to Render** at <https://dashboard.render.com>.
2. Make sure the GitHub account that owns `genfitx8/CoachXai` is connected
   under *Account Settings → GitHub*. Authorize the repo if Render asks.
3. Top right *New* → **Blueprint** → pick the `genfitx8/CoachXai` repo →
   leave the branch as the default → *Apply*.
4. Render reads `render.yaml`, shows a preview of the three resources,
   and asks for the secret values listed below before it builds. Fill
   them in.

> The free plan is fine for staging. Upgrade `coachxai-api` to *Starter*
> ($7/mo) before you go to production: the free Node instance sleeps
> after 15 minutes of inactivity (cold start ≈ 30 s on first hit) and
> the Postgres on the free plan is wiped after 90 days of inactivity.

---

## 2. Secrets to paste in

All marked `sync: false` in `render.yaml`. Copy values from your
existing accounts — never commit them.

### `coachxai-api`

| Variable                          | Where to get it                                                       |
| --------------------------------- | --------------------------------------------------------------------- |
| `PAYAPP_SECRET_KEY`               | PayApp Console → *연동정보* → Secret Key                              |
| `PAYAPP_API_BASE`                 | Optional — leave blank for the documented default                     |
| `PAYAPP_CHECKOUT_URL`             | Optional — only set if PayApp gave you a tenant-specific checkout URL |
| `TOSS_SECRET_KEY`                 | Toss Payments Dashboard → *상점관리 → 키 관리* → Secret Key            |
| `FIREBASE_PROJECT_ID`             | Firebase Console → Project Settings → Project ID                      |
| `GOOGLE_APPLICATION_CREDENTIALS`  | Path inside the container — see "Firebase service account" below      |

#### Firebase service account

1. Firebase Console → *프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성* — download the JSON.
2. In the Render dashboard, open `coachxai-api` → *Environment* → *Secret Files* → *Add Secret File*.
3. File name: `firebase-admin.json`. Paste the JSON contents.
4. Render mounts it at `/etc/secrets/firebase-admin.json`. Set the env var
   `GOOGLE_APPLICATION_CREDENTIALS` to that path.

When `FIREBASE_PROJECT_ID` is unset the API silently falls back to writing
to `server/data/payment_orders.json` — fine for local dev but **the file
is wiped on every Render deploy**, so production must use Firestore (or
the future Postgres migration).

### `coachxai-web`

| Variable                              | Where to get it                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `VITE_FIREBASE_API_KEY`               | Firebase Console → Project Settings → *Your apps → Web app → Config*           |
| `VITE_FIREBASE_AUTH_DOMAIN`           | Same dialog                                                                    |
| `VITE_FIREBASE_PROJECT_ID`            | Same dialog                                                                    |
| `VITE_FIREBASE_STORAGE_BUCKET`        | Same dialog                                                                    |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`   | Same dialog                                                                    |
| `VITE_FIREBASE_APP_ID`                | Same dialog                                                                    |
| `VITE_KAKAO_APP_KEY`                  | Kakao Developers → 내 애플리케이션 → JavaScript 키                              |
| `GEMINI_API_KEY`                      | <https://aistudio.google.com/app/apikey>                                       |

`VITE_API_BASE_URL` is auto-wired by the blueprint to point at the
`coachxai-api` service — don't override it.

---

## 3. After the first deploy

1. Wait for both web services to flip to *Live* on the dashboard
   (≈ 2–4 minutes each).
2. Health-check the API: `curl https://coachxai-api.onrender.com/api/health`
   should respond `{ "ok": true, "ts": … }`.
3. Open the frontend URL (shown on the `coachxai-web` page) and confirm
   the AuthScreen renders.
4. PayApp / Toss / Gemini calls only work once the secrets above are
   filled — until then the routes that need them will return 4xx with a
   helpful message instead of crashing.

---

## 4. Custom domain

1. Buy or point your domain at Render's nameservers (or add a CNAME).
2. In Render → `coachxai-web` → *Settings → Custom Domains → Add*.
   Render issues a free Let's Encrypt cert once DNS verifies.
3. Add the production hostname to `APP_ALLOWED_ORIGINS` on
   `coachxai-api` (comma-separated). The blueprint defaults to the
   `coachxai-web.onrender.com` URL — keep it and append the custom one.

---

## 5. Updating

Every push to the branch tracked by Render redeploys both services
automatically. To pause auto-deploys (e.g. during a freeze) toggle the
*Auto-Deploy* switch on each service.

To rotate a secret: change it in Render's *Environment* tab and click
*Save, Rebuild and Deploy* — the new value is in effect within ~60s.

---

## 6. Local production parity

Test the exact build Render will run:

```bash
# API
cd server
npm install
npm run build      # produces server/dist/
PAYAPP_SECRET_KEY=... npm start

# In another shell, frontend
npm install
VITE_API_BASE_URL=http://localhost:4000 npm run build
npx serve dist     # or any static file server
```

If both behave like staging, the Render deploy will too.

---

## 7. Things this blueprint does **not** set up

- A persistent disk for `server/data/*.json` — use Firestore in production
  or migrate to the provisioned Postgres.
- Background workers, cron jobs, or a Redis cache — add them under
  `services:` in `render.yaml` when you need them.
- Log drains / Sentry — wire those through the `logger` utility added in
  this PR rather than in infra.
