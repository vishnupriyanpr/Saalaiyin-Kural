# Saalai Kural (சாலையின் குரல்) — Codebase Knowledge Base

**Purpose:** a detailed technical map of the project as it stands today, so any developer or AI
agent can understand the architecture, data flows, and business logic without reading everything
from scratch.

> **Canonical source:** `/proj_details.md` at the repo root. This file mirrors it in more narrative
> form. **Obsolete descriptions** (SQLite, FastAPI monolith with SQLAlchemy routers, Firebase auth,
> an in-memory mock `db.ts`, a "disconnected frontend") describe an earlier iteration and no longer
> apply — the frontend is fully API-connected and the backend is Express + Postgres.

---

## 1. Executive summary & architecture
Saalai Kural is a gamified, AI-assisted road-defect reporting and management system for Tamil Nadu.
Five processes plus three Docker containers, all launched by `start_roadwatch.bat`:

- **Frontend (`/frontend/`)** — Next.js 14 App Router (package name `saalaikural`). Fully wired to
  the backend; no mock data layer.
- **Backend API (`/backend/server.js`)** — Node.js + Express REST API, `ws` WebSocket server, JWT
  auth, Postgres via knex, Redis for the worker queue. Port 8000 (`/health`).
- **Worker (`/backend/worker.js`)** — smart routing/assignment worker over a Redis queue.
- **ML server (`/backend/ml_server.py`)** — Python FastAPI running Ultralytics YOLOv8 inference.
  Port 5001 (`/health`). Express proxies `/api/analyze` uploads to it.
- **Chatbot (`/chatbot/`)** — n8n workflow (webhook `roadwatch-chat`) + a standalone HTML demo.
- **Infra** — Docker Compose: Postgres 16 (`roadwatch`, :5432), Redis 7 (:6380→6379), n8n (:5678).

**Branding:** renamed RoadWatch → **Saalai Kural** in the frontend + launcher banner only; backend
internals stay `roadwatch` (DB name, `@roadwatch.gov.in` logins, `roadwatch-chat` webhook,
`roadwatch-iit-m-*` containers, `start_roadwatch.bat`).

---

## 2. Backend subsystem
**Stack:** Node.js, Express, `ws`, `jsonwebtoken`, `knex` + Postgres 16, Redis, `multer`.

### 2.1 Entry & data access
- **`backend/server.js`** — the single Express entry point: REST routes, JWT `verifyToken`
  middleware, a token-authenticated WebSocket server that broadcasts live events, and helper
  mappers (`mapUser`, `mapComplaint`, `mapReward`, `mapRedemption`, `mapProject`, …) that shape DB
  rows into API responses.
- **`backend/db.js`** — knex connection. **`backend/migrations/`** define the schema;
  **`backend/seed.js`** wipes + inserts realistic demo data (users, workers, roads, complaints,
  reward_items, reward_redemptions, notifications, projects, multiplier_events).
- **`backend/worker.js`** — background smart-routing/assignment worker (Redis).

### 2.2 Data model (Postgres tables)
`users` (civilians phone+password / admins+authorities email+password; `role`, `district`,
`points`, `points_redeemed`, `level`, `streak_days`, `last_report_date`, `badges[]`), `complaints`
(photo, GPS, district, category, `status` pending→assigned→in_progress→resolved/rejected, nested
`ai_classification`, `budget_estimated` (nullable until triaged), `budget_actual`, `worker_id`,
`assigned_authority_id`, feedback), `workers` (skills, load, rating), `roads`
(sanctioned/spent budget), `projects` (bulk-repair cluster bundles), `reward_items`,
`reward_redemptions`, `notifications`, `multiplier_events`, `feedback`.

### 2.3 API routes (all under `:8000`)
- **Auth:** `POST /api/auth/citizen/{login,register}`, `POST /api/auth/admin/login`.
- **Users:** `GET /api/users[?role]`, `GET /api/users/:id`, `PATCH /api/users/:id` (accepts
  `points_total`/`points`, `points_redeemed`, `level`, `streak_days`, `last_report_date`,
  `badges`, name/district/city/pincode; self or admin only).
- **Complaints:** `GET/POST /api/complaints`, `/:id`, `/:id/timeline`, `/:id/assign`,
  `/:id/resolve`, `/:id/feedback`, `/nearby?lat&lng&radius`. `/:id/assign` and `/:id/resolve` allow
  **admin OR authority** (`isStaff(req)` helper); all other mutations are admin-only.
- **Workers / roads / projects:** CRUD — **admin-only** (roads also allow authority). Used by the
  admin portal.
- **Rewards:** `GET /api/rewards` (public), `POST`/`PATCH` (admin). **Redemptions:**
  `GET /api/redemptions` (own for civilians, all for admin), `POST` (deducts points), `PATCH`
  (admin status).
