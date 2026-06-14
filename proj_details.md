# Saalai Kural — Project Details

> **சாலையின் குரல் ("Voice of the Road")** — an AI-assisted civic platform for reporting,
> triaging, allocating, and tracking road-damage repair across Tamil Nadu.
>
> This document is the **single source of truth** for the architecture. The older
> files under `documentation/` (`project_knowledge_base.md`, `Project_Context_Summary.md`)
> and any "SQLite / FastAPI-monolith / Firebase / 3-window" descriptions are **superseded**
> by this file.

---

## 1. What it is

Saalai Kural is a full-stack civic-tech application with two faces:

- **Citizens** photograph road damage; an on-device-grade YOLOv8 model classifies the defect,
  scores its severity/priority, GPS-tags it, and files it (offline-capable). Citizens earn
  gamified points, levels, and badges, redeem eco-rewards, track repair progress, and chat
  with a language-aware assistant (auto-detects English/Tamil and replies in kind).
- **PWD / authorities** triage incoming reports, auto-detect spatial clusters, bundle them into
  discounted bulk-repair projects, allocate workers, run a Kanban/Gantt progress board, manage
  budgets, approve rewards, run a **reinforcement-learning traffic-signal control** console, and publish a fully
  public transparency dashboard.

It is a **student/hackathon-grade project** (IIT-M context). It is fully functional end-to-end
but carries some demo-grade shortcuts documented in §13.

---

## 2. Branding note (important)

The project was renamed **RoadWatch → Saalai Kural** in the **frontend + launcher banner ONLY**.
The **backend internals deliberately stay `roadwatch`** to avoid breakage:

| Surface | Value |
|---|---|
| Frontend UI / storage / manifest / PDF & CSV filenames | **Saalai Kural** / சாலையின் குரல் |
| `localStorage` keys | `saalaikural_token`, `saalaikural_user` |
| IndexedDB | `saalaikural_offline_queue`, `saalaikural_apps_<uid>` |
| Postgres DB name / user | `roadwatch` / `roadwatch_user` |
| Admin/authority login domain | `@roadwatch.gov.in` |
| n8n webhook path | `roadwatch-chat` |
| Docker container names | `roadwatch-iit-m-*` |
| Launcher | `start_roadwatch.bat` |

There are **no stray `roadguard_` / old-key references** in the frontend (verified by audit).

---

## 3. Architecture

Five processes plus three containers, all started by one launcher:

```
                       ┌──────────────────────────────────────────────┐
  Browser ──HTTP/WS──▶ │  Next.js 15 frontend        :3000            │
                       │  (App Router, "Saalai Kural")                 │
                       └───────────────┬──────────────────────────────┘
                                       │  REST + single auth'd WebSocket
                                       ▼
                       ┌──────────────────────────────────────────────┐
                       │  Express API + ws server    :8000  (/health)  │
                       │  server.js  — REST, JWT auth, WS broadcast     │
                       └───┬───────────────┬───────────────┬───────────┘
                           │               │               │
            proxy /analyze │        Redis  │ queue   Postgres (knex)
                           ▼               ▼               ▼
              ┌────────────────────┐  ┌─────────┐   ┌──────────────┐
              │ FastAPI ML server  │  │ worker  │   │ Postgres 16  │
              │ ml_server.py :5001 │  │worker.js│   │   :5432      │
              │ YOLOv8 inference   │  │smart    │   └──────────────┘
              └────────────────────┘  │routing  │
                                       └────┬────┘
                                            │
   n8n :5678  ◀── /chatbot proxy ───────────┘     Redis :6380 (host) → 6379 (container)
   (chatbot workflow, webhook `roadwatch-chat`)
```

| Service | Command | Port | Health |
|---|---|---|---|
| Frontend (Next.js) | `npm run dev` (in `frontend/`) | 3000 | — |
| Express API + WebSocket | `node server.js` (in `backend/`) | 8000 | `/health` |
| Smart-routing worker | `node worker.js` (in `backend/`) | — | — |
| ML server (FastAPI) | `python ml_server.py` (in `backend/`) | 5001 | `/health` |
| n8n (chatbot) | docker | 5678 | — |
| Postgres 16 | docker | 5432 | `pg_isready` |
| Redis 7 | docker | 6380 → 6379 | — |

