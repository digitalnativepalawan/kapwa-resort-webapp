## Goal
Let admins edit every existing Guest FAQ Q&A (not just add/toggle/delete), and make the guest concierge agent actually use those approved answers on every turn.

## 1. Inline edit for FAQ rows — `src/pages/BotSettingsPage.tsx`
Today the list at the bottom of `/admin/bot-settings` only shows the question, keywords and answer as static text with an active toggle and a delete button. Add an editable mode per row:

- Add local state `editingId` plus a `draft` (`{ question, keywords, answer }`).
- Add a pencil "Edit" button next to the switch/trash on each FAQ row. Clicking it swaps the row's static text for an `Input` (question), `Input` (keywords) and `textarea` (answer) prefilled with the row's current values.
- Add `Save` and `Cancel` buttons in edit mode. Save calls `supabase.from('guest_faq_memory').update({ question, keywords, answer }).eq('id', id)`, updates local `faqs` state, toasts success, and clears `editingId`. Cancel just clears `editingId`.
- Keep the existing add / toggle / delete / import / download flows untouched.

## 2. Agent loops through approved answers — `api/hermes/chat.js`
`AgentChatPanel` already fetches active `guest_faq_memory` rows and POSTs them as `memory` to `/api/hermes/chat`, but the handler ignores that field. Update the handler:

- Destructure `memory` from `req.body` alongside `message` and `context`.
- When `context === 'guest-concierge'` and `memory` is a non-empty array, build an "Approved Q&A" block: for each active entry, one line with `Q: <question>` (plus `(keywords: ...)` if present) and `A: <answer>`.
- Prepend that block to the existing guest-concierge system prompt with an instruction like: "If the guest's question matches one of these approved Q&A entries, answer using that exact answer. Otherwise follow the rules above."
- Leave OpenRouter model, temperature and non-guest contexts unchanged.

## 3. Verify
- Reload `/admin/bot-settings`, edit an existing FAQ (e.g. "Do you have vegetarian options?"), save, refresh — the change persists.
- Open the guest concierge chat, ask a question that matches an approved FAQ, and confirm the reply mirrors the stored answer rather than a generic "I don't have that confirmed" fallback.

## Files touched
- `src/pages/BotSettingsPage.tsx` — inline edit UI + update handler.
- `api/hermes/chat.js` — accept `memory`, inject Approved Q&A block into the guest prompt.

No schema changes, no new tables, no changes to import/export or auth wiring.