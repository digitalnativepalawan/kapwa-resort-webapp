# TALA — Sample Conversations

These are illustrative transcripts showing the four loops in action. They
are written, not recorded — useful for reviewing expected behavior before
the first live mic test, and as a reference when writing eval prompts later.

---

## 1. Straightforward factual question (Planner -> Execution -> done, no repair needed)

> **Guest:** Hi, what time is breakfast po?
>
> **TALA:** *(calls `faq_lookup("what time is breakfast")`)*
> *(faq_entries match found)*
>
> **TALA:** Breakfast is served from 7 to 10 AM po, sa main dining area. Sabay
> tayo bukas? 😊

**Loop trace:** Planner → 1 tool call (`faq_lookup`) → result found, not empty
→ Verification passes (non-empty response, tool succeeded, no hallucination
markers) → spoken directly, no repair needed.

---

## 2. Multi-tool guest request (booking + ops write)

> **Guest:** Can you check if Seaside 2 is free this weekend, June 27 to 29?
> Also, our aircon in Mountainview has been making a weird noise since
> last night.
>
> **TALA:** *(calls `check_availability(check_in="2026-06-27", check_out="2026-06-29", unit_type="seaside")`)*
> *(calls `maintenance_request(unit_name="Mountainview", issue="AC making unusual noise since last night", urgent=False)`)*
>
> **TALA:** Good news po, Seaside 2 is open for June 27 to 29. I've also
> logged the aircon noise in Mountainview with our maintenance team — they
> should check it within a few hours. Let me know if it gets worse and I'll
> mark it urgent po.

**Loop trace:** Planner produces two tool calls in one turn → Execution runs
both → both succeed → Verification passes → single combined response.
`maintenance_request` insert lands in `resort_ops_tasks` with category
`maintenance`, visible on the staff dashboard immediately.

---

## 3. Hallucination-risk repair (model tries to answer without a tool)

> **Guest:** Do you guys have a kids' pool?
>
> **TALA (first attempt, internal — not spoken):** "We typically have family
> friendly facilities including a kids' pool area..."

*(Verification Loop flags this: factual question, zero tool calls, response
contains a hallucination marker — "typically." Repair Loop nudges: "Reminder:
you must base your answer only on tool results or known guest memory... or
say 'I'll check that for you po.'")*

> **TALA (repaired, actually spoken):** *(calls `faq_lookup("kids pool")`)*
> *(no FAQ match — empty result)*
>
> **TALA:** I'll check that for you po — let me confirm with our team and get
> back to you shortly.

**Loop trace:** Planner (attempt 1, bad) → Verification fails
(`HALLUCINATION_RISK`) → Repair nudges and forces a re-plan → Planner
(attempt 2) calls `faq_lookup` → empty result → TALA gives the honest
fallback line instead of guessing. 1 retry used, no escalation.

---

## 4. Tool failure + retry (Supabase hiccup)

> **Guest:** Is my room cleaned already? I'm in Cottage 1.
>
> **TALA (attempt 1):** *(calls `housekeeping_status(unit_name="Cottage 1")`)*
> *(Supabase connection timeout — `ToolResult.failure`)*

*(Verification Loop flags `TOOL_FAILED`. Repair Loop retries the exact same
tool call directly, attempt 2.)*

> **TALA (attempt 2, retried tool succeeds):**
> *(housekeeping_orders row found: status "in_progress")*
>
> **TALA:** Housekeeping is on it right now po for Cottage 1 — should be
> done within the next 20 to 30 minutes. I'll let them know you're asking!

**Loop trace:** Execution fails once due to a transient Supabase error →
Verification flags it → Repair retries the same tool call directly (not a
full re-plan, since we already know exactly which tool+args failed) →
success → response generated normally. 1 retry used.

---

## 5. Returning guest, memory-aware greeting

> *(Guest memory on file: preferred_name="Mae", dietary_restrictions=["no
> shellfish"], visit_count=3, favorite_activities=["island hopping"])*
>
> **Guest:** Hi TALA!
>
> **TALA:** Hi Mae, welcome back po! Third time na pala — excited ka ba for
> island hopping ulit this trip? Just let me know if you need anything, and
> don't worry, the kitchen already knows you're allergic sa shellfish.

**Loop trace:** No tool call needed for the greeting itself — guest memory
was injected into the system prompt at session start (not a runtime tool
call), so TALA references it naturally on the very first turn.

---

## 6. Maximum retries exceeded -> escalation

> **Guest:** Can you book me a table for 4 tonight at 7?
>
> *(Attempt 1: `create_task` fails — Supabase auth error)*
> *(Repair: retry attempt 2 — same error, Supabase project paused/network issue)*
> *(Repair: retry attempt 3 — same error)*
>
> **TALA:** I'm having a little trouble with that right now po. Let me get
> one of our team members to assist you directly — they'll follow up
> shortly.

**Loop trace:** 3 consecutive `TOOL_FAILED` retries, `MAX_RETRIES=3` reached
→ Repair Loop escalates → `tala_conversations.escalated = true`,
`escalation_reason = "tool_failed:create_task"` logged for staff review →
guest gets a clear, warm hand-off instead of a stuck loop or a fabricated
confirmation.

---

## 7. Speech transcription failure

> *(Guest speaks, but background noise/connection issue produces an empty
> or garbled transcript from whisper.cpp)*
>
> **TALA:** Sorry po, I didn't catch that clearly. Could you say that again?

**Loop trace:** `stt_failed=True` short-circuits straight to the Repair
Loop without attempting to plan against garbage text — cheapest possible
repair, no LLM call wasted.
