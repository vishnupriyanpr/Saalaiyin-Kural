# 🛡️ Saalai Kural Citizen Assistant

An AI-powered road safety chatbot for Indian citizens. Ask about potholes, traffic rules, accident procedures, or road hazards — get categorized, actionable guidance with relevant authority contacts and emergency helplines.

Built with a zero-dependency HTML frontend, an n8n Cloud workflow as middleware, and Groq's LLM API for sub-2-second inference.

---

## Who This Is For

- **Citizens** reporting road issues (potholes, broken signals, waterlogging) who need to know *which authority to contact* and *what information to collect*.
- **Drivers and pedestrians** looking for practical road safety tips specific to Indian roads.
- **Anyone at a road accident scene** who needs calm, step-by-step guidance and the right emergency numbers.

The bot is **not** a police officer, lawyer, doctor, or government official. It provides general guidance and always tells users to verify specifics with the relevant authority.

---

## Architecture

```
┌─────────────────┐         POST (text/plain)         ┌──────────────────────┐
│                  │ ──────────────────────────────────▶│                      │
│  Static HTML     │    JSON body: { message: "..." }   │   n8n Cloud          │
│  Frontend        │                                    │   Workflow           │
│  (localhost)     │ ◀──────────────────────────────────│                      │
│                  │    JSON: { success, reply, ... }    │   9 nodes            │
└─────────────────┘    + CORS headers                   └──────────┬───────────┘
                                                                   │
                                                                   │ POST (Bearer Auth)
                                                                   ▼
                                                        ┌──────────────────────┐
                                                        │  Groq API            │
                                                        │  /v1/chat/completions│
                                                        │  openai/gpt-oss-20b  │
                                                        └──────────────────────┘
```

### Data Flow

1. **User types a message** in the browser.
2. **Frontend sends a POST** to the n8n Cloud production webhook URL.
3. **n8n validates** the input (type, length, sanitization).
4. **n8n builds the prompt** — a detailed India-specific road safety system prompt + the user's message.
5. **n8n calls Groq** via HTTP Request with Bearer Auth.
6. **n8n parses the response** — extracts the reply, classifies the category by regex, determines guidance type, generates follow-up suggestions.
7. **n8n returns structured JSON** to the frontend with CORS headers.
8. **Frontend renders** the reply with category badges, guidance notes, and clickable follow-up chips.

The workflow is **stateless** — no conversation memory between messages. Each request is independent.

---

## Project Structure

```
Saalai Kural Chatbot/
├── frontend/
│   └── index.html          # Complete frontend — HTML + CSS + JS in one file
├── n8n/
│   └── workflow.json       # n8n workflow — import directly into n8n Cloud
├── docs/
│   ├── architecture.md     # Architecture documentation
│   ├── setup-guide.md      # Step-by-step setup instructions
│   └── testing-plan.md     # Test cases and verification plan
└── README.md               # This file
```

---

## Local Development Setup

### Prerequisites

