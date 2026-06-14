# Step-by-Step Setup Guide

## Prerequisites

Before starting, make sure you have:

- [ ] **n8n Cloud account** — Sign up at [app.n8n.cloud](https://app.n8n.cloud) (14-day free trial)
- [ ] **NVIDIA NIM API key** — Get one at [build.nvidia.com](https://build.nvidia.com) (free credits available)
- [ ] **A modern web browser** (Chrome, Firefox, Edge, Safari)

---

## Step 1 — Import the Workflow into n8n Cloud

1. Log into your n8n Cloud dashboard
2. Click **"+ Add workflow"** (or the orange `+` button)
3. In the new empty workflow, click the **three dots menu (⋯)** in the top-right
4. Select **"Import from File..."**
5. Choose the file: `n8n/workflow.json` from this project
6. The workflow should appear with **9 nodes** connected in two paths

**What you should see:**

```
Webhook → Validate → IF Valid?
  ├─ Yes → Build Prompt → Call Gemma 4 API → Format Response → Send Response
  └─ No  → Prepare Error Response → Send Error Response
```

> **If import fails**: Open `workflow.json` in a text editor, select all (Ctrl+A), copy (Ctrl+C). In n8n, use **Import from JSON** and paste the content.

---

## Step 2 — Set the NVIDIA API Key

1. In n8n Cloud, go to **Settings** (gear icon, left sidebar)
2. Click **"Environment Variables"** (under "General")
3. Click **"+ Add Variable"**
4. Set:
   - **Name**: `NVIDIA_API_KEY`
   - **Value**: Your NVIDIA NIM API key (starts with `nvapi-...`)
5. Click **Save**

> **Note**: The API key is referenced in the **Call Gemma 4 API** node as `{{ $env.NVIDIA_API_KEY }}`. It stays out of the workflow JSON, so the workflow is safe to share.

---

## Step 3 — Verify the Model Name

1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Search for "Gemma" and find the model you want to use
3. Note the model identifier (e.g., `google/gemma-3-27b-it`)
4. In n8n, open the **Build Prompt** code node
5. Find the line: `model: 'google/gemma-3-27b-it'`
6. Update it if your model identifier is different
7. Save the node

---

## Step 4 — Test with the Webhook Test URL

1. In the workflow, click the **"Webhook - Chat Input"** node
2. You'll see a **Webhook URL** section showing:
   - **Test URL**: `https://<your-instance>.app.n8n.cloud/webhook-test/saalaikural-chat`
   - **Production URL**: `https://<your-instance>.app.n8n.cloud/webhook/saalaikural-chat`
3. Copy the **Test URL**
4. Click **"Test workflow"** (or the "Listen for test event" button) — the workflow enters test/listening mode
5. Open a terminal or use any HTTP client and run:

```bash
curl -X POST "https://<your-instance>.app.n8n.cloud/webhook-test/saalaikural-chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I report a pothole?"}'
```

**On Windows PowerShell:**

```powershell
Invoke-RestMethod -Method POST -Uri "https://<your-instance>.app.n8n.cloud/webhook-test/saalaikural-chat" -ContentType "application/json" -Body '{"message": "How do I report a pothole?"}'
```

6. You should get a JSON response like:

```json
{
  "success": true,
  "reply": "To report a pothole, you can...",
  "category": "road_issue",
  "guidance_type": "general_guidance",
  "follow_up_options": ["How do I file a formal complaint?", "What details should I collect?", "Which authority handles this?"]
}
```

> **If it fails**: Check n8n's execution log (click the "Executions" tab) to see which node errored.

---

## Step 5 — Activate the Workflow

1. Once testing succeeds, toggle the workflow to **Active** (the switch in the top-right of the workflow editor)
2. The workflow is now live and the **Production URL** is active
3. The production URL is: `https://<your-instance>.app.n8n.cloud/webhook/saalaikural-chat`

> **Important**: The Test URL only works when you're in the workflow editor with "Listen for test event" active. The Production URL works anytime when the workflow is Active.

---

## Step 6 — Connect the Frontend

1. Open `frontend/index.html` in a text editor
2. Find line 3 of the `<script>` section (near the bottom):

```javascript
const WEBHOOK_URL = 'YOUR_N8N_WEBHOOK_URL_HERE';
```

3. Replace with your **Production URL**:

```javascript
const WEBHOOK_URL = 'https://<your-instance>.app.n8n.cloud/webhook/saalaikural-chat';
```

4. Save the file
5. Open `index.html` in your browser (double-click it or use File → Open)
6. Type a message and send — you should see the chatbot respond!

> **Tip**: For testing, you can use the Test URL instead, but remember to have the workflow in listen mode in n8n.

---

## Step 7 — Verify End-to-End

Run through this quick verification checklist:

- [ ] Type "How do I report a pothole?" → Should get a helpful response
- [ ] Type "a" → Should get "Please provide a bit more detail" error
- [ ] Send an empty message → Send button should be disabled
- [ ] Type "What is the fine for jumping a red light?" → Should respond with `verify_with_authorities` guidance type
- [ ] Type "There's been an accident" → Should mention calling 112
- [ ] Check that follow-up chips appear and work when clicked
- [ ] Check that category badges appear on bot messages

---

## Troubleshooting

### "Failed to fetch" or CORS error

**Cause**: The browser blocks cross-origin requests from `file://` protocol.

**Fix**: Serve the HTML file with a local server instead of opening directly:

```bash
# Python 3
cd frontend
python -m http.server 8080
# Then open http://localhost:8080 in your browser
```

Or use VS Code Live Server extension (right-click `index.html` → "Open with Live Server").

### Workflow times out / no response

**Cause**: The NVIDIA API call might be slow or the API key is invalid.

**Fix**:
1. Check n8n execution logs for the specific error
2. Verify your `NVIDIA_API_KEY` environment variable is set correctly
3. Test the API key directly:

```bash
curl -X POST "https://integrate.api.nvidia.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-3-27b-it","messages":[{"role":"user","content":"hello"}],"max_tokens":50}'
```

### "Please set your n8n webhook URL"

**Cause**: You forgot to update the `WEBHOOK_URL` in `index.html`.

**Fix**: Edit line 3 of the script section with your actual n8n webhook URL.

### n8n shows "Invalid expression" on HTTP Request node

**Cause**: The environment variable might not be set.

**Fix**: Go to Settings → Environment Variables and ensure `NVIDIA_API_KEY` exists.

### Workflow imports but nodes show errors

**Cause**: n8n version differences in node typeVersions.

**Fix**: Delete the errored node and re-add it manually using the same configuration from `docs/architecture.md` → Section 4.

### Response shows "I am experiencing a temporary issue"

**Cause**: The NVIDIA API returned an error or unexpected format.

**Fix**: Check the execution log. Common causes:
- Rate limiting (wait and retry)
- Invalid model name (check Step 3)
- API key expired or invalid
- Account credits exhausted
