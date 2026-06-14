# Saalaiyin Kural — Road & Funding Data Ingestion (n8n)

`road-data-ingestion.workflow.json` is a scheduled n8n workflow that pulls real
road/funding data from an external source and pushes it into Saalaiyin Kural, which then
updates every dashboard **live** (via WebSocket broadcast on the backend).

```
Every 6h ─▶ Fetch data.gov.in ─▶ Map to roads schema ─▶ Has roads? ─┬─▶ POST /api/roads/ingest
                                                                     └─▶ Nothing to ingest (no-op)
```

The backend `POST /api/roads/ingest` upserts each road **by name** (re-runs update, never
duplicate) and broadcasts `TRANSPARENCY_UPDATE`, so the public transparency page and the
admin/civilian budget dashboards refresh within seconds — no page reload.

## Why this shape (and not "true real-time")
There is **no real-time public government API** for road funding. `data.gov.in` exposes
mostly *static/periodic* datasets, NHAI's Data Lake is internal, and budgets are set
annually. So the correct pattern is **scheduled pull + live push**, which is exactly this.

## Setup (5 steps)

1. **Import** — n8n at http://localhost:5678 → *Workflows* → *Import from File* →
   `road-data-ingestion.workflow.json`.

2. **Pick a dataset + API key** — sign in at https://data.gov.in, get your free API key,
   and find a roads/highways dataset's **resource id** (the UUID in its API URL). In the
   **Fetch data.gov.in** node set:
   - URL → `https://api.data.gov.in/resource/<YOUR_RESOURCE_ID>`
   - query param `api-key` → your key.
   (Prefer storing the key as an n8n **credential / env var** rather than inline.)

3. **Map the columns** — open the **Map to roads schema** (Code) node and edit the `COLS`
   object so each of our fields lists that dataset's *actual* column names. If the dataset
   reports money in **crores**, set `BUDGET_MULTIPLIER = 10000000` (to store rupees).
   Rows without a resolvable road name are skipped — **nothing is fabricated**.

4. **Set the ingest token** — in the **POST /api/roads/ingest** node, header
   `x-ingest-token` → the value of `INGEST_TOKEN` in `backend/.env`.
   - The URL is `http://host.docker.internal:8000/api/roads/ingest` **on purpose**:
     n8n runs inside Docker, so `localhost` would point at the n8n container, not your
     host backend. `host.docker.internal` reaches the host (Docker Desktop on Win/Mac).
     On Linux, add `extra_hosts: ["host.docker.internal:host-gateway"]` to the n8n service,
     or use your host LAN IP.

5. **Test & activate** — run once manually (▶ *Execute Workflow*); the Code node logs how
   many roads it mapped, and the POST returns `{upserted, inserted, updated}`. Watch the
   transparency page update live. Then toggle the workflow **Active** for the 6-hour schedule
   (adjust the cadence in the **Every 6 hours** node).

## Adapting to other sources
Swap the **Fetch** node for any HTTP source (PWD portal, a CSV via the Spreadsheet File
node, a scraper, etc.). As long as the **Map** node outputs `{ roads: [ {name, type,
jurisdiction_dept, contractor_name, contractor_contact, budget_sanctioned, budget_spent,
last_relayed_date, maintenance_history} ] }`, the rest of the pipeline is unchanged.
You can also point the same workflow at multiple sources and merge before the IF.