- A browser (Chrome, Firefox, Edge)
- Python 3.x (for local HTTP server) **or** VS Code with Live Server extension
- An [n8n Cloud](https://n8n.io) account (14-day free trial works)
- A [Groq](https://console.groq.com) API key (free tier, no credit card)

### 1. Serve the Frontend

> ⚠️ **You cannot open `index.html` as a `file://` URL.** Browsers block all `fetch()` calls from `file://` origins due to CORS policy. You must serve it via HTTP.

**Option A — Python:**
```bash
cd frontend
python -m http.server 3000
# Open http://localhost:3000
```

**Option B — VS Code Live Server:**
Right-click `index.html` → "Open with Live Server"

### 2. Configure the Webhook URL

In `frontend/index.html`, line 1 of the `<script>` block:

```javascript
const WEBHOOK_URL = 'https://YOUR-INSTANCE.app.n8n.cloud/webhook/saalaikural-chat';
```

Replace `YOUR-INSTANCE` with your n8n Cloud instance name.

**Test URL vs Production URL:**

| URL Pattern | When It Works |
|---|---|
| `/webhook-test/saalaikural-chat` | Only while "Test workflow" is active in n8n editor |
| `/webhook/saalaikural-chat` | Only when the workflow is **Published** (Active toggle ON) |

Use the test URL during development, switch to production for demos.

---

## n8n Workflow Setup

### 1. Import the Workflow

1. Log into your n8n Cloud instance.
2. Click **"Add workflow"** → **⋯ menu** → **"Import from File"**.
3. Select `n8n/workflow.json`.
4. The workflow imports with 9 pre-configured nodes.

### 2. Set Up the Groq API Credential

The workflow uses an HTTP Request node with a hardcoded Bearer Auth header. To update the API key:

1. Open the **"Call Groq API"** node.
2. Under **Header Parameters**, find the `Authorization` field.
3. Set the value to: `Bearer YOUR_GROQ_API_KEY`

> **Note:** `$env.VARIABLE_NAME` does **not** work reliably on n8n Cloud for HTTP Request header expressions. Hardcode the key in the node or use n8n's built-in credential system (Header Auth type).

### 3. Publish the Workflow

1. Toggle the **Active** switch (top-right of the workflow editor) to **ON**.
2. The production webhook URL is now live.

> ⚠️ **Saved ≠ Published.** If the workflow is only saved but the Active toggle is OFF, the production webhook URL returns 404. You must activate it.

### Node Pipeline

| # | Node | Type | Purpose |
|---|---|---|---|
| 1 | Webhook - Chat Input | Webhook (POST) | Receives user messages at `/saalaikural-chat` |
| 2 | Validate Input | Code | Checks message exists, is a string, 2–2000 chars |
| 3 | IF - Input Valid | If | Routes valid → Build Prompt, invalid → Error Response |
| 4 | Build Prompt | Code | Constructs system prompt + Groq API request body |
| 5 | Call Groq API | HTTP Request | POST to `api.groq.com/openai/v1/chat/completions` |
| 6 | Format Response | Code | Parses LLM reply, classifies category, builds response |
| 7 | Send Response | Respond to Webhook | Returns JSON with CORS headers |
| 8 | Prepare Error Response | Code | Builds fallback error JSON |
| 9 | Send Error Response | Respond to Webhook | Returns error JSON with CORS headers |

---

## Response Schema

Every response from the webhook follows this shape:

```json
{
  "success": true,
  "reply": "Here's what you should do...",
  "category": "road_issue",
  "guidance_type": "general_guidance",
  "follow_up_options": [
    "How do I file a formal complaint?",
    "What details should I collect?"
  ]
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | `true` if the LLM returned a valid reply, `false` on error |
| `reply` | `string` | The assistant's response text |
| `category` | `string` | Classification of the user's query (see table below) |
| `guidance_type` | `string` | How the guidance should be treated (see table below) |
| `follow_up_options` | `string[]` | 2–3 suggested follow-up questions |

### Category Classification

Categories are determined by regex matching on the user's message:

| Category | Trigger Keywords | Example Query |
|---|---|---|
| `emergency` | accident, injured, fire, trapped, bleeding, crash, collision | "I just saw a car crash" |
| `road_issue` | pothole, damage, broken, waterlog, obstruct, report, complaint, flooded | "How to report a pothole?" |
| `traffic_rules` | rule, signal, speed, fine, challan, penalty, lane, parking, drunk, red light | "What's the fine for jumping a red light?" |
| `road_safety` | helmet, seatbelt, pedestrian, crossing, night driving, fog, rain, visibility | "Tips for driving in heavy rain" |
| `general` | *(default — no keywords matched)* | "What does Saalai Kural do?" |
| `error` | *(API failure or invalid input)* | — |

### Guidance Type Logic

| Guidance Type | Condition |
|---|---|
| `emergency_action` | Category is `emergency` |
| `verify_with_authorities` | Category is `traffic_rules`, OR the reply text contains "verify", "check with", "confirm with", or "official source" |
| `general_guidance` | Everything else |

---

## India-Specific Context

### Emergency Helplines (baked into system prompt)

| Number | Service |
|---|---|
| **112** | Unified emergency (police + fire + ambulance) |
| **100** | Police |
| **108** | Ambulance (most states) |
| **1073** | Road accident helpline (select states) |

### Authority Routing

| Authority | Jurisdiction |
|---|---|
| Municipal Corporation / Nagar Palika | City roads |
| PWD (Public Works Department) | State highways |
| NHAI (National Highways Authority of India) | National highways |
| Traffic Police | Violations, signals, enforcement |

---

## Design Decisions

### Why Groq, not NVIDIA NIM?

Started with NVIDIA NIM API (`google/gemma-3-27b-it`). It consistently timed out at 30s, and even at 120s timeout the cold start on the free tier made it unusable for a live demo. The model was also deprecated mid-project (410 Gone on May 12, 2026). Groq responds in **under 2 seconds** on the free tier with no cold starts.

### Why `Content-Type: text/plain`?

Browsers send a CORS preflight `OPTIONS` request for `application/json`. n8n Cloud webhooks don't handle `OPTIONS` requests — they return 500, which blocks the actual POST. Sending `text/plain` makes it a [simple request](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#simple_requests) — no preflight, no CORS failure. The n8n Code node parses the JSON string from the raw body.

### Why n8n as middleware?

- **API key isolation:** The Groq API key never reaches the browser. The frontend only knows the webhook URL.
- **Input validation:** Sanitization and length checks happen server-side before the LLM call.
- **Response shaping:** The raw LLM text is classified, categorized, and structured into a predictable JSON contract.
- **Swappable LLM:** Changed from NVIDIA → Groq by editing one node. The frontend didn't change at all.

### Why Published (Active) matters

n8n Cloud has two webhook URL patterns:
- **Test:** `webhook-test/...` — only works while the editor has "Test workflow" active.
- **Production:** `webhook/...` — only works when the workflow's Active toggle is ON.

If you only save the workflow without activating it, the production URL is dead. This is the #1 setup mistake.

---

## Known Limitations

- **No conversation memory.** Each message is independent. The bot can't reference previous messages.
- **Regex-based classification.** Category detection uses keyword matching, not semantic understanding. A message like "my friend got a challan for a pothole" could match both `traffic_rules` and `road_issue`.
- **No file/image uploads.** Users can't submit photos of road damage.
- **Single language.** English only — no Hindi or regional language support.
- **Free tier rate limits.** Groq free tier has per-minute and per-day token limits. Heavy concurrent use will hit 429 errors.
- **No persistent logging.** Conversations are not stored anywhere.
- **Hardcoded API key.** The Groq key is embedded in the workflow JSON. Don't commit this to a public repository.

---

## Possible Improvements

- **Conversation memory** — Store message history in n8n's built-in storage or a lightweight database (Supabase, Airtable) and pass the last N messages as context.
- **Multilingual support** — Detect language from user input and respond in Hindi, Tamil, Telugu, etc. Groq models handle multilingual prompts reasonably well.
- **Image-based reporting** — Add a file upload that sends road damage photos to a vision model for automatic damage classification.
- **Location awareness** — Integrate with browser Geolocation API to provide state-specific helpline numbers and authority contacts.
- **Dashboard backend** — Build an admin dashboard to view submitted reports, track common issues by area, and generate heatmaps of road problems.
- **Semantic classification** — Replace regex-based categorization with an LLM-based classifier or a lightweight fine-tuned model for better accuracy.
- **Rate limiting** — Add client-side throttling and n8n-side rate limiting to prevent abuse.
- **Authentication** — Add optional user accounts to track report history and provide personalized responses.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (glassmorphism), Vanilla JS |
| Middleware | n8n Cloud (webhook + code nodes) |
| LLM | Groq API — `openai/gpt-oss-20b` |
| Typography | Inter (Google Fonts) |
| Hosting (frontend) | Any static server (Python http.server, VS Code Live Server, Vercel, Netlify) |

---

## License

MIT
