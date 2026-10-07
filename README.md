# KAPWA Hospitality OS

An open-source, AI-powered resort management platform built for boutique properties in the Philippines, running on a standalone **Node.js/Express + Neon PostgreSQL + React/Vite/TypeScript** stack.

---

## 1. Complete Repository Code Tree

```text
kapwa-resort-webapp/
├── .env.example                                  # Environment configuration template (Neon DB, Auth, AI Gateway)
├── NEON_SETUP.md                                 # Step-by-step Neon PostgreSQL setup & migration guide
├── SECURITY_GATE.md                              # Security & RBAC verification checklist
├── package.json                                  # Project manifest & scripts (dev, server, db:migrate, build, test)
├── vite.config.ts                                # Vite dev server (0.0.0.0:8080) with /api & /functions/v1 proxy to :3000
├── vitest.config.ts                              # Vitest test runner configuration
├── tailwind.config.ts                            # Tailwind CSS theme & luxury resort design tokens
│
├── db/                                           # Standalone Neon PostgreSQL Database Layer
│   ├── schema.sql                                # Consolidated 73-table PostgreSQL schema, enums, triggers & decrement_stock RPC
│   ├── permissions.sql                           # Session-variable RBAC functions (is_staff, is_admin, has_permission) & employees_public view
│   └── migrate.js                                # Node.js migration runner (`npm run db:migrate`)
│
├── server/                                       # Standalone Node.js + Express Backend (Port 3000)
│   ├── index.js                                  # Main Express API server, route mounting & 07:00/19:00 cron scheduler
│   ├── package.json                              # Backend module manifest
│   ├── guest-concierge-system-prompt.md          # Canonical TALA Guest Concierge system prompt
│   ├── db/
│   │   └── adapter.js                            # Dual-mode Neon PostgreSQL (pg.Pool) + embedded JSON store relational engine
│   ├── middleware/
│   │   └── permissions.js                        # Crown-Jewel RBAC enforcement & sensitive column sanitization
│   ├── operator/                                 # Autonomous Resort Operator Runtime (9 Operational Domains)
│   │   ├── system-map.js                         # Authoritative domains, tables, tools & FORBIDDEN_WITHOUT_APPROVAL list
│   │   ├── state.js                              # Unified live resort state loader (loadResortState)
│   │   ├── planner.js                            # Deterministic 9-domain planner (plan)
│   │   ├── executor.js                           # Case executor, database verifiers (VERIFIERS) & approval gate (execute, decideCase)
│   │   ├── cases.js                              # Case lifecycle helpers (openCase, resolveCase, escalateCase, appendHistory)
│   │   └── brain.js                              # LLM triage & manager Q&A (triageCase, askAgent)
│   ├── services/
│   │   ├── auth.js                               # Independent PBKDF2-SHA256 PIN + HS256 JWT staff auth & brute-force rate limiter
│   │   ├── functions.js                          # Native Node/Express dispatcher for all 24 operational, AI & webhook functions
│   │   ├── guestTools.js                         # 20 live resort tools + intent detector for TALA Guest Concierge
│   │   ├── modelGateway.js                       # Unified OpenRouter & Ollama model gateway (resolveModelConfig, callModel, callModelWithTools)
│   │   ├── realtime.js                           # Server-Sent Events (SSE) realtime hub (/api/realtime) broadcasting postgres_changes
│   │   └── storage.js                            # Independent bucket storage service (/api/storage/:bucket/*)
│   ├── agent/
│   │   └── resort-operator.js                    # Scheduled morning/evening operator brief & action runner
│   └── lib/
│       └── model-runtime.js                      # AES-256-GCM secret helpers & local/cloud model caller
│
├── src/                                          # React 18 + TypeScript Frontend (Port 8080)
│   ├── App.tsx                                   # Application router (25 routes with RequireAuth permission guards)
│   ├── main.tsx                                  # React root mount
│   ├── index.css                                 # Global styles & design system variables
│   ├── reception-enhancements.css                # Reception calendar & timeline styles
│   │
│   ├── pages/                                    # 25 Route Pages
│   │   ├── Index.tsx                             # Role selector (Guest / Staff / Admin) & PIN login screen
│   │   ├── GuestPortal.tsx                       # Self-service Guest Portal (Bill, Food Ordering, Tours, Requests, TALA Chat)
│   │   ├── StaffShell.tsx                        # Authenticated staff workspace shell with dynamic department tabs
│   │   ├── AdminPage.tsx                         # Back-office Admin Console (Rooms, Menu, Inventory, Payroll, P&L, RBAC, Settings)
│   │   ├── ResortOperatorPage.tsx                # AI Resort Operator Command Center (Cases, Approvals, Briefs, Manager Q&A)
│   │   ├── BotSettingsPage.tsx                   # AI Model Gateway Config (OpenRouter model browser/refresh, Ollama, FAQ memory)
│   │   ├── ReceptionPage.tsx                     # Front-desk Reception Console (Arrivals, Departures, Calendar, Room Folios)
│   │   ├── KitchenPage.tsx                       # Kitchen Display System (KDS)
│   │   ├── BarPage.tsx                           # Bar Order Display System
│   │   ├── HousekeeperPage.tsx                   # Housekeeping & Room Turnover Board
│   │   ├── ExperiencesPage.tsx                   # Tours, Transport & Rentals Management
│   │   ├── MaintenancePage.tsx                   # Maintenance & Engineering Task Board
│   │   ├── ManagerPage.tsx                       # Daily Operations & Shift Manager View
│   │   ├── EmployeePage.tsx                      # Staff Member Personal View
│   │   ├── EmployeePortal.tsx                    # Employee Clock-In/Out, Schedule, Tasks & Payroll Portal
│   │   ├── OrderType.tsx                         # POS Order Type Selector (Room Service, Dine-In, Walk-In)
│   │   ├── MenuPage.tsx                          # Interactive Digital F&B Menu & Cart
│   │   ├── ServiceModePage.tsx                   # Department Service Terminal Selector
│   │   ├── ServiceKitchenPage.tsx                # Dedicated Kitchen Terminal
│   │   ├── ServiceBarPage.tsx                    # Dedicated Bar Terminal
│   │   ├── ServiceCashierPage.tsx                # Dedicated Cashier & Tab Settlement Terminal
│   │   ├── ServiceReceptionPage.tsx              # Dedicated Reception Terminal
│   │   ├── ServiceToursPage.tsx                  # Dedicated Tours Terminal
│   │   ├── ServiceWaitstaffPage.tsx              # Dedicated Waitstaff Order Terminal
│   │   └── NotFound.tsx                          # 404 fallback page
│   │
│   ├── components/                               # Domain UI Components
│   │   ├── OperatorChat.tsx                      # Interactive AI Resort Operator chat widget
│   │   ├── MorningBriefing.tsx                   # AI Ops Coordinator Morning/Evening Brief & Action Approval panel
│   │   ├── CartDrawer.tsx                        # F&B order cart, stock check & kitchen/bar dispatch
│   │   ├── DepartmentOrdersView.tsx              # Real-time department order queue
│   │   ├── RequireAuth.tsx                       # Route-level JWT & permission guard
│   │   ├── StaffNavBar.tsx                       # Staff navigation bar with live department alert badges
│   │   ├── QueryErrorBanner.tsx                  # Database query error diagnostics banner
│   │   ├── ThemeToggle.tsx                       # Dark/light theme switcher
│   │   ├── admin/                                # 36 Admin Back-Office Components
│   │   │   ├── AccountingExport.tsx              # BIR-ready accounting & VAT CSV export
│   │   │   ├── AdminLoginGate.tsx                # Admin PIN verification gate
│   │   │   ├── AuditLogView.tsx                  # Immutable system audit trail viewer
│   │   │   ├── AuthDiagnostics.tsx               # Staff JWT & Crown-Jewel RBAC live probe dashboard
│   │   │   ├── BillingConfigForm.tsx             # VAT, service charge & city tax configuration
│   │   │   ├── DeviceManager.tsx                 # POS & terminal device registry
│   │   │   ├── EditableRow.tsx                   # Inline table row editor
│   │   │   ├── EmployeeContactConfig.tsx         # Staff WhatsApp & Messenger contact routing
│   │   │   ├── ExpenseBulkImportModal.tsx        # Receipt OCR (OpenRouter Vision) & bulk expense importer
│   │   │   ├── ExpenseReportsModal.tsx           # Categorized expense analytics
│   │   │   ├── GuestPaymentSettingsForm.tsx      # GCash, QRPh & Stripe payment settings
│   │   │   ├── GuestPaymentVerification.tsx      # Guest payment proof verification queue
│   │   │   ├── GuestPortalConfig.tsx             # Guest portal feature toggles & resort info
│   │   │   ├── HousekeepingConfig.tsx            # Cleaning packages & checklist builder
│   │   │   ├── HousekeepingInspection.tsx        # Supervisor room inspection sign-off
│   │   │   ├── HousekeepingPerformance.tsx       # Turnaround time & staff housekeeping metrics
│   │   │   ├── ITNotesSection.tsx                # Internal IT & infrastructure runbook notes
│   │   │   ├── ImportReservationsModal.tsx       # CSV/OTA reservation bulk importer
│   │   │   ├── InventoryDashboard.tsx            # Ingredient stock levels, thresholds & restock logs
│   │   │   ├── InvoiceSettingsForm.tsx           # Official invoice header, TIN & footer config
│   │   │   ├── LiveOpsDashboard.tsx              # Live occupancy, arrivals, departures, 7-day forecast & guest search
│   │   │   ├── MenuBulkImportModal.tsx           # Menu item & category bulk importer
│   │   │   ├── OpsCasesPanel.tsx                 # Autonomous Resort Operator open cases & approval queue
│   │   │   ├── OrderArchive.tsx                  # Historical F&B order archive
│   │   │   ├── OrderCard.tsx                     # Order card with status transitions
│   │   │   ├── PayrollDashboard.tsx              # Staff payroll computation, bonuses & payment records
│   │   │   ├── RecipeEditor.tsx                  # Menu item recipe-to-ingredient mapping for auto stock deduction
│   │   │   ├── ReportsDashboard.tsx              # Revenue, F&B, occupancy & payment method analytics
│   │   │   ├── ResortOperatorLauncher.tsx        # Quick launcher for Resort Operator cycles
│   │   │   ├── ResortOpsDashboard.tsx            # Property-wide bookings, units, tasks & expenses manager
│   │   │   ├── ResortOpsPnLReport.tsx            # Monthly Profit & Loss (P&L) statement generator
│   │   │   ├── ResortProfileForm.tsx             # Resort branding, logo upload & contact details
│   │   │   ├── RoomSetup.tsx                     # Room types, rates & unit configuration
│   │   │   ├── RoomsDashboard.tsx                # Live unit status & room folio grid
│   │   │   ├── SetupExportCard.tsx               # Configuration snapshot exporter
│   │   │   ├── SetupImportCard.tsx               # Configuration snapshot importer
│   │   │   ├── StaffAccessManager.tsx            # Employee creation, PIN assignment & granular RBAC matrix
│   │   │   ├── SwarmControl.tsx                  # Multi-agent orchestration control panel
│   │   │   ├── TabInvoice.tsx                    # Printable walk-in / bar tab invoice
│   │   │   ├── TimePicker.tsx                    # Shift & pickup time selector
│   │   │   ├── TimesheetDashboard.tsx            # Employee attendance & hours review
│   │   │   ├── WebhookSettings.tsx               # Sirvoy PMS webhook health check & test harness
│   │   │   ├── WeeklyScheduleManager.tsx         # Staff weekly shift roster builder
│   │   │   ├── tools/PostModal.tsx               # Social media content generator modal
│   │   │   └── vibe/                             # Resort vibe & event check-in components
│   │   ├── reception/                            # Front-Desk Components
│   │   │   ├── ReceptionCalendar.tsx             # Interactive multi-week Gantt room booking calendar
│   │   │   ├── AddReservationModal.tsx           # New booking & walk-in check-in modal
│   │   │   ├── ConflictModal.tsx                 # Room double-booking & overlap resolver
│   │   │   ├── PendingCharges.tsx                # Unpaid room charges & folio settlement queue
│   │   │   └── calendarUtils.ts                  # Date & occupancy grid math
│   │   ├── rooms/                                # Room Folio & Checkout Components
│   │   │   ├── RoomBillingTab.tsx                # Live room ledger (room rate, F&B, tours, payments, adjustments)
│   │   │   ├── CheckoutModal.tsx                 # Final settlement, invoice generation & housekeeping trigger
│   │   │   ├── AddPaymentModal.tsx               # Payment recording modal
│   │   │   ├── AdjustmentModal.tsx               # Charge/discount adjustment modal with audit logging
│   │   │   ├── ClosedCheckoutsPanel.tsx          # Historical checked-out folios
│   │   │   ├── EditGuestModal.tsx                # Guest profile & document uploader
│   │   │   ├── EditRequestModal.tsx              # Guest request editor
│   │   │   ├── EditTourModal.tsx                 # Tour/transport booking editor
│   │   │   ├── GuestActivityTimeline.tsx         # Unified timeline of guest stay events
│   │   │   ├── HousekeeperPickerModal.tsx        # Assign housekeeper to room turnover
│   │   │   └── PrintBill.tsx                     # Printable guest folio statement
│   │   ├── service/                              # F&B, Cashier & Tours Terminals
│   │   │   ├── ServiceBoard.tsx                  # Real-time Kitchen/Bar ticket board
│   │   │   ├── CashierBoard.tsx                  # Open tabs, room charges & POS settlement board
│   │   │   ├── CashierReceipt.tsx                # Thermal/printable POS receipt
│   │   │   ├── WaitstaffBoard.tsx                # Table & beach service order board
│   │   │   ├── ToursBoard.tsx                    # Daily tour & transport dispatch board
│   │   │   ├── ServiceHeader.tsx                 # Service terminal header & shift controls
│   │   │   ├── ServiceOrderCard.tsx              # Ticket card with prep timer
│   │   │   └── ServiceOrderDetail.tsx            # Detailed ticket modal
│   │   ├── staff/                                # Department Home Views
│   │   │   ├── ActionRequiredPanel.tsx           # Urgent cross-department alerts
│   │   │   ├── ReceptionHome.tsx                 # Receptionist shift dashboard
│   │   │   ├── HousekeepingHome.tsx              # Housekeeper shift dashboard
│   │   │   ├── KitchenHome.tsx                   # Kitchen staff shift dashboard
│   │   │   ├── BarHome.tsx                       # Bar staff shift dashboard
│   │   │   ├── ExperiencesHome.tsx               # Tours & experiences shift dashboard
│   │   │   ├── MaintenanceHome.tsx               # Maintenance shift dashboard
│   │   │   ├── StaffOrderHome.tsx                # Waitstaff POS order entry
│   │   │   └── StaffOrdersView.tsx               # Active staff orders tracker
│   │   ├── employee/                             # Employee Self-Service Components
│   │   │   ├── EmployeeScheduleView.tsx          # Personal weekly shift view
│   │   │   ├── EmployeeTaskList.tsx              # Assigned tasks & checklists
│   │   │   ├── TaskCommentThread.tsx             # Task discussion & updates
│   │   │   ├── TaskCompletionPanel.tsx           # Task sign-off & photo proof
│   │   │   ├── TaskDetailSheet.tsx               # Slide-over task drawer
│   │   │   └── TaskDetailsModal.tsx              # Task detail modal
│   │   ├── guest/                                # Guest Portal Components
│   │   │   ├── TalaConcierge.tsx                 # TALA AI Concierge chat interface with action confirmation
│   │   │   └── GuestPaymentSection.tsx           # Self-service bill review, GCash/QRPh & proof upload
│   │   ├── integration/
│   │   │   └── IntegrationReadinessDashboard.tsx # Webhook queue inspector & retry processor
│   │   └── ui/                                   # 49 shadcn/ui Radix primitives
│   │
│   ├── hooks/                                    # Custom React Hooks
│   │   ├── useDepartmentAlerts.ts                # Live SSE-driven badge counts for Kitchen, Bar, Reception, Tours, HK
│   │   ├── useGuestSession.ts                    # Guest portal booking & room session hook
│   │   ├── usePermissions.ts                     # Staff RBAC permission evaluation hook
│   │   ├── useResortProfile.ts                   # Resort branding & profile query hook
│   │   ├── useRoomTransactions.ts                # Room ledger transactions & balance calculator
│   │   ├── useBillingConfig.ts                   # Tax & service charge config hook
│   │   ├── useInvoiceSettings.ts                 # Invoice template config hook
│   │   ├── usePaymentMethods.ts                  # Active payment methods hook
│   │   ├── usePayrollSettings.ts                 # Payroll settings hook
│   │   ├── useAppOptions.ts                      # Dynamic app dropdown options hook
│   │   └── useTheme.tsx                          # Theme provider hook
│   │
│   ├── lib/                                      # Core Client Libraries & Unit Tests
│   │   ├── kapwaClient.ts                        # Standalone KAPWA Client (DB query builder, RPC, Functions, Storage, SSE Realtime)
│   │   ├── staffAuth.ts                          # HS256 JWT claim decoder, identity resolver & /api/auth/probe client
│   │   ├── staffAuth.test.ts                     # Unit tests for JWT claim resolution & privilege escalation defense
│   │   ├── edgeFunctions.ts                      # Authoritative registry & access classification of all 24 functions
│   │   ├── edgeFunctions.test.ts                 # Contract tests verifying function classification & security guards
│   │   ├── standaloneKapwa.test.ts               # Integration tests for Resort Operator loop, PBKDF2/JWT Auth & RBAC
│   │   ├── permissions.ts                        # Granular view/edit/manage RBAC permission helpers
│   │   ├── session.ts                            # Staff session persistence (sessionStorage / localStorage)
│   │   ├── getHomeRoute.ts                       # Role-based post-login landing route resolver
│   │   ├── getHomeRoute.test.ts                  # Unit tests for post-login routing
│   │   ├── inventoryDeduction.ts                 # Automatic recipe ingredient stock deduction & restock via decrement_stock RPC
│   │   ├── stockCheck.ts                         # Pre-order ingredient availability checker
│   │   ├── auditLog.ts                           # Helper for recording staff actions to audit_log
│   │   ├── generateInvoicePdf.ts                 # Client-side PDF invoice generator (jspdf + html2canvas)
│   │   ├── telegram.ts                           # Department Telegram notification dispatcher
│   │   ├── messenger.ts                          # WhatsApp / Messenger deep-link builder
│   │   ├── agentRuntime.ts                       # Client helper for /api/agent/* endpoints
│   │   ├── receptionOccupancy.ts                 # Occupancy & availability calculation engine
│   │   ├── groupOrders.ts                        # Kitchen/Bar order grouping utility
│   │   ├── order.ts                              # Order total, service charge & VAT calculator
│   │   ├── cart.ts                               # Zustand cart store
│   │   └── imageCompress.ts                      # Client-side receipt/photo compression before upload
│   │
│   └── types/
│       └── database.ts                           # Full TypeScript schema definitions for all tables
│
├── voice-agent/                                  # Python LiveKit Voice AI Agent (TALA Voice)
│   ├── docker-compose.yml                        # Multi-container orchestration (Voice Agent + Token Server + PWA)
│   ├── agent/
│   │   ├── main.py                               # LiveKit worker entrypoint
│   │   ├── livekit_agent.py                      # Deepgram STT + OpenAI LLM + ElevenLabs TTS voice pipeline
│   │   ├── orchestrator.py                       # Multi-step tool execution orchestrator
│   │   ├── persona.py                            # TALA Taglish warm hospitality voice persona
│   │   ├── config.py                             # Environment loader (KAPWA_API_URL, DATABASE_URL, LiveKit keys)
│   │   ├── kapwa_client.py                       # Standalone KAPWA HTTP/Neon query client
│   │   ├── tool_registry.py                      # Voice tool registration
│   │   ├── token_server.py                       # LiveKit room token issuer
│   │   ├── loops/                                # Planner, execution, verification & repair loops
│   │   ├── memory/guest_memory.py                # Persistent guest preference & conversation memory
│   │   └── tools/                                # Voice tools (booking_tools, discovery_tools, info_tools, ops_tools)
│   └── frontend/                                 # Standalone Voice Concierge Web/PWA client
│
└── docs/                                         # Architecture & Security Documentation
    ├── RESORT_OPERATOR_RUNTIME.md                # Resort Operator architecture & verification loop specification
    ├── RESORT_OPERATOR_SETUP.md                  # Operator setup & configuration guide
    ├── GUEST_REQUEST_CLOSED_LOOP.md              # End-to-end guest request lifecycle documentation
    ├── KAPWA-OS-COMMERCIAL-PILOT-PLAN.md         # Multi-tenant commercial pilot architecture
    └── security/                                 # RBAC & Crown-Jewel security specifications
```