---

## 4. Tech stack

**Frontend** — Next.js 15.5 (App Router, Turbopack dev, all pages `"use client"`), React 19, TypeScript 5,
Tailwind 3.4 (`darkMode:"class"`, app force-locks light). Package name `saalaikural`.
Key libs: `framer-motion` 12, `recharts` 2.12, `leaflet` + `react-leaflet` + `leaflet.heat`,
`@react-three/fiber`/`drei`/`rapier`/`three` (3D TN map + draggable lanyard ID card),
`lucide-react`, `jwt-decode`, `idb-keyval` (offline queue), `jspdf` (Skill Passport PDF),
`canvas-confetti`. `next.config.mjs` serves the marketing landing at `/` (no forced redirect — visitors proceed to `/login` via the "Enter Portal" CTA).
Palette: `primary` green `#0F6A3D`, `secondary` gold `#E29A13`. **All fonts are self-hosted via
`next/font`** (no render-blocking Google `@import`): the app shell uses Outfit / Inter / Noto Sans
Tamil / JetBrains Mono (exposed as CSS variables consumed by `tailwind.config.ts`), and the
marketing landing uses a four-role designer stack: **Fraunces** (engraved display serif, English
heads) + **Anek Tamil** (modern variable Tamil — the protagonist: hero wordmark + bilingual
glosses) + **Hanken Grotesk** (humanist grotesque body/UI) + **Big Shoulders Display** (tall
condensed gothic, used exclusively as the numeral "awe engine").

The landing (`app/page.tsx`) is a **light "Civic Gazette"** editorial page: warm paper with a kolam
(pulli) dot-grid, gopuram-terracotta + India-green accents, the India tricolour motif, bilingual
Roman-numeral section marks, a Big-Shoulders **live-figure marquee**, a full-size Tamil hero
moment, a drop cap, paper grain, a **floating pill navbar** (glass-blurred, follows on scroll), and
a dark closing "leading-article" plate — squared (not pill) ink+gold buttons throughout. The four mission numbers
are the **Transparency Register** ("Statement of Public Accounts"): one colossal headline figure
with a kolam-ring seal that draws closed on the count-up beat, above three dot-leader line-items.
Both "list" patterns are real components — the **Platform** is a connected "civic-loop" spine of
Big-Shoulders station-numerals, and the **Portal** cards use numbered feature rows, not bullets.
Smooth scrolling is provided by **Lenis** (`lib/useLenis.ts`), driven by framer-motion's single
`frame` loop and scoped to the landing route only (it never affects the app's internal scroll
areas). Performance:
framer-motion runs under `LazyMotion`/`domAnimation` + `MotionConfig reducedMotion="user"`; images
use `next/image`; count-ups write to the DOM (no per-frame re-render); and the 3D **gold** Tamil
Nadu map is code-split, **lazy-mounted only when scrolled into view, and freezes its render loop
off-screen**. All motion respects `prefers-reduced-motion`; focus-visible rings are global (WCAG
2.4.7). Slogan: "Government and citizens, on the same road."

**Backend** — Node.js + Express (`server.js`), `ws` WebSocket server, JWT (`jsonwebtoken`),
`knex` query builder + migrations against Postgres 16, Redis for the worker queue,
`multer` for image uploads. A separate `worker.js` does smart routing/assignment.

**ML** — Python FastAPI (`ml_server.py`) running **Ultralytics YOLOv8** inference. The Express
API proxies `/api/analyze` uploads to it. See §10.

**Infra** — Docker Compose (Postgres, Redis, n8n). Chatbot logic lives in an n8n workflow
(`chatbot/n8n/workflow.json`, webhook path `roadwatch-chat`).

### Responsive & mobile design
The UI is mobile-first and works from phones (320–430px) to desktop, using Tailwind's default
breakpoints (`sm` 640 / `md` 768 / `lg` 1024). Key measures:
- `app/layout.tsx` exports a `viewport` (`width=device-width, initialScale=1`) so phones render
  the real layout instead of a zoomed-out desktop; `themeColor` (green `#0F6A3D`) lives here too.
