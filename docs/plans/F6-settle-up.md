# F6 plan — Settle up

_Status: Approved · Spec: `docs/specs/features/F6-settle-up.md` (Approved) · Last updated: 2026-11-05_

## Approach
Build the payment table and its constraints first, then the pure suggestion function (fewest payments, with the R2 tie-break and the R14 display order), tested with fakes. The suggestion read and the mark-as-paid service come next, each with a fake store; the mark-as-paid check runs inside the same database transaction as the write, so a stale suggestion cannot be recorded. Then the Prisma store, the HTTP routes, the web client, and the Settle up section on the trip page. The exact-minimum calculation must be timed before it is trusted; that measurement is part of the suggestion task. The gap found earlier (confirmed copy states with no acceptance criteria) is resolved: F6.AC15 to F6.AC18 cover them in F6.T15. The suggestions response is now `{ has_expenses, suggestions }`, so the client can choose the empty-state message.

## Tasks
Each task is one commit. Its commit message starts with its ID, for example `F6.T1 <short title>`.

### F6.T1 — Payments in the balance tests
- **Files:** `app/api/src/balances/balance.test.ts` (F5.T1 file; tests only, no code change)
- **Depends on:** F5.T1
- **Work:**
  - Add a test with fake data where every suggested payment has been marked paid, so the payments zero every balance (F6.R10).
  - Add a test over generated trips with random payments, using a fixed seed, that the balances total zero (F6.R9).
- **Done when:** tests named `F6.AC9` and `F6.AC10` pass with `npm test -w api`.
- **Covers:** F6.R9, F6.R10, F6.AC9, F6.AC10

### F6.T2 — Payment table and migration
- **Files:** `app/api/prisma/schema.prisma`, a new migration under `app/api/prisma/migrations/` (generated, then reviewed)
- **Depends on:** F2.T3 (Trip), F3.T3 (Person), F4.T4 (expense tables and their migration pattern)
- **Work:**
  - `Payment` model: `id`, `tripId` (references Trip, `onDelete: Cascade`), `payerId` and `payeeId` (reference Person, `onDelete: Restrict`, so F3.R4 blocks removal of a person in a payment), `amountCents` (Int), `createdAt` (UTC, default now).
  - The two CHECK constraints (`payer_id <> payee_id`, `amount_cents > 0`) go into the migration SQL, since the Prisma schema does not express them.
  - Add the `Payment` relations to Trip and Person. Generate the Prisma client.
- **Done when:** `npm run db:generate` and `npm run typecheck` are clean. A person reviews and approves the migration before it is applied to any shared database (CLAUDE.md). Code review item F6.AC12 is checked (see the checklist).
- **Covers:** F6.R12, F6.R13 (cascade from trip), F3.R4 (payer and payee references), F6.AC12