---

## 2. Backend API & Endpoint Reference (`server/index.js`)

### Core Infrastructure Endpoints

| Method & Path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | Public | Returns server status, active AI provider, and database connection state (`neon-postgres` or `embedded-store`) |
| `GET /api/auth/probe` | Staff JWT | Cryptographically verifies the caller's `Authorization: Bearer <token>` HS256 signature and returns decoded claims (`200`) or `401` |
| `POST /api/db` | Public / Staff JWT / Internal | Executes structured relational queries (`select`, `insert`, `update`, `upsert`, `delete`) with foreign-key joins, Crown-Jewel RBAC enforcement, column sanitization, and live SSE mutation broadcast |
| `POST /api/rpc/:fnName` | Public / Staff JWT | Executes PostgreSQL stored functions (e.g., `decrement_stock({ p_ingredient_id, p_amount })`) |
| `GET /api/realtime` | Public | Server-Sent Events (SSE) stream broadcasting real-time `postgres_changes` (`INSERT`, `UPDATE`, `DELETE`) across all resort terminals |
| `POST /api/storage/:bucket/upload` | Staff / Guest | Uploads Base64-encoded files into `receipts`, `logos`, or `guest-documents` buckets |
| `POST /api/storage/:bucket/remove` | Staff / Guest | Deletes one or more objects from a storage bucket |
| `GET /api/storage/public/:bucket/*objectPath` | Public | Serves stored files with appropriate `Content-Type` and cache headers |

