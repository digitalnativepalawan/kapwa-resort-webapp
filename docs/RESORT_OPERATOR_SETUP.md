# KAPWA Resort Operator Setup

## What this release does

The Resort Operator reads live KAPWA operational data, produces a deterministic daily brief, optionally asks the configured AI runtime for management analysis, creates auditable action proposals, and executes only approved allow-listed actions.

Automatic execution is limited to:

- creating a missing housekeeping order;
- escalating an urgent guest request.

Booking changes, rate changes, billing resolution, payments, refunds, external guest messages, destructive changes, and deletions remain manual.

## 1. Apply the Supabase migration

Apply:

```text
supabase/migrations/202607120001_resort_operator.sql
```

This creates:

- `agent_runs`
- `agent_actions`

## 2. Configure the local agent runtime

Copy the template:

```bash
cp .env.agent.example .env
```

Set at minimum:

```env
KAPWA_ADMIN_TOKEN=use-a-long-random-value
KAPWA_SETTINGS_ENCRYPTION_KEY=base64-encoded-32-byte-key
VITE_AGENT_RUNTIME_URL=http://127.0.0.1:3000/api
```

Generate the encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit `.env` or `server/data/`.

## 3. Install and run

```bash
npm install
npm run dev:server
```

In a second terminal:

```bash
npm run dev
```

## 4. Configure the model

Open:

```text
/admin/agent-runtime
```

Enter the same `KAPWA_ADMIN_TOKEN` used by the server, then choose one runtime:

- OpenRouter model
- Local Ollama model
- Hermes Agent powered by OpenRouter or Ollama

For OpenRouter, paste a key and load the current free/paid model catalog.

For Ollama, run Ollama on the same machine, then use Detect to list installed models.

## 5. Run the operator

Open:

```text
/admin/operator
```

The operator will:

1. read current bookings, rooms, housekeeping, requests, disputes, tours, and active orders;
2. produce a deterministic operational summary;
3. use the selected model for management analysis when available;
4. create approval-required actions;
5. log the run, provider, model, inputs, outputs, decisions, and execution results.

## 6. Required release validation

Run:

```bash
npm test
npm run lint
npm run build
```

Then verify manually:

1. OpenRouter model catalog loads.
2. Ollama detection lists installed models.
3. Resort Operator produces a live-data brief.
4. Approving a missing housekeeping action creates one order only.
5. Repeating the same approval does not create a duplicate active order.
6. Approving an urgent guest request changes its status to `escalated`.
7. Billing disputes remain manual.
8. Operator analysis fails closed without the admin token and falls back to the deterministic brief in the UI.
