# F5 plan — Balances

_Status: Approved · Spec: `docs/specs/features/F5-balances.md` (Approved) · Last updated: 2026-11-05_

## Approach
Build the balance calculation first as a pure function over the trip's people, expenses and payments, all in whole cents, with fakes in the tests. Then the balances service, which takes the trip's data from a store, computes the balances, and refuses to return them if they do not add to exactly zero. The Prisma store reads one trip with its people, expenses and shares in a single ownership-checked query. The route sits behind `requireLogin`. The web screens come last: the label function ("is owed", "owes", "Settled"), the client, and the Balances section below Expenses on the trip page. Payments are not in the database until F6, so the store passes no payments for now, and F6 adds that query. The empty and error states (F5.AC10, F5.AC11) are built in the Balances section, with their own unit tests.

## Tasks
Each task is one commit. Its commit message starts with its ID, for example `F5.T1 <short title>`.

### F5.T1 — Balance function
- **Files:** `app/api/src/balances/balance.ts`, `app/api/src/balances/balance.test.ts`
- **Depends on:** none
- **Work:**
  - `computeBalances(people, expenses, payments)`: returns one `{ personId, balanceCents }` per person, in the order of `people` (trip order). Each balance = paid − shares + payments made − payments received (F5.R1). All values are integer cents.
  - `people` is an array of `{ id }` in position order. `expenses` is `{ payerId, amountCents, shares: { personId, shareCents }[] }[]`. `payments` is `{ payerId, payeeId, amountCents }[]`, passed in empty by the store until F6 adds payments.
  - `sumBalances(balances)`: returns the total in cents. The result must be zero for stored records (F5.R4).
  - Tests use fixed data only. The random-trip test uses a fixed seed, not `Math.random` or the clock.
