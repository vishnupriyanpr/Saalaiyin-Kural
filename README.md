```
                                    ____             _         _   _  __                  _
                                   / ___|  __ _  __ _| | __ _  (_) | |/ /  _   _ _ __ __ _| |
                                   \___ \ / _` |/ _` | |/ _` | | | | ' /  | | | | '__/ _` | |
                                    ___) | (_| | (_| | | (_| | | | | . \  | |_| | | | (_| | |
                                   |____/ \__,_|\__,_|_|\__,_| |_| |_|\_\  \__,_|_|  \__,_|_|
                           
                                         S A A L A I   K U R A L   ·   சாலையின் குரல்
                                        Voice of the Road — AI civic road-repair platform
```

# Saalai Kural — சாலையின் குரல்

**"Voice of the Road"** is an AI-assisted civic platform for reporting, triaging, allocating, and
tracking road-damage repair across Tamil Nadu. Citizens photograph potholes and cracks; a YOLOv8
model classifies and prioritises each defect; PWD authorities triage, cluster, allocate crews, and
resolve — with a fully public budget-transparency dashboard. **Built for the Government of Tamil
Nadu and its citizens, in one place.**

> Deep technical reference (architecture, data model, full API surface, known limitations):
> **[proj_details.md](proj_details.md)**. This README is the practical setup + operations guide.

---

## Table of contents

