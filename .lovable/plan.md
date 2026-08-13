# Improve the TALA guest chat agent

The guest chat works, but it decides what to do with keyword matching before the model ever sees the message. That causes three concrete problems in the current code:

1. **Only one action per message.** `detectIntent()` returns the first match and stops, so "what's my bill and is my room clean?" answers only one of the two.
2. **Wrong tool from overlapping keywords.** The branches are ordered, so "is my room ready?" hits the housekeeping branch before the room-status branch, and "how long until my food?" hits the FAQ branch before the order-status branch.
3. **Writes fire with no confirmation.** "I was thinking of extending our stay" runs `extend_booking` immediately and adds a night plus the charge before the guest has agreed to anything.

## What changes

**Real tool calling.** The model gets the tool list and picks the tools itself, in a short loop (model → tool results → model, up to 3 rounds). It can call several tools in one turn and pick the right one from meaning rather than keywords.

**Confirmation before anything that costs money or changes the booking.** Read tools (bill, room status, order status, tour status, weather, availability, FAQ, tours) run freely. Write tools (extend stay, book tour, order food, transport, rental, general request) run in two steps: the model first states exactly what it will do and the price, and only executes after the guest confirms in the next message. A pending action is held in the chat session and expires if the guest changes topic.

**Better food ordering.** Instead of guessing items from the raw sentence, the agent looks up the live menu, matches what the guest asked for, and confirms items and total before sending anything to the kitchen.

**Keyword mode stays as a fallback.** If the configured model does not support tool calling (typical for a small local Ollama model), the agent falls back to the existing `detectIntent` path, so nothing breaks for local setups. Read-only tools still run automatically in that mode; write tools still require confirmation.

**Guest sees what happened.** The response reports which tools ran so the portal can show a small "checked your bill / placed your order" line under the reply.

## Technical notes

- `supabase/functions/_shared/guest-tools.ts`: add a `GUEST_TOOL_SCHEMAS` array (OpenAI function-tool JSON schemas) covering the existing exported tools, mark each read/write, and add a menu-lookup + fuzzy item matcher used by `order_food`. Existing tool functions and `detectIntent` are kept unchanged.
- `supabase/functions/_shared/modelGateway.ts`: extend `callModel` to accept `tools` and return `tool_calls` alongside content; OpenRouter passes them through natively, Ollama returns none, which triggers the keyword fallback.
- `supabase/functions/guest-chat/index.ts`: replace the single pre-flight `detectIntent` block with the tool-call loop; add pending-confirmation state carried in the request/response body (`pending_action`), enforce write-tool gating server-side, and return `tools_used[]`.
- `src/components/guest/TalaConcierge.tsx`: round-trip `pending_action` and render `tools_used` as a subtle activity line.
- Guest identity stays server-resolved from `booking_id` — the model never supplies booking/room ids; they are injected from the verified context, so a write tool cannot be aimed at another guest.

## Verification

Live calls against the deployed function for: multi-question message (two tools in one turn), "is my room ready?" (room status, not housekeeping), "how long until my food?" (order status), and an extend-stay flow that must ask before it books.