- `globals.css` sets `html, body { overflow-x: hidden }` to neutralise decorative off-screen
  blobs/orbs that would otherwise cause horizontal scroll on any route.
- Full-height views (civilian map & chat, admin map) use `100dvh` (dynamic viewport height) so
  mobile browser chrome doesn't hide the bottom input/controls.
- Wide tables (admin complaints/budget/rewards, transparency) sit in `overflow-x-auto` wrappers
  with a `min-w`; all charts use recharts `ResponsiveContainer`; multi-column grids collapse to a
  single column on small screens.
- The Navbar collapses to a hamburger menu below `xl` (the full nav carries up to 8 admin links);
  the 3D Tamil Nadu map caps its pixel ratio (`dpr`) for mobile GPUs.

**Touch limitation:** the admin **work allocation** and **Kanban** boards use native HTML5
drag-and-drop, which does not fire on touch screens — those two boards are view-only on phones and
need a desktop (or a future tap-to-assign fallback). All citizen-facing flows are fully
touch-usable.

---

## 5. Repository layout

```
.
├── start_roadwatch.bat / .ps1   one-click launcher (toolchain install + all services)
├── docker-compose.yml           Postgres / Redis / n8n
├── proj_details.md              ← this file (source of truth)
├── README.md                    project front page
├── backend/
│   ├── server.js                Express REST + WebSocket + JWT auth
│   ├── worker.js                smart-routing/assignment worker (Redis)
│   ├── ml_server.py             FastAPI YOLOv8 inference (:5001)
│   ├── requirements.txt         Python ML deps (ultralytics, torch, fastapi …)
│   ├── db.js                    knex connection
│   ├── migrations/ seed.js      schema + realistic seed data
│   ├── best.pt                  4-class trained model (89 MB, NOT in git — auto-downloaded)
│   ├── models/best.pt           2-class fallback model (6 MB, committed)
│   └── .env                     backend config (git-ignored, auto-generated by the launcher)
├── frontend/
│   ├── app/                     page.tsx (landing), layout.tsx (next/font), (auth)/login, civilian/*, admin/*, authority, transparency
│   ├── components/shared/       Navbar, maps, gamification, 3D (TamilNadu3DMap), decorative
│   ├── lib/                     api.ts, db.ts, useAuth.ts, useWebSocket.ts, useLenis.ts, types.ts, gamification.ts, trafficModel.ts, trafficData.ts
│   ├── public/                  manifest.json, sw.js (PWA), tn-hero.png, tn-logo.png
│   └── .env.local              frontend config (git-ignored, auto-generated by the launcher)
├── chatbot/                     standalone n8n chatbot demo + workflow.json + docs
└── documentation/              legacy docs (superseded by this file)
```

---

## 6. Data model (Postgres via knex)

Core entities (see `backend/migrations/` and `lib/types.ts`):

- **users** — civilians (phone+password) and admins/authorities (email+password). Fields incl.
  `role` (`civilian` / `admin` / `authority`), `district`, `points`, `level`, plus admin sub-role.
- **complaints** — photo URL, GPS lat/lng, `district`, `category`, `status`
  (`pending → assigned → in_progress → resolved` / `rejected`), nested `ai_classification`
  (detections, severity, priority score), `worker_id`, `assigned_authority_id`, feedback.
- **workers** — skills, current load, rating (used by the allocation scorer).
- **roads** — road registry with sanctioned/spent budget (drives the transparency dashboard).
- **projects** — bulk-repair projects (cluster bundles) with worker assignment + status/timeline.
- **rewards / redemptions** — eco-store catalog and the redemption ledger.
- **notifications** — per-user, pushed live over WebSocket.
- **multipliers** — points-multiplier events (district/scale/date window).

---

## 7. API surface (Express, all under `:8000`)

All confirmed present in `backend/server.js`:

