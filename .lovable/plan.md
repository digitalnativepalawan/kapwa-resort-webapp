# KAPWA Hospitality OS — workspace plan

## Reception luxury dashboard refactor

Restyle `src/pages/ReceptionPage.tsx` so its header, stat strip, and overview blocks visually match the uploaded KAPWA Hospitality OS reference. **No data, no routes, no hooks, no business logic touched.** Mobile-first stacked layout; desktop uses two-column where the reference shows side-by-side blocks.

## What changes

### 1. Header strip (top of page)
- Replace current `LuxuryHeader` with a two-column header:
  - **Left:** Eyebrow "Reception · KAPWA OS" in gold tracking, big serif `Good {timeOfDay}, {staffName} 👋`, sub "Here's what's happening at KAPWA OS."
  - **Right:** Glass pill containing weather placeholder (`Cloud` icon, `28°C`, `San Vicente, Palawan`) — static labels only, no new fetches.

### 2. Hero stat row — 4 glowing cards
Replace the existing 4-card grid (Occupied / To Clean / Ready / Occupancy) with **bordered glow cards** matching the reference:
- Card pattern per tile: `rounded-2xl border` with tone-tinted border + soft inner radial glow + huge serif numeral + label + small lucide icon bottom-right.
- Tones: Occupied → rose, To Clean → gold/amber, Ready → emerald, Occupancy% → teal/blue.
- Use existing semantic tokens (`--destructive`, `--gold`, `--emerald`, `--teal`) — add a new `.luxury-glow-card` utility in `index.css` that paints the radial halo so we avoid hex in JSX.

### 3. Mid strip — Arrivals / Departures / Revenue Today
A single `LuxuryCard` row with 3 columns:
- Arrivals Today (count + `Users` icon)
- Departures Today (count + `PlaneTakeoff` icon)
- Revenue Today (₱ value + tiny sparkline using existing `OccupancySparkline` if cheap; otherwise a static SVG line — no new data fetches).

Revenue value reuses whatever is currently available (already-rendered total) or shows `—` if not computed; we will not add a new query.

### 4. Two-column overview row
Side-by-side `LuxuryCard`s (stacks on mobile):
- **Housekeeping Overview** — donut chart (re-use counts from `occupiedUnits`, `toCleanUnits`, `readyUnits` already computed; render with a small inline SVG donut, no new dep) + legend.
- **Tasks & Alerts** — list rows for: Late Checkout count, Guest Requests (`pendingRequests.length`), Maintenance (placeholder 0). Reuses existing arrays only.

### 5. Recent Activity + Inspiration row
- **Recent Activity** card: last 3 items derived from already-loaded `bookings` / `todayDepartures` (no new query). Each row: icon, title, subtitle, relative time using existing `date-fns`.
- **Today's Inspiration** card: full-bleed ocean image (`public/` placeholder or existing asset) with serif tagline "Breathe in the ocean. Let hospitality flow naturally." Pure decoration.

### 6. Quick Access tiles
5 square tiles with colored glass icons (New Reservation, Walk-in Guest, Room Status, Reports, Inventory). Each tile is a `<button>` that triggers the **same handlers/navigation already wired** in the page (walk-in modal, calendar scroll, etc.). No new routes.

### 7. System Notice footer bar
Thin glass bar with bell icon + "Night Audit will run automatically at 11:59 PM." + "View all" link (no-op or scroll-to-top). Pure UI.

### 8. Keep below the fold
All existing operational sections (room cards, checkout flow, housekeeping tracker, calendar, modals) remain unchanged below the new dashboard hero. Only the top "summary" zone is restyled.

## Tokens / CSS

Add to `src/index.css` (semantic, no hex in components):
```css
.luxury-stat-glow-rose    { box-shadow: inset 0 0 60px -20px hsl(var(--destructive)/.35); }
.luxury-stat-glow-gold    { box-shadow: inset 0 0 60px -20px hsl(var(--gold)/.35); }
.luxury-stat-glow-emerald { box-shadow: inset 0 0 60px -20px hsl(var(--emerald)/.35); }
.luxury-stat-glow-teal    { box-shadow: inset 0 0 60px -20px hsl(var(--teal)/.35); }
```
Extend `LuxuryStatCard` with a `glow` prop (optional) that applies the matching class — backwards-compatible with current usages in AdminPage/ReportsDashboard.

## Out of scope
- No schema, RLS, edge function, or query changes.
- No new dependencies (donut + sparkline = inline SVG).
- No changes to modals, calendar, or any handler logic.
- Weather + revenue sparkline are visual placeholders only.

## Files touched
- `src/pages/ReceptionPage.tsx` — restyle top zone
- `src/components/luxury/index.tsx` — optional `glow` prop on `LuxuryStatCard`
- `src/index.css` — 4 glow utility classes