### 24 Standalone Service Functions (`/api/functions/:name` & `/functions/v1/:name`)

| Function Name | Access Class | Description |
|---|---|---|
| `employee-auth` | `public` | Staff & Admin authentication (`verify`, `admin-verify`, `set-password`, `change-pin`). Hashes PINs with PBKDF2-SHA256 (100k iterations), enforces brute-force lockout (5 attempts / 5 min), and mints 8-hour HS256 JWTs |
| `guest-chat` | `public` | **TALA Guest Concierge** endpoint. Loads verified booking context, checks FAQ memory, runs OpenRouter/Ollama tool-calling across 20 live resort tools, and enforces guest confirmation on all write/spend tools |
| `resort-operator` | `staff` (Admin) | **Autonomous Resort Operator** endpoint (`cycle`, `state`, `decide`, `ask`). Loads unified state across 9 domains, plans actions, executes/verifies cases against the database, and answers manager questions |
| `resort-operator-execute` | `staff` (Admin) | Executes manager-approved operator actions (`CREATE_HOUSEKEEPING_ORDER`, `ESCALATE_GUEST_REQUEST`, `CREATE_TASK`) with idempotency checks and `audit_log` recording |
| `ops-coordinator` | `staff` (Admin) | Generates `morning`, `evening`, or `daily` operational briefings with occupancy, arrivals, departures, unpaid balances, housekeeping, F&B revenue, and proposed actions |
| `resort-agent-loop` | `staff` (Admin) | Master multi-agent orchestrator that runs `ops-coordinator`, `concierge-ai`, `reservations-ai`, and `resort-operator` in a single coordinated cycle |
| `scan-receipt` | `staff` | Extracts Philippine BIR receipt/invoice fields (Supplier, TIN, 12% VAT breakdown, SI#/OR#, total) from receipt images using OpenRouter Vision |
| `send-telegram` | `staff` | Dispatches formatted HTML alerts and interactive inline keyboards to department Telegram groups (`kitchen`, `bar`, `tours`, `housekeeping`, `reception`, `managers`, `waitstaff`) |
| `today-ops` | `staff` | Live snapshot of today's arrivals, departures, occupied/available/dirty units, pending F&B orders, and unpaid balances |
| `forecast-7day` | `staff` | 7-day rolling occupancy %, expected daily room revenue, arrival/departure breakdowns, and capacity alerts |
| `guest-search` | `staff` | Searches `resort_ops_guests` by name and aggregates stay history, total spend, and outstanding balances |
| `frontdesk-today` | `staff` | Front-desk summary of arrivals, departures, in-house guests, and room readiness counts |
| `housekeeping` | `staff` | Active housekeeping orders with assigned cleaner and damage/cleaning notes |
| `orders-today` | `staff` | Today's active F&B orders (`New`, `Preparing`, `Served`) with room/table location |
| `tours-today` | `staff` | Today's scheduled tours with pickup times and captain/guide status |
| `concierge-ai` | `internal` | Triages open guest requests, routes to departments, and flags SLA breaches |
| `reservations-ai` | `internal` | Audits `resort_ops_bookings` for unassigned rooms and reservation anomalies |
| `admin-summary` | `internal` | Aggregates today's closed F&B revenue, unpaid room balances, and occupancy rate |
| `guest-requests-api` | `internal` | Internal feed of open guest requests with priority calculation |
| `guest-whatsapp` | `internal` | Outbound WhatsApp bridge connector for automated payment reminders |
| `sirvoy-webhook` | `webhook` | Ingests live Sirvoy PMS booking webhooks (`new`, `modified`, `restored`, `canceled`) and syncs guests, units, and bookings |
| `integration-webhook` | `webhook` | Queues external OTA/PMS webhook payloads into `webhook_events` with idempotency protection |
| `process-webhook-queue` | `internal` | Processes queued `webhook_events` (`new_reservation`, `date_change`, `cancellation`) with 3-attempt retry logic |
| `telegram-webhook` / `configure-telegram-webhook` | `webhook` / `internal` | Handles interactive Telegram staff button callbacks (Accept, Complete, Confirm) |

---

## 3. AI Agents Architecture

1. **Autonomous Resort Operator (`server/operator/`)**
   - **State (`state.js`)**: Queries 11 operational tables in parallel (`resort_ops_bookings`, `guest_requests`, `housekeeping_orders`, `resort_ops_tasks`, `tabs`, `webhook_events`, `ops_cases`, `tour_bookings`, `orders`, `units`) to build a unified snapshot.
   - **Planner (`planner.js`)**: Deterministic rule engine covering **9 domains**: `guest_request`, `unpaid_balance`, `housekeeping`, `maintenance`, `reservation_exception`, `arrival`, `tour`, `fnb`, and `integration`.
   - **Brain (`brain.js`)**: Uses OpenRouter/Ollama (`resolveModelConfig(db, 'operator')`) to refine case priority, write a concise manager explanation, and answer free-form operational questions (`action: 'ask'`). Never blocks the loop if the LLM is offline.
   - **Executor & Verifier (`executor.js`)**: Opens/updates `ops_cases`, enforces the hard approval boundary (`FORBIDDEN_WITHOUT_APPROVAL`: `modify_folio`, `issue_refund`, `cancel_booking`, `override_price`, `delete_guest_data`, `mark_paid_without_evidence`), and runs 9 database verifiers (`VERIFIERS`) so cases only resolve when confirmed by real database state.
2. **TALA Guest Concierge (`server/services/functions.js` & `server/services/guestTools.js`)**
   - **20 Live Tools**:
     - *Read tools (instant execution)*: `menu_lookup`, `room_bill`, `room_status`, `order_status`, `tour_status`, `guest_request_status`, `check_availability`, `weather_lookup`, `find_events`, `housekeeping_status`, `faq_lookup`, `today_arrivals`, `today_departures`, `guest_notes`.
     - *Write/Spend tools (two-step proposal → guest confirmation)*: `order_food`, `book_tour`, `extend_booking`, `request_transport`, `request_rental`, `create_guest_request`.
   - **Fallback Resilience**: Automatically falls back to deterministic keyword intent detection (`detectIntent`) or staff-approved FAQ memory (`guest_faq_memory`) if a model does not support tool calling or if no API key is configured.
3. **Ops Coordinator (`ops-coordinator` in `server/services/functions.js`)**
   -Synthesizes morning, evening, and daily executive briefings in Philippine Peso (`₱`) and proposes one-click actions (`escalate_guest_request`, `create_task`, `create_housekeeping_order`).
4. **TALA Voice Agent (`voice-agent/agent/`)**
   - Real-time WebRTC voice concierge built on LiveKit Agents, Deepgram Nova-2 STT, OpenAI GPT-4o, and ElevenLabs Turbo v2.5 TTS, connected to the KAPWA backend via `voice-agent/agent/kapwa_client.py`.

---

## 4. Quick Start

```sh
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Set DATABASE_URL in .env for Neon PostgreSQL (or leave blank to use the embedded local store)

# 3. Apply database schema to Neon PostgreSQL (when DATABASE_URL is set)
npm run db:migrate

# 4. Run Backend (Port 3000) & Frontend (Port 8080)
npm run server
npm run dev
```

### Default Local Test Credentials (Embedded Store Mode)
- **Admin**: Name `David` · PIN `5309` (or click **Enter as Admin** on the login screen)
- **Staff (Reception/Rooms/Orders)**: Name `Maria` · PIN `1234`

## Testing & Verification

```sh
npm test          # Runs all 38 Vitest unit & operator loop tests
npm run build     # Runs production TypeScript & Vite build check
```