### F6.T3 — Payment store: balances, list and delete
- **Files:** `app/api/src/payments/prisma-store.ts`, `app/api/src/balances/prisma-store.ts` (F5.T3 file; adds payments)
- **Depends on:** F6.T2, F5.T3
- **Work:**
  - In F5's `loadForOwner`, add `payments: true` to the same `trip.findFirst({ where: { id, ownerId } })` query, and pass the rows to `computeBalances` in place of the empty array (F6.R9).
  - `listForOwner`: one `findMany` with `where: { tripId, trip: { ownerId } }`, `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, including payer and payee names. Newest first (spec Decisions log, 2026-11-04).
  - `deleteForOwner`: in one `db.$transaction`, `payment.findFirst({ where: { id, trip: { ownerId } } })`; missing → `not-found`; otherwise `delete`.
  - All queries use Prisma parameters only.
- **Done when:** the code review items below are checked, and `npm run typecheck` is clean. No unit test (needs a database).
- **Covers:** F6.R9, F6.R11, F6.R7 (delete path), F6.AC11 (delete and list parts)

### F6.T4 — Trip delete removes payments first
- **Files:** `app/api/src/trips/prisma-store.ts` (changed in F3.T5 and F4.T6)
- **Depends on:** F6.T3, F4.T6
- **Work:**
  - In the existing `deleteForOwner` transaction, delete the trip's payments before its expenses and people: `payment.deleteMany({ where: { tripId, trip: { ownerId } } })`. Payment rows refer to people with `Restrict`, so they must go first.
  - This supersedes the order in F4.T6 (expenses, then people, then trip). The new order is payments, expenses, people, trip.
- **Done when:** the code review item below is checked. `npm run typecheck` is clean.
- **Covers:** F6.R13

### F6.T5 — Delete payment service with fakes
- **Files:** `app/api/src/payments/service.ts`, `app/api/src/payments/service.test.ts`
- **Depends on:** F6.T3
- **Work:**
  - `PaymentsStore` interface with `deleteForOwner(ownerId, paymentId)`, returning `deleted` or `not-found`. The service takes only this store and the owner ID from the caller.
  - `deletePayment(ownerId, paymentId)` maps the store result. Nothing else: recalculating suggestions is a read, done by the next pages of the feature.
- **Done when:** tests named `F6.R7` (a fake store returns `deleted` for the payment, and `not-found` for a missing one) pass. Test names use the requirement ID, because no acceptance criterion covers the service alone.
- **Covers:** F6.R7, F6.R11

### F6.T6 — Payment routes (delete and list)
- **Files:** `app/api/src/routes/payments.ts`, `app/api/src/routes/payments.test.ts`, `app/api/src/server.ts` (accepts an optional `payments` store, like F4.T7)
- **Depends on:** F6.T5, F4.T7 (server option pattern), F1.T8
- **Work:**
  - `GET /trips/:tripId/payments` → 200 array, newest first. `DELETE /payments/:id` → 204; missing or not-owned → 404 with the same body as a missing expense (F4.T7).
  - Both behind `requireLogin`. The owner is always `request.userId`.
  - Route tests use `buildServer({ logger: false, payments: fake })` with `app.inject`.
- **Done when:** route tests named `F6.R7` (delete returns 204, and a missing payment returns 404) pass. The owner check is in code review.
- **Covers:** F6.R7, F6.R11

### F6.T7 — Web payments API client (list and delete)
- **Files:** `app/web/src/payments/api.ts`, `app/web/src/payments/api.test.ts`
- **Depends on:** F6.T6, F4.T8 (client pattern)
- **Work:**
  - `listPayments(tripId)` and `deletePayment(paymentId)`, with the same error handling as F4.T8: a non-2xx response throws an error carrying the server's `error` text.
- **Done when:** a test named `F6.R7` (a 404 response is passed through with its text) passes with a stubbed `fetch`.
- **Covers:** F6.R7, F6.R11

### F6.T8 — Delete payment dialog
- **Files:** `app/web/src/payments/DeletePaymentDialog.tsx`, `app/web/src/payments/DeletePaymentDialog.test.tsx`
- **Depends on:** F6.T7, F4.T11 (dialog pattern)
- **Work:**
  - Title "Delete this payment?", body "The suggested payment will come back and the balances will change.", buttons Cancel and Delete (spec States table).
  - Cancel closes the dialog and does not call the delete function. Delete calls it once. Both buttons are disabled while the request is in progress (spec Loading).
  - Focus moves to Cancel on open, and Escape closes without deleting (spec Accessibility).
- **Done when:** tests named `F6.AC6` (Cancel does not call the delete function) and `F6.R7` (Delete calls it once) pass.
- **Covers:** F6.R7, F6.AC6

### F6.T9 — Suggestion function (pure, with fakes)
- **Files:** `app/api/src/payments/suggestions.ts`, `app/api/src/payments/suggestions.test.ts`
- **Depends on:** F5.T1 (balances in cents)
- **Work:**
  - `computeSuggestions(balances)`: input is `{ personId, position, balanceCents }[]` in trip order. Zero balances are left out. The count is `k − g`, where `k` is the number of non-zero people and `g` is the most zero-sum groups that partition them (F6.R3). `g` comes from a bitmask DP: `best[mask] = max over i in mask of best[mask without i]`, plus 1 when the sum of `mask` is zero. It costs O(k·2^k).
  - Among the sets with the fewest payments, choose the one whose sorted list is smallest, comparing (payer position, payee position, amount) element by element (F6.R2). A minimum set is a spanning forest of the owes-to-is-owed graph: each tree's flows are fixed by the balances, and each flow must be positive and go from a person who owes to a person who is owed.
  - Return the chosen payments in that same sorted order (F6.R14), as `{ payerId, payeeId, amountCents }`.
  - Record the running time for increasing non-zero counts in the Decisions log. If it is too slow for the trip sizes the app allows, stop and send it back to the user, as the spec's Edge cases say.
- **Done when:** tests named `F6.AC1` (Example 1 gives Alex pays Sam 10.00, then Jo pays Sam 40.00), `F6.AC2`, `F6.AC4` (with Jo's 40.00 payment, only Alex pays Sam 10.00 remains), `F6.AC13`, and `F6.AC14` pass, and the timing is recorded in the Decisions log.
- **Covers:** F6.R1, F6.R2, F6.R3, F6.R14, F6.R9, F6.AC1, F6.AC2, F6.AC4, F6.AC13, F6.AC14

### F6.T10 — Suggestions read service with fakes
- **Files:** `app/api/src/payments/service.ts` (F6.T5 file), `app/api/src/payments/service.test.ts`
- **Depends on:** F6.T9, F5.T2 (balances service pattern)
- **Work:**
  - `getSuggestions(ownerId, tripId)`: the store's `loadForOwner(ownerId, tripId)` returns people, expenses and payments, or `not-found`. Compute balances with `computeBalances` and check `sumBalances` is zero. If not, return `mismatch` and no suggestions (F5.R4). Otherwise compute suggestions with names.
  - Result: `{ has_expenses, suggestions }`. `has_expenses` is true when the trip has at least one expense. Each suggestion row is `{ payer_id, payer_name, payee_id, payee_name, amount_cents }`.
- **Done when:** tests named `F6.AC8` (with an extra expense added to the fake data, the paid payments are kept and the remaining suggestions change) and `F6.R1` (a `mismatch` result returns no rows, and `has_expenses` is false for a trip with no expenses) pass.
- **Covers:** F6.R1, F6.R8, F6.AC8

### F6.T11 — Mark-as-paid service with fakes
- **Files:** `app/api/src/payments/service.ts` (F6.T5 file), `app/api/src/payments/service.test.ts`
- **Depends on:** F6.T10
- **Work:**
  - `markAsPaid(ownerId, tripId, { payerId, payeeId, amountCents })`: the store's `createIfSuggested` runs the check and the create in one transaction (see Decisions log). The check: the candidate is one of the current suggestions and its amount is exactly the suggestion's amount (F6.R4, F6.R6). Result is `created`, `stale` or `not-found`.
  - A candidate whose amount differs from the suggestion is refused as `stale`.
- **Done when:** tests named `F6.AC3` (a suggestion marked as paid is recorded for its full amount in the fake store) and `F6.AC5` (a stale suggestion is refused) pass.
- **Covers:** F6.R4, F6.R5, F6.R6, F6.AC3, F6.AC5

### F6.T12 — Prisma mark-as-paid store
- **Files:** `app/api/src/payments/prisma-store.ts` (F6.T3 file)
- **Depends on:** F6.T3, F6.T11
- **Work:**
  - `createIfSuggested(ownerId, tripId, candidate, check)`: in one `db.$transaction`, `trip.findFirst({ where: { id, ownerId } })` (missing → `not-found`), load people, expenses and payments in the same transaction, run the pure `check` (the service's suggestion check), and if it passes create the payment row. Otherwise return `stale`.
  - All queries use Prisma parameters only.
- **Done when:** the code review items below are checked, and `npm run typecheck` is clean. No unit test (needs a database).
- **Covers:** F6.R5, F6.R11, F6.AC11 (mark-as-paid part), F6.AC12 (save path)

### F6.T13 — Suggestion and mark-as-paid routes
- **Files:** `app/api/src/routes/payments.ts` (F6.T6 file), `app/api/src/routes/payments.test.ts`
- **Depends on:** F6.T11, F6.T12, F6.T6
- **Work:**
  - `GET /trips/:tripId/suggestions` → 200 `{ has_expenses, suggestions }` (F6.T10). `POST /trips/:tripId/payments` with `{ payer_id, payee_id, amount_cents }` → 201 with the payment; `stale` → 409 `{ "error": "These balances have changed. Refresh to see the current suggestions." }`; missing trip → 404 with the same body as a missing trip (F1.R9).
  - Mismatch from `getSuggestions` → `request.log.error({ tripId })` (trip ID only) and 500 `{ "error": "Something went wrong. Try again." }`. The error is not swallowed.
  - Both behind `requireLogin`. The owner is always `request.userId`.
- **Done when:** route tests named `F6.R6` (a stale POST returns 409 with the stale text) and `F6.R5` (a valid POST returns 201) pass.
- **Covers:** F6.R5, F6.R6, F6.R11

### F6.T14 — Web suggestions and mark-as-paid client
- **Files:** `app/web/src/payments/api.ts` (F6.T7 file), `app/web/src/payments/api.test.ts`
- **Depends on:** F6.T7, F6.T13
- **Work:**
  - `getSuggestions(tripId)` returns `{ has_expenses, suggestions }`, where `suggestions` is `{ payer_id, payer_name, payee_id, payee_name, amount_cents }[]`. `markAsPaid(tripId, body)` posts the payment.
  - A non-2xx response throws an error carrying the server's `error` text, as in F6.T7.
- **Done when:** a test named `F6.R6` (a 409 stale response is passed through with its text) passes with a stubbed `fetch`.
- **Covers:** F6.R4, F6.R6, F6.R11

### F6.T15 — Settle up section on the trip page
- **Files:** `app/web/src/payments/SettleUpSection.tsx`, `app/web/src/payments/SettleUpSection.test.tsx`, `app/web/src/pages/TripPage.tsx` (F5.T7 file; adds the section below Balances), `app/web/src/pages/TripPage.test.tsx`
- **Depends on:** F6.T8, F6.T14, F5.T7
- **Work:**
  - Each suggestion is one row with the full sentence and a "Mark as paid" button named with the sentence (spec Accessibility). Payments made lists the payments, newest first, each with a Delete control that opens F6.T8's dialog.
  - Mark as paid and Delete are disabled while their request is in progress (spec Loading). A stale response shows "These balances have changed. Refresh to see the current suggestions."
  - After Delete, the section reloads the suggestions, so the deleted payment's suggestion reappears.
  - Empty state: when there are no suggestions, show "Add expenses to see who pays whom." if `has_expenses` is false, otherwise "Everyone is settled." (F6.AC15, F6.AC16).
  - Error: a failed request shows "Something went wrong. Try again." and no rows (F6.AC17). Loading: a loading state, with no rows or messages, while the request is pending (F6.AC18).
- **Done when:** tests named `F6.AC5` (the stale message shows and no payment is recorded), `F6.AC7` (after Delete, the suggestion is shown again), `F6.AC15` (everyone settled), `F6.AC16` (no expenses), `F6.AC17` (error) and `F6.AC18` (loading) pass with a stubbed client. The trip page shows the section below Balances.
- **Covers:** F6.R1, F6.R6, F6.R7, F6.R8, F6.R10, F6.AC5, F6.AC7, F6.AC15, F6.AC16, F6.AC17, F6.AC18

## Acceptance criteria map
Every AC in the spec appears once.

| AC | How it is checked | Test name(s) or review item | File |
|---|---|---|---|
| F6.AC1 | Unit test | `F6.AC1 Example 1 gives Alex pays Sam 10.00, then Jo pays Sam 40.00` | `app/api/src/payments/suggestions.test.ts` |
| F6.AC2 | Unit test | `F6.AC2 C pays A 10.00 and D pays B 10.00` | `suggestions.test.ts` |
| F6.AC3 | Unit test | `F6.AC3 marking a suggestion records its full amount` | `app/api/src/payments/service.test.ts` |
| F6.AC4 | Unit test | `F6.AC4 with Jo's 40.00 payment only Alex pays Sam 10.00 remains` | `suggestions.test.ts` |
| F6.AC5 | Unit test | `F6.AC5 refuses a stale suggestion` (service); `F6.AC5 shows the stale message and records nothing` (section) | `service.test.ts`, `app/web/src/payments/SettleUpSection.test.tsx` |
| F6.AC6 | Unit test | `F6.AC6 Cancel does not call the delete function` | `app/web/src/payments/DeletePaymentDialog.test.tsx` |
| F6.AC7 | Unit test | `F6.AC7 after Delete the suggestion is shown again` | `app/web/src/payments/SettleUpSection.test.tsx` |
| F6.AC8 | Unit test | `F6.AC8 an extra expense keeps paid payments and changes the rest` | `app/api/src/payments/service.test.ts` |
| F6.AC9 | Unit test | `F6.AC9 every balance is zero when all suggested payments are paid` | `app/api/src/balances/balance.test.ts` |
| F6.AC10 | Unit test | `F6.AC10 balances total zero for generated trips with payments` | `app/api/src/balances/balance.test.ts` |
| F6.AC11 | Code review | Delete, list, suggestion and mark-as-paid queries filter on `trip: { ownerId }` in the query (F6.T3, F6.T12, F6.T13). A not-owned trip or payment returns Not found. | — |
| F6.AC12 | Code review | Payer and payee differ, amount is above zero, and both are on the trip (F6.T2 constraints, F6.T12 save) | — |
| F6.AC13 | Unit test | `F6.AC13 exactly two payments for A +10, B -10, C +5, D -5` | `suggestions.test.ts` |
| F6.AC14 | Unit test | `F6.AC14 smaller amount first for X pays P 1.00 over 4.00` | `suggestions.test.ts` |
| F6.AC15 | Unit test | `F6.AC15 shows Everyone is settled. and no rows when there are no suggestions and the trip has expenses` | `app/web/src/payments/SettleUpSection.test.tsx` |
| F6.AC16 | Unit test | `F6.AC16 shows Add expenses to see who pays whom. and no rows when the trip has no expenses` | `app/web/src/payments/SettleUpSection.test.tsx` |
| F6.AC17 | Unit test | `F6.AC17 shows Something went wrong. Try again. and no rows when the request fails` | `app/web/src/payments/SettleUpSection.test.tsx` |
| F6.AC18 | Unit test | `F6.AC18 shows a loading state and no rows or messages while the request is pending` | `app/web/src/payments/SettleUpSection.test.tsx` |

