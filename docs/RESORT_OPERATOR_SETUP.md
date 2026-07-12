# KAPWA Resort Operator Setup

## What this release does

The Resort Operator reads the backoffice's existing hosted operational data, produces a deterministic daily brief, optionally asks the configured AI runtime for management analysis, creates approval-required actions in the app, records decisions in the existing `audit_log`, and executes only approved allow-listed actions.

Automatic execution is limited to:

- creating a missing housekeeping order;
- escalating an urgent guest request.

Booking changes, rate changes, billing resolution, payments, refunds, external guest messages, destructive changes, and deletions remain manual.

No new Supabase project, database, or agent tables are required.

## 1. Configure the agent runtime

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

## 2. Install and run

```bash
npm install
npm run dev:server
```

In a second terminal:

```bash
npm run dev
```

## 3. Configure the model

Open:

```text
/admin/agent-runtime
```

Enter the same `KAPWA_ADMIN_TOKEN` used by the server. It is stored only in browser session storage and is required whenever the Resort Operator sends a live operational snapshot for model analysis.

Choose one runtime:

- OpenRouter model
- Local Ollama model
- Hermes Agent powered by OpenRouter or Ollama

For OpenRouter, paste a key and load the current free/paid model catalog.

For Ollama, run Ollama on the same machine, then use Detect to list installed models.

## 4. Run the operator

Open:

```text
/admin/operator
```

The operator will:

1. read current bookings, rooms, housekeeping, requests, disputes, tours, and active orders from the existing hosted backend;
2. produce a deterministic operational summary;
3. use the selected model for management analysis when available and authorized;
4. fall back to deterministic analysis when the model runtime is unavailable;
5. create approval-required actions in the browser;
6. record runs, approvals, rejections, executions, and failures in the existing `audit_log`;
7. execute only the approved housekeeping and urgent-request actions.

## 5. Release validation

Run:

```bash
npm test
npm run lint
npm run build
node --check server/index.js
```

Then verify:

1. OpenRouter model catalog loads.
2. Ollama detection lists installed models.
3. Resort Operator produces a live-data brief.
4. The operator endpoint rejects requests without the admin token.
5. Approving a missing housekeeping action creates one order only.
6. Repeating the same approval does not create a duplicate active order.
7. Approving an urgent guest request changes its status to `escalated`.
8. Billing disputes remain manual.
9. Operator analysis falls back to the deterministic brief when the runtime is unavailable.
