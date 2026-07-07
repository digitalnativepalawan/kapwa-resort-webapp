# TALA — Guest Voice Agent (KAPWA OS Boutique Resort)

Self-hosted voice concierge: LiveKit (room transport) + Ollama/Qwen3 8B (LLM)
+ whisper.cpp (STT) + Kokoro (TTS) + Supabase (KAPWA OS's live ops database).
Zero per-minute/per-token cost — everything runs on your own hardware.

Lives at `voice-agent/` inside `kapwa-backoffice`, separate from the existing
`concierge-ai` Supabase function (that one is OpenRouter/Claude-based staff
triage — unrelated, don't touch it).

## What's real vs. what's left to wire up

**Built and verified in this pass:**
- All 12 tools (`agent/tools/*`) — real Supabase queries against KAPWA OS's
  actual tables (`resort_ops_bookings`, `resort_ops_units`, `guest_requests`,
  `housekeeping_orders`, `resort_ops_tasks`, `tour_bookings`, `tours_config`,
  `assets`). Verified by inspecting the real `types.ts` from your repo, not
  guessed.
- Planner / Execution / Verification / Repair loops, wired as `AgentSession`
  event hooks against the **actual installed** `livekit-agents==1.6.3` API
  (confirmed by introspecting the library directly — not assumed from docs).
- Guest memory schema + read/write module.
- React/Vite/TS/Tailwind PWA frontend — **builds clean, 0 TypeScript errors,
  0 ESLint errors, production bundle verified.**
- Docker Compose for the full stack, with verified real image references
  (`ghcr.io/ggml-org/whisper.cpp:main`, `ghcr.io/remsky/kokoro-fastapi-cpu`,
  `ollama/ollama`, `livekit/livekit-server`).

**Not yet run end-to-end (no Docker daemon / no mic in this environment):**
- `docker compose up --build` itself — compose YAML is structurally valid
  and all images are real/verified, but the actual build + boot was not
  executed here. Run it locally and tell me what breaks.
- A live mic → STT → LLM → TTS round trip — the wiring is correct against
  the real library API, but a live audio test is the real proof.
- The Supabase migration (`supabase_migrations/0001_tala_memory_and_faq.sql`)
  has not been applied to the live `paghxagqnaisxesmhnwj` project yet.

---

## 1. Apply the Supabase migration

```bash
# From the Supabase SQL editor (paghxagqnaisxesmhnwj project), paste and run:
supabase_migrations/0001_tala_memory_and_faq.sql
```

This adds `guest_memory`, `tala_conversations`, and `faq_entries` —
nothing in this migration touches or modifies any existing table.

## 2. Configure environment

```bash
cp .env.example .env
# Fill in:
#   LIVEKIT_API_KEY / LIVEKIT_API_SECRET   (any values for local dev; see docker-compose.yml)
#   SUPABASE_SERVICE_ROLE_KEY               (from Supabase project settings -> API)
#   WEATHER_API_KEY                         (optional, OpenWeatherMap free tier)
```

**Never commit `.env`** — it's already in `.gitignore`.

## 3. Start the stack

```bash
docker compose up --build
```

First run will pull/build images. Two manual one-time steps after containers
are up:

```bash
# Pull the LLM model into Ollama's volume
docker compose exec ollama ollama pull qwen3:8b

# Download a whisper.cpp model into its volume
docker compose run --rm whisper "./models/download-ggml-model.sh base.en /models"
```

Then restart `tala-agent` and `whisper` so they pick up the downloaded
models:

```bash
docker compose restart whisper tala-agent
```

## 4. Open the app

- Frontend (PWA): http://localhost:8080
- Token server health check: http://localhost:3001/health
- LiveKit: ws://localhost:7880

On a phone on the same network, visit `http://<your-laptop-ip>:8080` and
"Add to Home Screen" to install as a PWA.

## 5. Local dev without Docker (faster iteration)

```bash
# Backend
cd voice-agent
python -m venv .venv && source .venv/bin/activate
pip install -r agent/requirements.txt
uvicorn agent.token_server:app --reload --port 3001 &
python -m agent.livekit_agent dev

# Frontend
cd frontend
npm install
npm run dev   # http://localhost:5173
```

---

## Architecture

```
Guest mic (React PWA)
  -> LiveKit room (self-hosted)
    -> whisper.cpp (STT, OpenAI-compatible)
      -> AgentSession (livekit-agents) + Ollama/Qwen3 8B (OpenAI-compatible LLM endpoint)
        -> TalaAgent.@function_tool methods -> agent/tools/* -> Supabase (KAPWA OS live data)
      -> Kokoro (TTS, OpenAI-compatible)
    -> back into LiveKit room
  -> Guest hears TALA's reply
```

### The four required loops

| Loop | Where | What it does |
|---|---|---|
| **Planner** | Native LiveKit `AgentSession` + Qwen3 tool-calling | Qwen3 decides whether to answer directly or call one of TALA's 12 `@function_tool` methods. We don't re-implement intent classification — Qwen3's own tool-calling *is* the planner. |
| **Execution** | Native `AgentSession` tool execution | Framework runs the chosen tool(s); each `@function_tool` method on `TalaAgent` is a thin pass-through to the pure-Python functions in `agent/tools/*`, which hit real Supabase tables. |
| **Verification** | `session.on("function_tools_executed")` + `session.on("conversation_item_added")` | Checks `FunctionCallOutput.is_error` on every tool call, and checks every assistant turn for blank/empty responses. |
| **Repair** | Same event hooks, via `agent/loops/repair.py` logic ported into `RepairState` | Retries the *specific* failed tool call directly (bypassing a full re-plan when we already know what failed). Max 3 attempts (`MAX_RETRIES` in `.env`), then escalates with a warm hand-off line and flags `tala_conversations.escalated = true` for staff review. |

`agent/orchestrator.py` and the standalone `agent/loops/*.py` modules contain
a **framework-agnostic** version of this same logic (pure Python, fully unit
testable without LiveKit running) — useful for testing tool behavior and
verification rules in isolation. `agent/livekit_agent.py` is where the real,
production wiring lives against the actual LiveKit Agents runtime.

### Why Qwen3 + tool-calling instead of a hand-rolled planner

Earlier drafts of this build manually called Ollama's `/api/chat` with a
custom planner/execution loop, bypassing LiveKit's LLM layer entirely. That
was reworked after confirming (by direct introspection of the installed
`livekit-agents==1.6.3` package) that the framework's native `Agent` /
`AgentSession` / `@function_tool` pattern is the supported, maintained
integration point — it also gives built-in turn-detection, interruption
handling, and tool-output tracking (`is_error`) for free, which a hand-rolled
loop would have to reimplement.

---

## Tools reference

| Tool | Reads/writes | Notes |
|---|---|---|
| `check_availability` | `resort_ops_units`, `resort_ops_bookings` | Date-range overlap check |
| `today_arrivals` / `today_departures` | `resort_ops_bookings` (joined) | Defaults to today, Manila time |
| `guest_notes` | `guest_notes` | Read-only, staff-authored |
| `create_task` | `resort_ops_tasks` (insert) | General follow-up |
| `maintenance_request` | `resort_ops_tasks` (insert, category=maintenance) | Urgent flag raises priority + shortens due date |
| `housekeeping_status` | `housekeeping_orders` | Latest row per unit |
| `inventory_lookup` | `assets` | Stock check before promising an amenity |
| `weather_lookup` | OpenWeatherMap (external) | Live, not stored |
| `find_travelers` | `resort_ops_guests`, `resort_ops_bookings` | Never reveals room numbers |
| `find_events` | `tours_config`, `tour_bookings` | Upcoming activities |
| `faq_lookup` | `faq_entries` | TALA must use this, never answer resort facts from "memory" |

## Guest memory

`guest_memory` table — preferences, dietary restrictions, allergies,
birthday, favorite activities/foods, visit count. Loaded once at session
start (injected into the system prompt), written back at session close.
Identity match is best-effort: `guest_id` (exact) > phone > name fallback.

The richer "extract new facts mentioned mid-call" pass (e.g. guest mentions
a new allergy) is a deliberate follow-up, not done in this pass — it needs a
dedicated summarization step over the full transcript, which is more
reliable as a short batch job after the call than something bolted into the
live turn loop.

## Known gaps / next steps

1. Run `docker compose up --build` for real, fix whatever breaks on your
   actual hardware (model download time, port conflicts, etc.)
2. Live mic test end-to-end
3. Decide and implement the post-call memory-extraction pass
4. Tune Whisper model size (`base.en` vs `small.en`) for accuracy/speed
   tradeoff on your laptop
5. `find_travelers`/privacy: review with you whether the "never reveal room
   numbers" rule needs to be even stricter (e.g. don't confirm presence at
   all without staff approval)