Count: 18 ACs in the spec, 18 rows here. 16 are unit tests (AC1 to AC10, AC13 to AC18), and 2 are code review (AC11, AC12).

## Build order
1. F6.T1 — Payments in the balance tests (after F5.T1)
2. F6.T2 — Payment table and migration (after F2, F3, F4 tables)
3. F6.T3 — Payment store: balances, list and delete (after T2 and F5.T3)
4. F6.T4 — Trip delete removes payments first (after T3 and F4.T6)
5. F6.T5 — Delete payment service with fakes (after T3)
6. F6.T6 — Payment routes, delete and list (after T5)
7. F6.T7 — Web payments API client, list and delete (after T6)
8. F6.T8 — Delete payment dialog (after T7)
9. F6.T9 — Suggestion function, pure (after F5.T1)
10. F6.T10 — Suggestions read service (after T9)
11. F6.T11 — Mark-as-paid service (after T10)
12. F6.T12 — Prisma mark-as-paid store (after T3, T11)
13. F6.T13 — Suggestion and mark-as-paid routes (after T6, T11, T12)
14. F6.T14 — Web suggestions and mark-as-paid client (after T7, T13)
15. F6.T15 — Settle up section (after T8, T14, F5.T7)

Cross-feature dependencies: **F1**, **F2**, **F3**, **F4** and **F5** must be built first. F5 supplies the balances that F6 uses. F3.R4 is enforced by the `Restrict` foreign keys that F6.T2 adds, so F3 needs no change for F6.