- **Auth** — `POST /api/auth/citizen/{login,register}`, `POST /api/auth/admin/login`
- **Users** — `GET /api/users[?role]`, `GET /api/users/:id`
- **Complaints** — `GET/POST /api/complaints`, `/:id`, `/:id/timeline`, `/:id/assign`,
  `/:id/resolve`, `/:id/feedback`, `/nearby?lat&lng&radius`
- **Workers / roads / projects** — CRUD as used by admin portal
- **Rewards** — catalog CRUD + `/api/redemptions`
- **Notifications** — `GET /api/notifications`, `PATCH /:id/read`, `PATCH /read-all`
- **Multipliers** — `/api/multipliers`
- **Stats** — `GET /api/stats` (**public** — aggregate, non-PII; used by the landing + admin dashboard), `GET /api/dashboard/transparency` (**public**)
- **ML** — `POST /api/analyze` (proxies to the FastAPI ML server)
- **Chatbot** — `POST /chatbot` (auto-detects + forwards reply `language`), `GET /api/chat/history`, `GET /api/chat/sessions`, `DELETE /api/chat/session`
- **Real-time** — single token-authenticated WebSocket on the same host

Frontend data access goes through `lib/api.ts` (thin fetch client, base URL from
`NEXT_PUBLIC_API_URL`, no hardcoded localhost) and `lib/db.ts` (domain layer; attaches token,
routes 401s through `handle401` → clears token, redirects to `/login`; `unwrap()` accepts both
bare arrays and `{key:[...]}` wrapped responses). **No mock fallback by design** — "a real error
is better than fake success."

---

## 8. Auth & roles

JWT in `localStorage` (`saalaikural_token`), decoded client-side via `jwt-decode` in
`lib/useAuth.ts` (`useAuth` / `useRequireAuth` / `getDecodedUser`, all SSR-safe, check `exp`).
Backend signs JWTs with `process.env.JWT_SECRET`.

Role routing on login: `admin` → `/admin/dashboard`, `authority` → `/authority`,
else `/civilian/dashboard`. Already-signed-in users auto-bounce off `/login`. The `/login` page
(civilian + admin tabs, with inline civilian sign-up) has a **"Home" back button** (top-left) that
returns to the marketing landing.

**Seed logins** (from `seed.js`):

| Role | Credentials |
|---|---|
| Admin | `admin@roadwatch.gov.in` / `RoadWatch@2026` |
| Authority | `authority.nh@roadwatch.gov.in` / `Authority@2026` (also `.sh`, `.mdr`) |
| Civilian | password `Citizen@2026` (phone numbers in `seed.js`) |

---

## 9. Real-time (WebSocket)

`lib/useWebSocket.ts` opens one WS to `NEXT_PUBLIC_API_URL` (http→ws / https→wss) with
`?token=<jwt>`. SSR-safe, no-ops without a token, exponential-backoff reconnect (3s→15s),
handler held in a ref so re-renders don't tear down the socket. Message types consumed:
`NOTIFICATION`, `COMPLAINT_UPDATE`, `ASSIGNMENT`, `TRANSPARENCY_UPDATE`, `ROAD_UPDATE`.
Pages without push (budget, admin dashboard/budget, transparency) add 20–30s polling fallback.
The Navbar bell is driven by `lib/useNotifications.ts`.

---

## 10. ML pipeline (YOLOv8)

`backend/ml_server.py` (FastAPI) runs **Ultralytics YOLOv8** inference on uploaded images and
returns detections, severity, and a priority score. Model resolution order:

1. `backend/best.pt` — **4-class** trained model: *Longitudinal Crack, Transverse Crack,
   Alligator Crack, Potholes* (RDD2022 Japan+India). **89 MB, not committed to git.**
2. `backend/models/best.pt` — **2-class** fallback (*Crack, Pothole*). **6 MB, committed.**
3. If neither exists, the server starts but `/analyze` returns 503.

