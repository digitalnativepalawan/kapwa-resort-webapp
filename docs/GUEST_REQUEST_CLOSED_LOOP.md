# Guest Request Closed Loop

## Goal

A guest request must move from submission to confirmed completion without losing ownership between the backoffice and Telegram.

## Flow

1. A guest creates a record in `guest_requests` with status `pending`.
2. `concierge-ai` classifies the request and routes it to the correct Telegram department.
3. The Telegram message includes **Accept** and **Complete** buttons.
4. Accepting updates the request to `in_progress` and records the Telegram staff identity and assignment time.
5. Completing updates the request to `completed` and records who completed it and when.
6. Requests unaccepted for more than two hours become `escalated`, create a deduplicated management task, and notify the department plus managers.
7. Every Telegram action is written to the existing `audit_log`.

## Required deployment

Deploy these functions from the repository:

- `send-telegram`
- `telegram-webhook`
- `configure-telegram-webhook`
- `concierge-ai`

Apply migration:

- `20260712053000_close_guest_request_loop.sql`

Set secrets:

- `TELEGRAM_BOT_TOKEN`
- `INTERNAL_FN_SECRET`
- `TELEGRAM_WEBHOOK_SECRET`

After deployment, invoke `configure-telegram-webhook` once with the `x-internal-secret` header. It registers the hosted `telegram-webhook` endpoint with Telegram.

## Statuses

- `pending`: submitted but not routed
- `routed`: delivered to the correct Telegram department
- `in_progress`: accepted by staff
- `escalated`: unaccepted beyond the service threshold
- `completed`: confirmed complete by staff
- `cancelled`: closed without completion