## Verification
- From `app/`: `npm run typecheck`, then `npm test`.
- Code review checklist (every AC marked "Code review" above, and the database rules behind the unit-tested ACs):
  - [ ] F6.AC11: `payment.findFirst`, the list `findMany`, the suggestion read's `trip.findFirst`, and the mark-as-paid `trip.findFirst` all filter on `ownerId` in the same query. A not-owned trip or payment returns Not found and no data. No query reads the owner from the request.
  - [ ] F6.AC12: the migration's CHECK constraints enforce `payer_id <> payee_id` and `amount_cents > 0`. `payer_id` and `payee_id` reference Person rows with `Restrict`, and the save path checks that both are on the payment's trip.
  - [ ] F6.R5: marking as paid creates its row inside the same `$transaction` as the suggestion check, so a stale suggestion cannot be recorded.
  - [ ] F6.R13: trip delete removes payments before expenses and people, in one transaction.
  - [ ] F6.R11: the payment routes are behind `requireLogin`, and the owner comes from `request.userId`.
  - [ ] F6.R12: `createdAt` is stored in UTC.
  - [ ] Logging: the mismatch log line contains the trip ID only, never names, amounts or any personal data (project rules).
  - [ ] Money: payment amounts and suggestion amounts are integer cents; no float conversion in the payment code.
  - [ ] Migration: a person has reviewed and approved the F6.T2 migration (CLAUDE.md).

