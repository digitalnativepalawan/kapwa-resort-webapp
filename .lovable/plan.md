# resort-operator deployment verification plan

Everything you asked about is already in place from earlier setup turns. This plan just aligns the shared secret to the exact value you specified and produces the verification output you want. No system keys are touched.

## Current state (already verified)

- `supabase/functions/resort-operator/` exists in the repo (index.ts, planner.ts, executor.ts, state.ts, cases.ts, system-map.ts). Lovable Cloud auto-deploys edge functions on every push, so it is already reachable at `/functions/v1/resort-operator`.
- `public.ops_cases` table exists in the database.
- pg_cron job `resort-operator-cycle` exists.
- `INTERNAL_FN_SECRET` is already configured as a backend secret (currently a random 64-char value generated in an earlier turn, not your value).
- `resort-agent-loop` already sends `x-internal-secret: ${INTERNAL_FN_SECRET}` when calling `resort-operator`, and `resort-operator/index.ts` already checks that header against the same env var — so once both functions share the same value, internal calls authenticate automatically.

## What I'll do

1. **Overwrite `INTERNAL_FN_SECRET`** to the exact value you provided (`DiPkf7xIPBE8fZZUPKvKLoUXKkUMhLHd`) using `set_secret`. Both `resort-operator` and `resort-agent-loop` read this from the same env var, so they stay in sync automatically — no code change needed.
2. **No code changes, no migrations, no system keys touched.** The function code, ops_cases migration, and cron migration are already applied.
3. **Live test:** call `resort-operator` with `{"action":"state"}` via the edge-function curl tool using an admin JWT, and paste the JSON response back to you.
4. **Confirm schema + cron** by re-running the introspection query and showing you the row: `ops_cases` regclass and `resort-operator-cycle` job name.
5. **Confirm secret parity** by listing configured backend secrets (names only) so you can see `INTERNAL_FN_SECRET` is present for both functions (they share one env).

## One note before I proceed

You pasted the intended secret value in plain chat. That's fine to use, but the chat transcript now contains it. If you'd rather I generate/store a fresh value you never share in chat, say the word and I'll rotate it instead. Otherwise I'll set it to `DiPkf7xIPBE8fZZUPKvKLoUXKkUMhLHd` exactly as given.

## Not doing

- Not redeploying function code (unchanged; auto-deploy already handled it).
- Not re-running the two migrations (already applied).
- Not touching anon/service-role/publishable keys.
- Not modifying UI or any other function.

Approve and I'll execute steps 1–5 and report the test response.