1. [What it is](#1-what-it-is)
2. [Architecture](#2-architecture)
3. [One-click start (and migrating to a new device)](#3-one-click-start-and-migrating-to-a-new-device)
4. [Services, URLs & demo logins](#4-services-urls--demo-logins)
5. [Viewing the Docker-hosted databases (Postgres & Redis)](#5-viewing-the-docker-hosted-databases-postgres--redis)
6. [The n8n chatbot (one-time setup)](#6-the-n8n-chatbot-one-time-setup)
7. [Environment variables](#7-environment-variables)
8. [Manual / advanced setup](#8-manual--advanced-setup)
9. [Project structure](#9-project-structure)
10. [Troubleshooting](#10-troubleshooting)
11. [Branding note & credits](#11-branding-note--credits)

---

## 1. What it is

| Portal | Who | What they do |
|---|---|---|
| **Citizen** (`/civilian/*`) | The public | Photograph a hazard → AI auto-classifies type/severity/cost → file it (offline-capable). Earn points, levels, badges; redeem eco-rewards; track repairs live; chat with an assistant that **auto-detects the message language (English/Tamil) and replies in kind**, with new-chat / clear-chat / chat-history controls. |
| **Officials** (`/admin/*`) | PWD staff | Triage AI-classified alerts (each complaint row shows the defect photo, or a map-tile thumbnail when the photo is missing/unavailable), cluster nearby reports into discounted bulk-repair zones, allocate workers (Kanban/drag-drop), manage budgets, approve rewards, and run the **Traffic Management** console — a **reinforcement-learning (Q-learning)** signal controller benchmarked live against max-pressure and fixed-time. |
| **Authority** (`/authority`) | Field officers | Personal work queue; verify and resolve with photo proof. |
| **Transparency** (`/transparency`) | Everyone (no login) | Open-data dashboard: roads, sanctioned vs spent budget, resolution rates, hotspots. |

**Stack:** Next.js 15 (Turbopack dev) · React 19 · TypeScript · Tailwind · Express + `ws` (WebSocket) ·
knex / PostgreSQL 16 · Redis · FastAPI + Ultralytics YOLOv8 · n8n · Docker Compose.

---

## 2. Architecture

Five processes + three Docker containers, all started by one launcher:

```
  Browser ──HTTP/WS──▶  Next.js frontend            :3000
                              │ REST + 1 auth'd WebSocket
                              ▼
                        Express API + ws            :8000  (/health)
                        ┌──────┼─────────────┬───────────────┐
              proxy     │      │ Redis queue │  knex          │
            /api/analyze│      ▼             ▼                ▼
                        ▼   worker.js     Redis 7         Postgres 16
              FastAPI ML server :5001     :6380→6379      :5432
              (YOLOv8 inference)
                        │
   n8n :5678  ◀── /chatbot proxy ──┘   (chatbot workflow, webhook roadwatch-chat)
```

| Service | Command | Port | Health |
|---|---|---|---|
| Frontend (Next.js) | `npm run dev` | 3000 | — |
| Express API + WebSocket | `node server.js` | 8000 | `/health` |
| Smart-routing worker | `node worker.js` | — | — |
| ML server (FastAPI + YOLOv8) | `python ml_server.py` | 5001 | `/health` |
| n8n (chatbot) | docker | 5678 | — |
| PostgreSQL 16 | docker | 5432 | `pg_isready` |
| Redis 7 | docker | 6380 → 6379 | — |

---

## 3. One-click start (and migrating to a new device)

> **TL;DR — on any clean Windows machine, in any folder: double-click `start_roadwatch.bat`.**
> That one file *is* the entire setup — it installs every tool and dependency, generates config,
> starts Docker, brings up + seeds the database, downloads the ML model, and launches all five
> services. The only optional manual step is activating the n8n chatbot workflow (§6); everything
> else — including the app, AI detection, maps, dashboards, rewards, transparency, and Traffic
> Management — works with no further action.

```bat
start_roadwatch.bat            :: start everything (first run also installs + sets up)
start_roadwatch.bat -Seed      :: force a full wipe + reseed of the database
start_roadwatch.bat -Migrate   :: (migrations already run automatically; kept for habit)
start_roadwatch.bat -Clean     :: also clear the Next.js .next dev cache
```

### What the launcher does on a fresh machine (in order)

1. **Toolchain** — checks for and installs **Node.js, Python 3, Docker Desktop** (and Windows
   Terminal) via `winget`.
2. **Config** — generates `backend/.env` (with **freshly-randomised** `JWT_SECRET` and
   `INGEST_TOKEN`, plus the Docker connection strings) and `frontend/.env.local` if they don't
   exist. *(These files are git-ignored, so they never travel with the repo — the launcher
   recreates them.)*
3. **Containers** — `docker compose up -d` for Postgres, Redis, and n8n; waits for Postgres.
4. **Dependencies** — `npm install` in `backend/` and `frontend/`, and
   `pip install -r backend/requirements.txt` for the ML server.
5. **ML model** — downloads the ~89 MB YOLOv8 road-damage model to `backend/best.pt` if missing
   (a 2-class fallback is committed, so the app still runs even if the download fails).
6. **Database** — applies knex migrations (idempotent) and **auto-seeds demo data when the DB is
   empty**.
7. **Launch** — frees ports 8000/5001/3000 and opens all five services in one Windows Terminal
   2×2 split (fallback: separate windows).

### Migrating to a brand-new computer — exact steps

1. Copy the project folder (or `git clone` it) onto the new machine.
2. Double-click **`start_roadwatch.bat`**.
3. If it installed Docker/Node for the first time, it will say so and exit — **reboot once**, then
   double-click `start_roadwatch.bat` again. (Windows needs the reboot to finish Docker/WSL2 setup
   and put the new tools on PATH.)
4. On Docker Desktop's very first launch you may need to accept its terms once.
5. Wait for the five panes to come up, then open **http://localhost:3000**.

That's the whole migration. Everything else (deps, env, DB schema, demo data, ML model) is handled
automatically. Requirements on the new device: **Windows 10/11** with `winget` (ships with App
Installer) and an internet connection for the first run.

> **The launcher is self-sufficient and folder-independent.** It generates the git-ignored `.env`
> files (with fresh secrets), pins the Docker Compose project name (`roadwatch-iit-m`), and resolves
> the database via `docker compose exec` — so it sets the project up correctly **no matter which
> folder you clone into**. No file outside the repo is needed; nothing else must be installed by hand.

---

## 4. Services, URLs & demo logins

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Express API + WebSocket | http://localhost:8000 (health: `/health`) |
| ML server | http://localhost:5001 (health: `/health`) |
| n8n | http://localhost:5678 |
| Postgres / Redis | localhost:5432 / localhost:6380 |

**Demo logins** (created by `backend/seed.js`):

| Role | Credentials |
|---|---|
| Admin | `admin@roadwatch.gov.in` / `RoadWatch@2026` |
| Authority | `authority.nh@roadwatch.gov.in` / `Authority@2026` (also `.sh`, `.mdr`) |
| Civilian | password `Citizen@2026` (phone numbers are printed by `seed.js`) |

---

## 5. Viewing the Docker-hosted databases (Postgres & Redis)

The database and cache run inside Docker containers (`docker compose ps` lists them). Default
container names:

| Container | Service |
|---|---|
| `roadwatch-iit-m-postgres-1` | PostgreSQL 16 |
| `roadwatch-iit-m-redis-1` | Redis 7 |
| `roadwatch-iit-m-n8n-1` | n8n |

> Tip: run `docker compose ps` from the project root to confirm the exact names on your machine.

### PostgreSQL

**Connection details**

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `roadwatch` |
| User | `roadwatch_user` |
| Password | `roadwatch_pass` |
| URL | `postgresql://roadwatch_user:roadwatch_pass@localhost:5432/roadwatch` |

**Option A — psql inside the container (no install needed):**

```bash
docker exec -it roadwatch-iit-m-postgres-1 psql -U roadwatch_user -d roadwatch
```

Then explore:

```sql
\dt                                  -- list all tables
\d complaints                        -- describe a table
SELECT id, role, name, district, points FROM users LIMIT 10;
SELECT status, COUNT(*) FROM complaints GROUP BY status;
SELECT name, budget_sanctioned, budget_spent FROM roads ORDER BY budget_spent DESC LIMIT 10;
\q                                   -- quit
```

**Option B — a one-off query from your shell:**

```bash
docker exec -it roadwatch-iit-m-postgres-1 psql -U roadwatch_user -d roadwatch -c "SELECT COUNT(*) FROM complaints;"
```

**Option C — a GUI client** (pgAdmin, DBeaver, TablePlus, Beekeeper Studio): create a new
PostgreSQL connection using the connection details above (host `localhost`, port `5432`). The data
persists in the `postgres_data` Docker volume across restarts.

### Redis

Redis is published on host port **6380** (mapped to the container's 6379, to avoid clashing with a
local Redis on 6379).

**Option A — redis-cli inside the container:**

```bash
docker exec -it roadwatch-iit-m-redis-1 redis-cli
```

```
KEYS *               # list keys (chat history cache, worker queue, etc.)
LLEN <queue-key>     # length of a list/queue
GET <key>            # read a value
TTL <key>            # time-to-live
exit
```

**Option B — from your host** (if you have `redis-cli` installed): `redis-cli -p 6380`.

**Option C — RedisInsight (GUI):** add a database at host `localhost`, port `6380`.

### Inspect logs / container status

```bash
docker compose ps                                   # status of all containers
docker compose logs -f postgres                     # follow Postgres logs
docker compose logs -f                              # follow everything
docker exec -it roadwatch-iit-m-postgres-1 pg_isready -U roadwatch_user -d roadwatch
```

---

## 6. The n8n chatbot (one-time setup)

The in-app chat — which auto-detects English/Tamil and replies in kind — proxies through a local
n8n workflow. The containers start automatically, but the workflow must be **imported and activated
once**:

1. Open **http://localhost:5678** and create the local n8n owner account (first run only).
2. Import `chatbot/n8n/workflow.json` (Workflows → Import from File). **Re-import after pulling
   updates** — the workflow now reads a `language` field and forces the model to reply in the
   user's language, so an older imported copy won't have the bilingual fix.
3. Open the workflow, add your LLM provider credentials/API key on the relevant node, and click
   **Active** (top-right) so the production webhook `…/webhook/roadwatch-chat` goes live.

**Bilingual replies:** the Express `/chatbot` route auto-detects each message's language (English
vs Tamil, by Unicode script) and forwards it to n8n, where the prompt enforces a same-language
reply. No UI language toggle is needed for the bot — type in English and it answers in English;
type in Tamil and it answers in Tamil. (The chat page's language selector now only drives the
voice mic + read-aloud.)

Everything else (reporting, AI detection, maps, dashboards, rewards, transparency) works without
the chatbot.

---

## 7. Environment variables

The launcher creates these automatically (see §3). They are git-ignored — never commit them.

**`backend/.env`**

| Key | Purpose | Default |
|---|---|---|
| `JWT_SECRET` | Signs auth tokens | randomly generated on first run |
| `DATABASE_URL` | Postgres connection | `postgresql://roadwatch_user:roadwatch_pass@localhost:5432/roadwatch` |
| `REDIS_URL` | Redis connection | `redis://localhost:6380` |
| `PORT` | Express API port | `8000` |
| `ML_SERVER_URL` | FastAPI ML server | `http://localhost:5001` |
| `N8N_WEBHOOK_URL` | Chatbot webhook | `http://localhost:5678/webhook/roadwatch-chat` |
| `INGEST_TOKEN` | Shared secret for scheduled road-data ingestion | randomly generated on first run |
| `NODE_ENV` | Environment | `development` |

**`frontend/.env.local`**

| Key | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the Express API (REST + WebSocket) | `http://localhost:8000` |

> For a real deployment, rotate `JWT_SECRET`/`INGEST_TOKEN` and change the seeded passwords.

---

## 8. Manual / advanced setup

If you'd rather run pieces by hand (the launcher does all of this for you):

```bash
# 1. Infra
docker compose up -d

# 2. Backend
cd backend
npm install
pip install -r requirements.txt
npx knex migrate:latest
node seed.js            # seed demo data (wipes + reinserts)
node server.js          # API + WebSocket  (:8000)
node worker.js          # smart-routing worker        (separate terminal)
python ml_server.py     # YOLOv8 inference            (:5001, separate terminal)

# 3. Frontend
cd ../frontend
npm install --legacy-peer-deps
npm run dev             # Next.js dev server (:3000)
```

> `--legacy-peer-deps` is required on the frontend: the project pins `@react-three/fiber` v8 while
> `@react-three/rapier` v2 expects v9.
>
> **Do not run `npm run build` while `npm run dev` is live** — it can corrupt `.next`. Use
> `npx tsc --noEmit` to type-check.

---

## 9. Project structure

```
.
├── start_roadwatch.bat / .ps1   one-click launcher (installs + configures + runs everything)
├── docker-compose.yml           Postgres / Redis / n8n
├── README.md                    this file
├── proj_details.md              full technical reference (source of truth)
├── documentation/               additional knowledge-base docs
├── backend/
│   ├── server.js                Express REST + WebSocket + JWT auth (:8000)
│   ├── worker.js                Redis-queue smart-routing worker
│   ├── ml_server.py             FastAPI YOLOv8 inference (:5001)
│   ├── requirements.txt         Python ML deps
│   ├── db.js / knexfile.js      DB connection + config
│   ├── migrations/  seed.js     schema + realistic demo data
│   ├── best.pt                  4-class model (89 MB, not in git — auto-downloaded)
│   ├── models/best.pt           2-class fallback model (committed)
│   └── .env                     backend config (git-ignored, auto-generated)
├── frontend/
│   ├── app/                     App Router pages (landing, civilian/*, admin/*, authority, transparency)
│   ├── components/  lib/         UI components + data/auth/realtime layer
│   ├── public/                  manifest.json, sw.js (PWA), images
│   └── .env.local               frontend config (git-ignored, auto-generated)
└── chatbot/                     standalone n8n chatbot demo + workflow.json
```

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Launcher says a tool was installed but "not on PATH" | Reboot, then re-run `start_roadwatch.bat`. |
| `Docker daemon never came up` | The launcher now auto-launches Docker Desktop and waits up to 180s. If it still fails, the engine is mid-startup — open Docker Desktop, finish any first-run / WSL2 / sign-in prompt, wait until it shows **Engine running**, then re-run `start_roadwatch.bat`. |
| Landing / register figures show `—`, or backend logs `stats error` / redis-reconnect spam | The database & cache are offline — **Docker isn't running**. Start Docker Desktop, then run `start_roadwatch.bat` (brings up Postgres/Redis, migrates, seeds). Not a code bug — the UI degrades gracefully, and the **Traffic Management** page still works without Docker. |
| Frontend loads but data is empty / 401 loops | Ensure the backend is up (`http://localhost:8000/health`) and `frontend/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:8000`. Re-run the launcher to regenerate env files. |
| No demo logins work | The DB wasn't seeded — run `start_roadwatch.bat -Seed`. |
| Port already in use (EADDRINUSE) | The launcher frees 8000/5001/3000 on start; if it persists, close stale Node/Python windows and re-run. |
| ML `/analyze` returns 503 | No model loaded — re-run the launcher (it downloads `best.pt`) or place a model at `backend/best.pt`. |
| Chatbot doesn't reply | Import + **activate** the n8n workflow at http://localhost:5678 (see §6). |
| Next.js dev cache acting up | `start_roadwatch.bat -Clean`. |

---

## 11. Branding note & credits

The app was renamed **RoadWatch → Saalai Kural** in the **frontend + launcher banner only**.
Backend internals intentionally remain `roadwatch` (DB name, `@roadwatch.gov.in` logins,
`roadwatch-chat` webhook, `roadwatch-iit-m-*` containers, `start_roadwatch.bat`) to avoid breakage.
Full details in **[proj_details.md](proj_details.md)**.

Road-damage model: [`oracl4/RoadDamageDetection`](https://github.com/oracl4/RoadDamageDetection)
(YOLOv8, RDD2022 Japan + India dataset). 
A Digital India civic initiative , made for Government of Tamil Nadu.
```
```