- **Notifications:** `GET`, `PATCH /:id/read`, `PATCH /read-all`. **Multipliers:** `/api/multipliers`.
- **Stats:** `GET /api/stats` (**public**, aggregate non-PII), `GET /api/dashboard/transparency` (**public**).
- **ML:** `POST /api/analyze` (proxied to FastAPI). **Chatbot:** `POST /chatbot`,
  `GET /api/chat/history`. **Real-time:** one token-authenticated WebSocket.

### 2.4 ML server (`ml_server.py`)
FastAPI + Ultralytics YOLOv8. Model resolution: `backend/best.pt` (4-class
Longitudinal/Transverse/Alligator Crack + Potholes, RDD2022; 89 MB, **not committed**,
auto-downloaded by the launcher) → fallback `backend/models/best.pt` (2-class Crack/Pothole, 6 MB,
committed). If neither exists, `/analyze` returns 503. **No mock inference.**

---

## 3. Frontend subsystem
**Stack:** Next.js 14.2.3 (App Router, all pages `"use client"`), React 18, TypeScript 5,
Tailwind 3.4. Libs: framer-motion, recharts, leaflet + react-leaflet + leaflet.heat,
@react-three/fiber/drei/rapier/three, lucide-react, jwt-decode, idb-keyval, jspdf, canvas-confetti.

### 3.1 Data + auth layer (current — no mock DB)
- **`lib/api.ts`** — thin typed fetch client; base URL from `NEXT_PUBLIC_API_URL` (no hardcoded
  localhost); `get/post/patch/upload`; throws `ApiError` carrying `status`.
- **`lib/db.ts`** — domain access layer over `api`. Attaches the JWT, routes 401s through
  `handle401` (clears token → `/login`), `unwrap()` accepts bare arrays or `{key:[...]}`. Covers
  users, complaints, workers, roads, projects, rewards, redemptions, notifications, multipliers,
  stats, transparency. **No mock fallback.**
- **`lib/useAuth.ts`** — JWT in `localStorage` (`saalaikural_token`); `useAuth`/`getDecodedUser`
  (SSR-safe, check `exp`); **`useRequireAuth(requiredRole?)`** redirects a logged-out OR wrong-role
  user to `/login` (every protected page passes its role). Display user under `saalaikural_user`
  (`StoredUser.role`: civilian|admin|authority|worker).
- **`lib/loginHelpers.ts`** — `persistSession()` (writes token + display user) and `routeForRole()`
  (post-login landing route). Used by all login screens.
- **`lib/useWebSocket.ts`** — one reconnecting WS (`?token=`) consuming `NOTIFICATION`,
  `COMPLAINT_UPDATE`, `ASSIGNMENT`, `TRANSPARENCY_UPDATE`, `ROAD_UPDATE`. `lib/useNotifications.ts`
  drives the bell. Pages without push poll every 20–30s.
- **`lib/gamification.ts`** — 5 level tiers, `POINT_EVENTS`, 6 `BADGE_DEFINITIONS`, helpers.
- **`lib/types.ts`** — shared domain types. (`lib/seedData.ts` is dead legacy mock data, unused.)

### 3.2 Pages
- **`app/page.tsx`** — marketing landing, served at `/` (the entry point; "Enter Portal" → `/login`).
- **`app/(auth)/login/`** — `/login` is a portal **chooser**; dedicated `/login/{civilian,admin,
  authority}` screens share `components/shared/AuthShell.tsx` (branding) + `lib/loginHelpers.ts`.
  Admin + authority both call `POST /api/auth/admin/login` (routed by the server-returned role);
  civilian uses `/api/auth/citizen/{login,register}`.
- **Civilian (`/civilian/*`)** — dashboard (level/streak/badges), report (3-step, AI analysis, GPS,
  **offline IndexedDB queue** `saalaikural_offline_queue` with auto-sync; awards +10 pts, advances
  streak, unlocks First-Report/7-Day-Streak badges), map (nearby + heatmap), rewards (eco-store +
  redemption ledger; icons resolved from Lucide names→emoji; dynamic category filter), work
  (volunteer apps + dispatched jobs + jsPDF "Civic Skill Passport"), budget (personal fiscal
  mobilization; null-safe), track (lifecycle stepper + feedback), chat (voice multilingual).
- **Admin (`/admin/*`)** — dashboard (KPIs + client-side cluster detection → bulk projects + charts
  + leaderboard), complaints (table + case-file drawer, verify+award/reject/assign/resolve/bulk),
  map (pins + heatmap + draw-polygon bulk zones), progress (Kanban + Gantt), work (two-pane
  allocation with AI worker scoring), rewards (redemption approve/reject + catalog CRUD + multiplier
  engine), budget (charts + CSV export).
- **Authority (`/authority/*`)** — field-officer portal: `/authority` queue (verify → in_progress;
  resolve with proof image) plus its own `/authority/{traffic,progress,work}` consoles (copies of the
  admin pages with `portal="authority"` + `role==="authority"` guard, same backend APIs). Scoped to
  field-ops; rewards/worker-roster/projects/multipliers stay admin-only (no authority Rewards page).