`backend/best.pt` is byte-for-byte identical to the open-source
[`oracl4/RoadDamageDetection`](https://github.com/oracl4/RoadDamageDetection)
`YOLOv8_Small_RDD.pt` (89,569,358 bytes). **The launcher auto-downloads it** if missing, so a
fresh clone gets the full 4-class model; if the download fails it falls back to the committed
2-class model and the app still works.

---

## 11. Chatbot

The product chat (`/civilian/chat`) is voice-enabled and **language-aware**. The bot replies in the
language the user wrote in: Express `/chatbot` auto-detects the message script (Tamil vs English, via
Unicode ranges) and forwards a `language` field to n8n, whose `Build Prompt` node injects a "reply
only in this language" instruction (with its own auto-detect fallback). This removed the old
"always answers in Tamil" behaviour — no UI toggle needed for the reply language. The chat page's
language selector now only drives the voice mic (STT) + read-aloud (TTS); read-aloud also re-detects
the reply's own script so a Tamil answer is spoken by a Tamil voice. STT accumulates multi-line
dictation across mic toggles.

**Conversation management:** each chat is a `session_id`. New chat (fresh `user-<id>-<ts>` session),
Clear chat (`DELETE /api/chat/session`), and Previous chats (`GET /api/chat/sessions`, titled by the
first user message) are exposed in the chat header; the active session id is remembered in
`localStorage`. History loads via `GET /api/chat/history`; recent turns are cached in Redis
(`chat:<session_id>`) with Postgres (`chat_messages`) as the source of truth.

The n8n workflow must be **imported and activated** at `http://localhost:5678` — and **re-imported
after updates**, since the bilingual fix lives in the workflow's prompt node.

`chatbot/frontend/index.html` is a **standalone demo** that hits a personal n8n Cloud test URL
directly (path `roadwatch-chat`); it is independent of the product chat.

---

## 12. Feature map

**Civilian** — dashboard (level/streak/badges), report (3-step stepper, AI analysis, GPS + map
picker, offline IndexedDB queue with auto-sync), map (nearby + heatmap), rewards (eco-store +
redemption ledger + eco-impact ticker), work (volunteer applications + dispatched jobs + jsPDF
"Civic Skill Passport"), budget (personal fiscal mobilization), track (lifecycle stepper +
star/comment feedback), chat (voice + auto language-detect English/Tamil, new/clear/history).

**Admin** — dashboard (KPIs + client-side cluster detection → bulk-project CTA + charts +
leaderboard + a dedicated **Traffic Management Engine** card), complaints (searchable table — each
row shows the uploaded defect photo, or an **OpenStreetMap map-tile thumbnail** derived from the
record's lat/lng when the photo is missing **or fails to load** (seeded/mock records point at
`/uploads/sample_*.jpg` which aren't on disk, so they now get a map thumbnail instead of a broken
image) — case-file drawer with
AI triage / mini-map / duplicate-within-100m warning, verify+award / reject / assign / resolve /
bulk ops), map
(pins + heatmap + draw-polygon bulk repair zone), progress (Kanban drag-drop + Gantt), work
(two-pane drag-drop allocation with AI worker scoring), rewards (redemption approve/reject +
catalog CRUD + points-multiplier engine), budget (area/line charts + savings banner + CSV export),
**traffic** (see below).

**Traffic Management** (`/admin/traffic`) — a real-time signal-control console headlined by an
**actual machine-learning model: tabular Q-learning (reinforcement learning)** in
`lib/trafficModel.ts` (`QAgent`). The agent observes a discretised junction state
(`phase | cur-queue-bucket | other-queue-bucket | green-elapsed-bucket`), chooses keep-vs-switch
ε-greedily (with safety min-green / fairness max-green action masking), and updates
`Q(s,a) ← Q(s,a) + α[r + γ·maxₐ′Q(s′,a′) − Q(s,a)]` from a reward of *(vehicles cleared) − 0.4·(vehicles
waiting)*. It starts naïve and learns online — exploration ε decays as it gains confidence; the page
shows live learning stats (states discovered, Q-updates, exploration %, policy-confidence bar). The
learned Q-table persists across scenario resets. **Three controllers run on the SAME arrivals** —
RL, the max-pressure heuristic, and a dumb fixed-time signal — for a live three-way comparison (avg
wait, cleared, peak queue), so you can watch RL learn to beat fixed-time. The canvas now renders
**proper top-down cars** (body, glass cabin, head/tail-lights, shadows) on a detailed road (lane
markings, stop lines, zebra crossings, 3-lamp signal heads) instead of plain dots. Controls:
junction, demand (normal / peak / extreme), controller shown (RL / max-pressure / fixed), run/pause,
speed, reset. The engine is **CCTV-ready**: feeding live per-approach counts into
`TrafficSim.tick()` replaces the dataset sampler with no model changes. (Frontend-only; no
backend/Docker dependency — one rAF loop drives all three sims, throttles React updates, reads live
params via refs.) Linked from the Admin dashboard via a dedicated "Traffic Management Engine" card
and the navbar "Traffic" item.