## Decisions log
- 2026-11-05: Where is the balance term for payments tested? → In F5's `balance.test.ts`, because the payment term is already in `computeBalances` (F5.T1). F6.T1 adds only tests, so no new code is needed for R9 and R10.
- 2026-11-05: How are the payment constraints stored? → CHECK constraints in the migration SQL, because the Prisma schema cannot express them. The reference (`Restrict`) is in the schema.
- 2026-11-05: Trip delete order. → Payments, then expenses, then people, then the trip. Payment and expense rows both refer to people with `Restrict`, so they must go first.
- 2026-11-05: How is the exact minimum count computed? → The number of suggested payments is the non-zero people minus the most zero-sum groups that partition them (F6.R3). The group count comes from a bitmask DP, O(k·2^k) for k non-zero people, rather than subset enumeration, which is O(3^k).
- 2026-11-05: How is the set of payments chosen? → A minimum set is a spanning forest of the owes-to-is-owed graph, with one tree per zero-sum group in a maximum partition. Each tree's flows follow from the balances, so the candidates are enumerated and the smallest sorted list wins (F6.R2). Cost grows fast with the number of people, so the running time is recorded in F6.T9.
- 2026-11-05: Where is the stale check run? → Inside the mark-as-paid transaction (`createIfSuggested` in F6.T12). The store reads the trip's data, runs the pure check and writes, so two tabs cannot both record the same suggestion (F6.R5, F6.R6).
- 2026-11-05: What does a mark-as-paid request with a different amount do? → It is refused as stale, because the candidate must match a current suggestion exactly (F6.R4, F6.R6). The spec gives no separate copy for partial payments.
- 2026-11-05: HTTP status codes. → Stale is 409, and a server error is 500 with the spec's copy. These are technical choices. The copy is from the spec.
- 2026-11-05: Person removal blocking. → No change in F6 beyond the `Restrict` foreign keys in F6.T2. F3's removal transaction already maps the foreign-key error to `in-use` (F3 Decisions log), so F3 needs no edit.
- 2026-11-05: Spec approved (2026-11-05) with F6.R14 and F6.AC14, so the two earlier Sent back questions are answered and the suggestion, mark-as-paid and Settle up tasks are added (F6.T9 to F6.T15).
- 2026-11-05: Plan approved by the user.
- 2026-11-05: Spec revised and re-approved: F6.AC15 to F6.AC18 added for the confirmed copy and the loading state, and the suggestions response is `{ has_expenses, suggestions }` so the empty state can be chosen. Changed F6.T10 (response and `has_expenses` test), F6.T13 (route response), F6.T14 (client response), and F6.T15 (empty, error and loading states with their tests). The AC map has 18 rows. The Sent back item is resolved.

## Sent back to the spec
Product questions found while planning. Leave the dependent tasks out until these are answered through `/spec-feature F6`.
- [x] **States without acceptance criteria.** Resolved 2026-11-05. The spec's States table confirms this copy, but no AC tests it, so project rules leave no test name for it: "Everyone is settled." (No suggestions, R10), "Add expenses to see who pays whom." (No expenses yet, R1), "Something went wrong. Try again." (Server error, Settle up), and the loading state. The spec now has F6.AC15 to F6.AC18 for these, and F6.T15 covers them.