- **Done when:** tests named `F5.AC1` (product.md §6 Example 1 gives +50.00, −10.00, −40.00), `F5.AC2` (total is zero for Example 1 and for a fixed set of generated trips), `F5.AC3` (Example 3 with Jo's payment to Sam gives Jo 0.00, Sam +10.00, Alex −10.00), `F5.AC6` (balances come back in the order of `people`), and `F5.AC7` (removing an expense changes the result) pass.
- **Covers:** F5.R1, F5.R4, F5.R5, F5.R7, F5.AC1, F5.AC2, F5.AC3, F5.AC6, F5.AC7

### F5.T2 — Balances service with fakes
- **Files:** `app/api/src/balances/types.ts`, `app/api/src/balances/service.ts`, `app/api/src/balances/service.test.ts`
- **Depends on:** F5.T1
- **Work:**
  - `BalancesStore` interface with `loadForOwner(ownerId, tripId)`. It returns `not-found`, or `{ people, expenses, payments }` for the trip.
  - `getBalances(ownerId, tripId)`: returns `unauthenticated` with no owner ID. Calls the store. Runs `computeBalances`. If `sumBalances` is not zero, returns `mismatch` and no balances (F5.R4 edge case). Otherwise returns rows `{ person_id, name, balance_cents }` in trip order.
  - `toHttpError`-style mapping lives in the route task (F5.T4).
- **Done when:** tests named `F5.AC2` (a fake store with records that do not add to zero returns `mismatch` and no rows) and `F5.AC6` (rows come back in trip order with names) pass with fakes.
- **Covers:** F5.R1, F5.R4, F5.R5, F5.AC2, F5.AC6

### F5.T3 — Prisma balances store
- **Files:** `app/api/src/balances/prisma-store.ts`
- **Depends on:** F5.T2, F4.T5 (expense and person models), F3.T3
- **Work:**
  - `loadForOwner`: one `trip.findFirst({ where: { id, ownerId }, include: { people: { orderBy: { position: "asc" } }, expenses: { include: { participants: true } } } })`. A missing or not-owned trip returns `not-found`. Payments are an empty array until F6.
  - Balances are not stored anywhere. Each read is computed from the records (F5.R7).
  - All queries use Prisma parameters only.
- **Done when:** the code review items below are checked, and `npm run typecheck` is clean. No unit test (needs a database).
- **Covers:** F5.R7, F5.R9

### F5.T4 — Balances route
- **Files:** `app/api/src/routes/balances.ts`, `app/api/src/routes/balances.test.ts`, `app/api/src/server.ts` (accepts an optional `balances` store, like F4.T7)
- **Depends on:** F5.T2, F5.T3, F4.T7 (server option pattern), F1.T8
- **Work:**
  - `GET /trips/:tripId/balances` behind `requireLogin`. The owner is always `request.userId`.
  - `not-found` → 404 `{ "error": "Trip not found." }`. `unauthenticated` → 401 `{ "error": "Log in required" }`.
  - `mismatch` → logs with `request.log.error({ tripId })` (no names, amounts or personal data) and returns 500 `{ "error": "Balances couldn't be loaded. Try again." }`. The error is not swallowed.
  - Route tests use `buildServer({ logger: false, balances: fake })` with `app.inject`.
- **Done when:** the route test named `F5.AC2` (a mismatch returns 500 and no balance rows) passes. The ownership 404 is checked in code review (F5.AC9), not by a route test.
- **Covers:** F5.R4, F5.R9, F5.AC2

### F5.T5 — Web balances API client
- **Files:** `app/web/src/balances/api.ts`, `app/web/src/balances/api.test.ts`
- **Depends on:** F5.T4 (contract), F4.T8 (client pattern)
- **Work:**
  - `getBalances(tripId)` calls `/api/trips/:tripId/balances`, returns `{ person_id, name, balance_cents }[]`.
  - A non-2xx response throws an error carrying the server's `error` text. Other failures throw a generic error.
- **Done when:** a test named `F5.R9` (a 404 "Trip not found." response is passed through) passes with a stubbed `fetch`. The ownership check itself stays a code review item (F5.AC9).
- **Covers:** F5.R9

### F5.T6 — Balance label function
- **Files:** `app/web/src/balances/label.ts`, `app/web/src/balances/label.test.ts`
- **Depends on:** none
- **Work:**
  - `balanceLabel(balanceCents)`: a positive value → `"is owed"` with the amount; a negative value → `"owes"` with the absolute amount; zero → `"Settled"` with no amount (F5.R2, F5.R3).
  - `formatAmount(cents)`: integer arithmetic only, two decimal places, no currency symbol (F5.R6). 1 cent → `"0.01"`.
  - Pure function, no network or DOM.
- **Done when:** tests named `F5.AC1` (a positive value reads "is owed 50.00" and a negative value reads "owes 10.00"), `F5.AC4` (zero reads "Settled" with no amount), and `F5.AC5` (1 cent reads "0.01" with the right label) pass.
- **Covers:** F5.R2, F5.R3, F5.R6, F5.AC1, F5.AC4, F5.AC5

### F5.T7 — Balances section on the trip page
- **Files:** `app/web/src/balances/BalancesSection.tsx`, `app/web/src/balances/BalancesSection.test.tsx`, `app/web/src/pages/TripPage.tsx` (adds the section below Expenses, F4.T10), `app/web/src/pages/TripPage.test.tsx`
- **Depends on:** F5.T5, F5.T6, F4.T10
- **Work:**
  - Loads balances with a loading state. Each row is one text element such as "Sam is owed 50.00", using `balanceLabel` (so the status is text, not colour alone).
  - Rows render in the order the API returns them (trip order).
  - The section has no button, input or other control that writes data (F5.R8).
  - With no people, shows "Add people to see balances." and no rows (F5.AC10).
  - When the request fails, or the server returns an error (including a total that is not zero, F5.AC11), shows "Balances couldn't be loaded. Try again." and no balance amounts.
- **Done when:** tests named `F5.AC6` (rows render in the given order), `F5.AC8` (the section has no control that writes data), `F5.AC10` (the empty-state message shows and no rows appear), and `F5.AC11` (the error message shows and no rows appear when the request fails) pass. The trip page shows the Balances section below Expenses.
- **Covers:** F5.R2, F5.R3, F5.R4, F5.R5, F5.R8, F5.AC6, F5.AC8, F5.AC10, F5.AC11

## Acceptance criteria map
Every AC in the spec appears once.

| AC | How it is checked | Test name(s) or review item | File |
|---|---|---|---|
| F5.AC1 | Unit test | `F5.AC1 gives +50.00, -10.00, -40.00 for Example 1` (balance); `F5.AC1 reads is owed and owes with the absolute amount` (label) | `app/api/src/balances/balance.test.ts`, `app/web/src/balances/label.test.ts` |
| F5.AC2 | Unit test | `F5.AC2 totals are zero for Example 1 and fixed generated trips` (balance); `F5.AC2 reports a mismatch instead of returning balances` (service); `F5.AC2 returns 500 and no rows when the total is not zero` (routes) | `balance.test.ts`, `app/api/src/balances/service.test.ts`, `app/api/src/routes/balances.test.ts` |
| F5.AC3 | Unit test | `F5.AC3 Example 3: Jo's payment to Sam leaves Jo at 0.00` | `balance.test.ts` |
| F5.AC4 | Unit test | `F5.AC4 zero reads Settled with no amount` | `app/web/src/balances/label.test.ts` |
| F5.AC5 | Unit test | `F5.AC5 formats 1 cent as 0.01 with the right label` | `label.test.ts` |
| F5.AC6 | Unit test | `F5.AC6 returns people in position order` (balance); `F5.AC6 rows come back in trip order with names` (service); `F5.AC6 renders rows in the order given` (section) | `balance.test.ts`, `service.test.ts`, `app/web/src/balances/BalancesSection.test.tsx` |
| F5.AC7 | Unit test | `F5.AC7 removing an expense changes the balances` | `balance.test.ts` |
| F5.AC8 | Unit test | `F5.AC8 has no control that writes data` | `BalancesSection.test.tsx` |
| F5.AC9 | Code review | The balances query checks trip ownership inside the `trip.findFirst` query (see checklist); another user's trip returns Not found (404) | — |
| F5.AC10 | Unit test | `F5.AC10 shows "Add people to see balances." and no rows when there are no people` | `app/web/src/balances/BalancesSection.test.tsx` |
| F5.AC11 | Unit test | `F5.AC11 shows "Balances couldn't be loaded. Try again." and no rows when the request fails` | `app/web/src/balances/BalancesSection.test.tsx` |

Count: 11 ACs in the spec, 11 rows here. 10 are unit tests and 1 is code review (F5.AC9).

## Build order
1. F5.T1 — Balance function
2. F5.T2 — Balances service with fakes (after T1)
3. F5.T3 — Prisma balances store (after T2; needs F4 tables)
4. F5.T4 — Balances route (after T2, T3)
5. F5.T5 — Web balances API client (after T4)
6. F5.T6 — Balance label function (no dependencies; can be built any time after F4)
7. F5.T7 — Balances section on the trip page (after T5, T6, F4.T10)

Cross-feature dependencies: **F1**, **F2**, **F3** and **F4** must be built first. **F6** must add payments: its store query adds `payments` to F5.T3's `loadForOwner` and passes them to `computeBalances`. Until then the balance includes no payments, which is correct because no payments can exist yet.

## Verification
- From `app/`: `npm run typecheck`, then `npm test`.
- Code review checklist (every AC marked "Code review" above, and the database rules behind the unit-tested ACs):
  - [ ] F5.AC9: `loadForOwner` uses `trip.findFirst({ where: { id, ownerId } })` in the same query that loads people and expenses. A not-owned trip returns Not found and no data. No query reads the owner from the request.
  - [ ] F5.R7: no migration in F5 and no balance column in any table (balances are computed on each read).
  - [ ] F5.R9: the balances route is behind `requireLogin`, and the owner comes from `request.userId`.
  - [ ] Logging: the mismatch log line contains the trip ID only, never names, amounts or any personal data (project rules).
  - [ ] Money: `computeBalances`, `sumBalances` and `formatAmount` use integer cents only (project rules).

## Decisions log
- 2026-11-05: Where is the balance function? → `app/api/src/balances/balance.ts`, a pure function over arrays of cents, so the calculation is unit tested with fakes (spec Data & contract, project rules).
- 2026-11-05: Where are the labels made? → In the web app (`label.ts`), because the spec says the display label is decided in the front end from the sign of `balance_cents`.
- 2026-11-05: Payments before F6. → The store passes no payments and `computeBalances` takes a `payments` array, so the payment term is tested now (F5.AC3) and F6 only adds the store query. This follows the spec's Dependencies section.
- 2026-11-05: One query for the trip, its people and its expenses. → `trip.findFirst` with nested includes, so the ownership check and the data read happen in one query (F5.AC9, F1.R10).
- 2026-11-05: Randomised test data uses a fixed seed. → Tests must not depend on the clock or random input (project rules).
- 2026-11-05: Mismatch handling. → The service returns `mismatch` and no rows, the route logs the trip ID and returns 500 with the spec's server error copy. The spec's edge case says the section is hidden and the error logged.
- 2026-11-05: The F5.AC9 ownership check is a code-review item, as the spec's test plan says. The route's 404 is checked by review too, not by a route test.
- 2026-11-05: Spec revised and approved (2026-11-05): added F5.AC10 (empty state) and F5.AC11 (error state), with their unit tests. Both copies were already confirmed in the spec's States table. F5.T7 now covers them, and the Sent back section is cleared.
- 2026-11-05: The web client's pass-through test (F5.T5) was named `F5.AC9`, but F5.AC9 is a code review item in the spec and the AC map. Renamed the test to `F5.R9` so AC9 is checked only by code review. Approach text no longer says the empty and error states are sent back, since F5.AC10 and F5.AC11 cover them.

## Sent back to the spec
None. The spec was revised and approved on 2026-11-05. The empty state (F5.AC10) and the error state (F5.AC11) are now covered by F5.T7.