**Authority** (`/authority`) — own auth gate, complaints assigned to the officer, verify
(→ in_progress) and resolve (multipart notes + proof image).

**Transparency** (`/transparency`) — fully public open-data dashboard from
`GET /api/dashboard/transparency`: roads, resolution rate, avg resolution days, sanctioned/spent
budget, per-road budget bars, status donut, top-5 hotspot roads, full roads/contractor table.

**PWA / offline** — `public/sw.js` (cache `saalaikural-v1`, network-first), `manifest.json`
(installable "Saalai Kural"), and the report flow's IndexedDB queue (real offline resilience).

---

## 13. Known limitations / future hardening

These were surfaced by a full-codebase audit. None break the running app; they are demo-grade
shortcuts or hardening opportunities, listed so they aren't mistaken for finished behavior.

**Data fidelity**
- `app/admin/budget/page.tsx` — the Jan–Apr points of the budget area/line charts are
  **hardcoded placeholder history**; only the latest ("May") point is real. The backend has no
  monthly budget history to derive these from.
- Bulk-project flows in `app/admin/dashboard/page.tsx` and `app/admin/map/page.tsx` hardcode
  demo values (`worker_ids:["wrk-111"]`, `district:"Coimbatore"`, a fixed project title)
  regardless of the actual cluster; `app/admin/complaints/page.tsx handleBulkAssign` uses a raw
  `prompt()` for the worker ID. Against real data these can mislabel/mis-assign.
- `app/civilian/report/page.tsx` fills a few fields with fallbacks (e.g. `depth_est:"8cm"`,
  `reference_object:"Car tyre shadow"`, `district || "Coimbatore"`) when AI returns nothing.
- `app/civilian/rewards/page.tsx` adds small fixed baselines to eco-impact counters (cosmetic).

**Security / privacy (non-breaking, hardening)**
- Some mutation routes rely on a valid token but do not enforce fine-grained role checks; a
  defense-in-depth pass on admin-only mutations is advisable before any real deployment.
- Seed/admin credentials are committed for demo convenience — rotate and move to env for prod.

**Dead / latent code**
- `lib/db.ts markNotificationRead` targets the wrong path (`/:id` vs `/:id/read`) but is unused
  (the live bell uses the correct `/read`). `lib/db.ts safeGet`'s `requireAuth` ternary is a
  no-op. `lib/seedData.ts` is the old mock dataset, imported nowhere (safe to delete).

**UX / cosmetic**
- `/transparency` and `/authority` have no Navbar/landing entry point (direct-URL only).
- Auth guards are inconsistent: `admin/progress|work|rewards` bounce any non-`admin` role
  (so a valid `authority` is redirected), while other admin pages don't apply that gate.
- Admin work-allocation and Kanban boards use native HTML5 drag-and-drop (mouse only); they are
  view-only on touch devices (see §4 "Responsive & mobile design").

**Runtime dependency (not a bug)**
- Live figures depend on the database being up. When Docker (Postgres/Redis) is not running, the
  public `/api/stats` returns an error and the landing's Transparency Register shows `—` (handled
  gracefully — no crash; the backend also logs reconnect attempts). Start Docker Desktop and re-run
  `start_roadwatch.bat` to populate live data. This is an environment state, not a code defect — the
  launcher now auto-starts Docker and waits for the engine to avoid it. The **Traffic Management**
  page is frontend-only and works regardless of Docker.

---

## 14. Running it