- **`/transparency`** — fully public open-data dashboard (`GET /api/dashboard/transparency`).

### 3.3 Key components
`shared/Navbar.tsx` (portal-aware — civilian / admin / authority link sets — GooeyNav desktop menu,
hamburger < lg, notification bell, 3D Lanyard profile card), `shared/AuthShell.tsx` (login branding), `shared/DynamicMap`→`LeafletMap` / `DynamicHeatMap`→`HeatMap` (ssr:false),
`shared/TamilNadu3DMap` + `Lanyard` (@react-three/fiber, dpr-capped for mobile),
`civilian/PointCounter` / `LevelBadge`.

### 3.4 Responsive & mobile design
Mobile-first (320px → desktop) on Tailwind's default breakpoints. `layout.tsx` exports a `viewport`
(`width=device-width, initialScale=1`, themeColor green `#0F6A3D`); `globals.css` sets
`html, body { overflow-x: hidden }`; full-height views use `100dvh`; wide tables are
`overflow-x-auto` + `min-w`; charts use recharts `ResponsiveContainer`; grids collapse to one
column; the navbar collapses to a hamburger. **Touch limitation:** admin work-allocation and Kanban
use native HTML5 drag-and-drop (mouse only) and are view-only on touch devices; all citizen-facing
flows are fully touch-usable.

### 3.5 PWA / offline
`public/sw.js` (cache `saalaikural-v1`, network-first), `public/manifest.json` (installable
"Saalai Kural"), and the report flow's IndexedDB queue for offline resilience.

---

## 4. Chatbot subsystem
- **`chatbot/n8n/workflow.json`** — the chatbot logic, imported into n8n; webhook path
  `roadwatch-chat`. Must be imported + activated at `http://localhost:5678`.
- **Product chat** (`/civilian/chat`) — voice-enabled, multilingual (ta/en/hi/te). Loads history via
  `GET /api/chat/history`, sends `POST /chatbot` (Express → n8n). Uses the Web Speech API: STT
  accumulates multi-line dictation across mic toggles; TTS selects a voice matching the chosen
  language (so Tamil/Hindi/Telugu are spoken when an OS voice is installed).
- **`chatbot/frontend/index.html`** — standalone demo hitting a personal n8n Cloud test URL
  directly (path `roadwatch-chat`); independent of the product chat.

> Note: some files under `chatbot/docs/` (architecture.md, setup-guide.md) may still reference older
> LLM providers; treat `workflow.json` as the source of truth for the chatbot.

---

## 5. Running it
`start_roadwatch.bat` (wraps `start_roadwatch.ps1`) is portable to a fresh machine: checks/installs
Node.js, Python 3, Docker Desktop (+ Windows Terminal) via winget; `npm install` (backend +
frontend); `pip install -r backend/requirements.txt`; auto-downloads `best.pt`; brings up the Docker
containers; **hard-gates infra** before launching any Node service — checks `docker compose up -d`
exit code (self-heals a wedged Docker/WSL2 engine via full `wsl --shutdown` + retry, else aborts),
waits for **Postgres AND Redis** readiness (aborts with a clear message if not ready), and checks the
`knex migrate` exit code; auto-seeds when the DB is empty; frees ports 8000/5001/3000; launches all
five services in one Windows Terminal 2×2 split (fallback: separate windows). **Each service runs
through `run_service.ps1`**, an auto-restart wrapper, so a crash self-heals within ~3s instead of
leaving a dead pane. Flags: `-Seed` (force wipe+reseed), `-Migrate` (kept for habit; migrations
always run), `-Clean` (clear `.next`). A reboot may be needed after a first-time Docker/Node install
— re-run the `.bat` after.

**Crash resilience:** `server.js` and `worker.js` register `unhandledRejection` (log, keep serving)
and `uncaughtException` (log + exit for a clean wrapper restart) handlers; `httpServer.on('error')`
exits on `EADDRINUSE` rather than running with no listener. `GET /health` probes DB + Redis and
returns `503` when degraded; `docker-compose.yml` has healthchecks on postgres + redis.

**Env vars:** frontend `NEXT_PUBLIC_API_URL`; backend `JWT_SECRET` + Postgres
(`roadwatch`/`roadwatch_user`/`roadwatch_pass`) + Redis (`localhost:6380`). `.env` is gitignored.

---

## 6. Known limitations
See **`/proj_details.md` §13** for the authoritative list. In brief: some admin budget-chart history
points are placeholder; a few admin bulk flows use demo IDs; admin drag-drop boards are desktop-only
on touch; `lib/seedData.ts` and a couple of `db.ts` helpers are dead code. (Resolved since the
earlier list: jsonb writes are now `JSON.stringify`'d everywhere — fixing the award-points/insert
500s; page role-guards are enforced via `useRequireAuth(role)`; complaint resolve/assign are gated by
`isStaff`. With auto-restart, a genuine code-level crash will restart-loop visibly rather than die —
fix the root error rather than removing the wrapper.)
