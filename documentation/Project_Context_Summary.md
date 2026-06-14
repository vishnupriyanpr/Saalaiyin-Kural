# Saalai Kural (சாலையின் குரல்) — Project Context Summary

> Concise orientation for the project as it stands today. The canonical, exhaustive reference is
> **`/proj_details.md`** at the repo root; `project_knowledge_base.md` (this folder) is the
> detailed technical map. Anything describing SQLite / a FastAPI monolith / Firebase / a mock
> `db.ts` / a disconnected frontend is **obsolete** — that was an earlier iteration.

## 1. What it is
Saalai Kural ("Voice of the Road") is a gamified, AI-assisted civic platform for reporting,
triaging, allocating, and tracking road-damage repair across Tamil Nadu. Citizens photograph
potholes/cracks → a YOLOv8 model classifies and prioritises each defect → PWD authorities triage,
cluster, allocate workers, and resolve, with a fully public transparency dashboard.

## 2. Architecture (current)
Five processes + three Docker containers, all started by `start_roadwatch.bat`:

| Service | Command | Port |
|---|---|---|
| Frontend — Next.js 14 (App Router, "Saalai Kural") | `npm run dev` | 3000 |
| Express API + WebSocket — `server.js` (REST, JWT, live push) | `node server.js` | 8000 (`/health`) |
| Smart-routing worker — `worker.js` (Redis queue) | `node worker.js` | — |
| ML server — `ml_server.py` (FastAPI + Ultralytics YOLOv8) | `python ml_server.py` | 5001 (`/health`) |
| n8n (chatbot workflow, webhook `roadwatch-chat`) | docker | 5678 |
| Postgres 16 (DB `roadwatch`) / Redis 7 | docker | 5432 / 6380 |

The **frontend is fully wired to the Express API** via `lib/api.ts` + `lib/db.ts` (no mock data
layer; "a real error is better than fake success"). Auth is **JWT** in `localStorage`
(`saalaikural_token`). The Express API proxies `/api/analyze` image uploads to the FastAPI ML
server. Data is stored in **Postgres via knex** (migrations + `seed.js`).

## 3. Branding note
Renamed **RoadWatch → Saalai Kural** in the **frontend + launcher banner only**. Backend internals
deliberately stay `roadwatch` (DB name, `@roadwatch.gov.in` logins, `roadwatch-chat` webhook,
`roadwatch-iit-m-*` containers, `start_roadwatch.bat`) to avoid breakage.

## 4. Seed logins
- Admin: `admin@roadwatch.gov.in` / `RoadWatch@2026`
- Authority: `authority.nh@roadwatch.gov.in` / `Authority@2026` (also `.sh`, `.mdr`)
- Civilian: password `Citizen@2026` (phone numbers in `backend/seed.js`)

## 5. ML model
`ml_server.py` loads `backend/best.pt` (4-class: Longitudinal/Transverse/Alligator Crack +
Potholes — RDD2022; 89 MB, **not in git**, auto-downloaded by the launcher), falling back to the
committed `backend/models/best.pt` (2-class Crack/Pothole, 6 MB). No mock inference.

## 6. Running it
`start_roadwatch.bat` is portable to a fresh machine: it installs Node/Python/Docker via winget,
runs `npm install` (backend + frontend) and `pip install`, auto-downloads the model, starts the
containers, **applies migrations and auto-seeds an empty DB**, frees ports, and launches all five
services in one split terminal. Flags: `-Seed` (force reseed), `-Migrate`, `-Clean`.

## 7. Recent work
- Hardened the launcher for fresh machines (toolchain install, pip, model download, auto-migrate +
  auto-seed).
- Fixed: budget page null-crash (`budget_estimated`), reward icons/category filter, first-report
  badge + streak tracking, chatbot Tamil TTS voice selection, and multi-line voice dictation.
- **Mobile-responsive pass** across the whole frontend (viewport meta, `overflow-x-hidden` guard,
  `100dvh` full-height views, `min-w` scrollable tables, hamburger nav, 3D `dpr` cap). Citizen
  flows are fully touch-usable; admin drag-drop boards remain desktop-only on touch.

See **`/proj_details.md` §13** for the full list of known limitations / hardening notes.