```bat
start_roadwatch.bat            :: start everything (installs deps + sets up DB on first run)
start_roadwatch.bat -Seed      :: force a full wipe + reseed of the database
start_roadwatch.bat -Migrate   :: (kept for habit; migrations now always run anyway)
start_roadwatch.bat -Clean     :: also clear the Next.js .next dev cache
```

The launcher (`start_roadwatch.ps1`) is **portable to a fresh machine** — a plain
`start_roadwatch.bat` is enough on first run. In order it: checks for and installs **Node.js,
Python 3, Docker Desktop** (and optional Windows Terminal) via `winget`; **generates `backend/.env`
(with cryptographically-random `JWT_SECRET` + `INGEST_TOKEN` — 256-bit CSPRNG) and
`frontend/.env.local` if they don't exist** (these are git-ignored, so they never travel with the
repo); **starts Docker Desktop and waits for its engine if the daemon is down** (checks per-user +
machine install paths, up to 180s), then `docker compose up -d` (Postgres/Redis/n8n) and waits for
Postgres; runs `npm install` for backend + frontend and
`pip install -r backend/requirements.txt`; **auto-downloads `best.pt`** if missing; **applies knex
migrations (idempotent) and auto-seeds the demo data when the database is empty**; frees ports
8000/5001/3000; and launches all five services in a single Windows Terminal 2×2 split (Backend /
Worker / Frontend / ML API / Docker logs), falling back to separate windows if `wt.exe` is absent.

A reboot may be required after a first-time Docker/Node install (winget puts them on PATH but the
current shell won't see it until reopened). Re-run the `.bat` afterward.

### Migrating to a new device
Copy/clone the folder → double-click `start_roadwatch.bat` → if it installed Docker/Node for the
first time, reboot once and run it again → open http://localhost:3000. Everything (tools, env
files, deps, DB schema, demo data, ML model) is handled automatically. The launcher is
**self-sufficient and folder-independent**: `docker-compose.yml` pins the project name
(`name: roadwatch-iit-m`) and the launcher resolves the DB via `docker compose exec` (not a
hardcoded container name), so it sets up correctly **no matter which directory the repo is cloned
into**. The only optional manual step is activating the n8n chatbot workflow (§11). See the README
for the step-by-step migration guide and a full **"Viewing the Docker-hosted databases"** section
(connection strings, `docker exec psql` / `redis-cli`, GUI tools, example queries).

### Environment variables
`.env` / `.env.local` are git-ignored and **auto-generated by the launcher when missing** (see
above). Keys:

| File | Key | Purpose | Default |
|---|---|---|---|
| `backend/.env` | `JWT_SECRET` | signs auth tokens | random on first run |
| | `DATABASE_URL` | Postgres | `postgresql://roadwatch_user:roadwatch_pass@localhost:5432/roadwatch` |
| | `REDIS_URL` | Redis | `redis://localhost:6380` |
| | `PORT` | Express API port | `8000` |
| | `ML_SERVER_URL` | FastAPI ML server | `http://localhost:5001` |
| | `N8N_WEBHOOK_URL` | chatbot webhook | `http://localhost:5678/webhook/roadwatch-chat` |
| | `INGEST_TOKEN` | shared secret for scheduled road-data ingestion | random on first run |
| | `NODE_ENV` | environment | `development` |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | Express API base URL (REST + WebSocket) | `http://localhost:8000` |

### Viewing the Docker-hosted databases (quick reference)
Containers: `roadwatch-iit-m-postgres-1`, `roadwatch-iit-m-redis-1`, `roadwatch-iit-m-n8n-1`.
- **Postgres**: `docker exec -it roadwatch-iit-m-postgres-1 psql -U roadwatch_user -d roadwatch`
  (then `\dt`, `SELECT …`), or any GUI (pgAdmin/DBeaver/TablePlus) at `localhost:5432`,
  db `roadwatch`, user `roadwatch_user`, pass `roadwatch_pass`.
- **Redis**: `docker exec -it roadwatch-iit-m-redis-1 redis-cli` (then `KEYS *`), or RedisInsight
  at `localhost:6380`.
- Status / logs: `docker compose ps`, `docker compose logs -f`.
