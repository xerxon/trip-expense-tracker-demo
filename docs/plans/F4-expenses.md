# F4 plan — Expenses

_Status: Approved · Spec: `docs/specs/features/F4-expenses.md` (Approved) · Last updated: 2026-11-05_

## Approach
Build the amount and description rules first as pure functions, including the parser that turns typed dollars into integer cents without floats. Then the equal-split function (R3 and R7), then the expense service with a fake store, which checks the payer and participants against the trip's people. Next come the `Expense` and `ExpenseParticipant` tables, a Prisma store that saves an expense and its shares in one transaction, and an update to the trip delete so expenses go first. The HTTP routes sit behind `requireLogin`. The web screens come last: the API client, the Add expense form, the expenses list with its row view on the trip page, and the delete dialog. This version follows the spec revised and approved on 2026-11-05: the 21,474,836.47 cap, the expense-not-found and people-not-on-trip copy, and the empty-state criterion. Nothing is sent back.

## Tasks
Each task is one commit. Its commit message starts with its ID, for example `F4.T1 <short title>`.

### F4.T1 — Amount and description rules
- **Files:** `app/api/src/expenses/rules.ts`, `app/api/src/expenses/rules.test.ts`
- **Depends on:** none
- **Work:**
  - `parseAmount(text)`: trims the text, then accepts digits with an optional decimal point and at most two decimal places. Returns whole cents as an integer, using string parts and integer arithmetic only, never floats. Errors: empty → `"Enter an amount."`; a leading `-` or a zero total → `"The amount must be more than zero."`; a currency symbol, a comma, letters, or more than two decimal places → `"Enter an amount in whole cents, like 12.34."`. Accepts `12.34`, `0.01`, `12`, `12.`, `.5`.
  - `normalizeDescription(text)`: trims. Spaces-only becomes `null` (no description, no error). Over 100 characters → `"Descriptions can be up to 100 characters."`.
  - Cap: an amount above 2,147,483,647 cents (21,474,836.47) is refused with `"Amounts can be up to 21,474,836.47."` (F4.R13). The check runs after the cents are computed, so it compares integers only.
- **Done when:** tests named `F4.AC3` (zero and negative refused), `F4.AC4` (12.345 refused; 12.34 and 0.01 accepted as cents), `F4.AC8` (100 accepted, 101 refused), `F4.AC16` (spaces-only → no description), `F4.AC17` (`$1,200.00` and `1,200.00` refused), and `F4.AC19` (21,474,836.47 accepted, 21,474,836.48 refused) pass.
- **Covers:** F4.R1, F4.R2, F4.R6, F4.R13, F4.AC3, F4.AC4, F4.AC8, F4.AC16, F4.AC17, F4.AC19

### F4.T2 — Equal split function
- **Files:** `app/api/src/expenses/split.ts`, `app/api/src/expenses/split.test.ts`
- **Depends on:** F4.T1 (cents type only)
- **Work:**
  - `splitShares(amountCents, personIdsInTripOrder)`: each share is `floor(amount / n)`. The leftover cents go one each to the first participants in trip order (R3).
  - Returns `{ personId, shareCents }[]` in the same order. The sum always equals the amount (R8).
- **Done when:** tests named `F4.AC1` (90.00 across three gives 30.00 each), `F4.AC2` (10.00 across three gives 3.34, 3.33, 3.33 in trip order), and `F4.AC10` (shares sum to the amount for a range of amounts and participant counts, including 0.02 across three) pass.
- **Covers:** F4.R7, F4.R8, F4.AC1, F4.AC2, F4.AC10

### F4.T3 — Expense service with fakes
- **Files:** `app/api/src/expenses/types.ts`, `app/api/src/expenses/service.ts`, `app/api/src/expenses/service.test.ts`
- **Depends on:** F4.T1, F4.T2, F3.T2 (people store pattern)
- **Work:**
  - `ExpenseStore` interface with `listPeopleForOwner(ownerId, tripId)` (people with `id` and `position`, in position order), `createForOwner(ownerId, expense)`, `listForOwner(ownerId, tripId)`, `deleteForOwner(ownerId, expenseId)`. Each takes the owner ID. The service receives only this store (no people or trip writes beyond it).
  - `saveExpense`: returns `unauthenticated` with no owner ID. Parses the amount and description. Refuses a missing payer (`"Choose who paid."`, F4.R4) or no participants (`"Choose at least one person to share this expense."`, F4.R5). Reads the trip's people with `listPeopleForOwner` (`not-found` passes through). Refuses a payer or participant not in that list with `"Choose people from this trip."`. Computes shares with `splitShares` over the participants in trip order. A payer who is not a participant is accepted (F4.R3). Then calls `createForOwner`, which re-checks inside its transaction.
  - `listExpenses`: sorts newest first (by `createdAt`, then `id`), and sorts each expense's sharers by person position for the "Shared by" line.
  - `deleteExpense`: passes through `not-found`.
  - `toHttpError(result)`: `invalid` → 400 `{ error }`; `not-found` → 404 with `{ "error": "Trip not found." }` for save and list, and `{ "error": "Expense not found." }` for delete (the `not-found` result carries `kind: "trip" | "expense"`, F4.R13 and F1.R9); `unauthenticated` → 401 `{ "error": "Log in required" }`.
- **Done when:** tests named `F4.AC5` (no payer refused), `F4.AC6` (no participants refused), `F4.AC7` (payer who is not a participant accepted, and not in shares), `F4.AC11` (newest first; sharers in position order) pass with fakes.
- **Covers:** F4.R3, F4.R4, F4.R5, F4.R7, F4.R9, F4.AC5, F4.AC6, F4.AC7, F4.AC11

### F4.T4 — Expense tables and migration
- **Files:** `app/api/prisma/schema.prisma`, `app/api/prisma/migrations/<timestamp>_add_expenses/migration.sql` (generated, then the CHECK added by hand)
- **Depends on:** F2.T3 (`Trip`), F3.T3 (`Person`)
- **Work:**
  - `Expense`: `id` (Int, autoincrement, so newest-first has a tie-break), `tripId` (references `Trip`, `onDelete: Cascade`), `description` (optional string), `amountCents` (Int), `payerId` (references `Person`, `onDelete: Restrict`), `createdAt` (DateTime, UTC).
  - `ExpenseParticipant`: `expenseId` (references `Expense`, `onDelete: Cascade`), `personId` (references `Person`, `onDelete: Restrict`), `shareCents` (Int). Primary key (`expenseId`, `personId`).
  - Add `CHECK (amount_cents > 0)` to the generated `migration.sql` (F4.R1, the spec's database check). Prisma does not generate it.
  - **A person reviews `migration.sql` before it is applied to any shared database.**
- **Done when:** `npm run db:generate` and `npm run typecheck` pass, the CHECK is in the migration, and a person has approved it. Verified in code review.
- **Covers:** F4.R1, F4.R3, F4.R8 (stored shares), F4.R12 (tables)

### F4.T5 — Prisma expense store
- **Files:** `app/api/src/expenses/prisma-store.ts`
- **Depends on:** F4.T3, F4.T4
- **Work:**
  - `listPeopleForOwner`: one `findMany` with `where: { tripId, trip: { ownerId } }`, ordered by `position`. A missing trip returns `not-found`.
  - `createForOwner`: in one `db.$transaction`, `trip.findFirst({ where: { id, ownerId } })` (missing → `not-found`), then `person.findMany({ where: { tripId, id: { in: ids } } })`. If the count does not match the unique payer and participant IDs → `invalid-people`. Otherwise create the expense with its participant rows (shares from the service) in the same transaction (F4.R12).
  - `listForOwner`: one `findMany` with `where: { tripId, trip: { ownerId } }`, `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, including participants with each person's name and position.
  - `deleteForOwner`: in one `db.$transaction`, `findFirst({ where: { id, trip: { ownerId } } })`; missing → `not-found`; otherwise `delete`. Participant rows go with the expense (`Cascade`).
  - All queries use Prisma parameters only.
- **Done when:** the code review items below are checked, and `npm run typecheck` is clean. Verified in code review (needs a database).
- **Covers:** F4.R3, F4.R9, F4.R10, F4.R12, F4.R14, F4.AC15

### F4.T6 — Trip delete removes expenses first
- **Files:** `app/api/src/trips/prisma-store.ts` (changed in F3.T5)
- **Depends on:** F4.T5, F3.T5
- **Work:**
  - In the existing `deleteForOwner` transaction, delete the trip's expenses before its people, because expense rows refer to people with `Restrict`: `expense.deleteMany({ where: { tripId, trip: { ownerId } } })` (participant rows go with them), then the people (F3.T5), then the trip row.
  - This supersedes the order in F3.T5, which assumed no expense rows existed yet.
- **Done when:** the code review item below is checked. `npm run typecheck` is clean.
- **Covers:** F4 Data & contract "Cascade"; F2.R7 (extended to expenses)

### F4.T7 — Expense routes
- **Files:** `app/api/src/routes/expenses.ts`, `app/api/src/routes/expenses.test.ts`, `app/api/src/server.ts` (accepts an optional `expenses` store, like F3.T6)
- **Depends on:** F4.T3, F4.T5, F3.T6 (server option pattern), F1.T7, F1.T8
- **Work:**
  - `POST /trips/:tripId/expenses` with body `{ description?, amount, payer_id, participant_ids[] }`, where `amount` is a string of decimal dollars. Success → 201 with the saved expense and its shares. Non-string `amount` is refused as a cents error (see Decisions log).
  - `GET /trips/:tripId/expenses` → 200 array, newest first. `DELETE /expenses/:id` → 204.
  - All three are behind `requireLogin`. The owner is always `request.userId`, never a body value (F4.R14).
  - Errors go through `toHttpError`. Validation failures return 400 `{ "error" }` and save nothing.
  - `DELETE` not-found returns 404 `{ "error": "Expense not found." }` (F4.R14, F1.R9). Save and list not-found return "Trip not found.".
  - Route test uses `buildServer({ logger: false, expenses: fake })` with `app.inject`.
- **Done when:** a route test named `F4.AC3` (an amount of zero returns 400 with the matching error, and the store is not called) passes.
- **Covers:** F4.R1, F4.R14, F4.AC3

### F4.T8 — Web expenses API client
- **Files:** `app/web/src/expenses/api.ts`, `app/web/src/expenses/api.test.ts`
- **Depends on:** F4.T7 (contract), F3.T7 (client pattern)
- **Work:**
  - `saveExpense(tripId, input)`, `listExpenses(tripId)`, `deleteExpense(expenseId)`, calling `/api/trips/:tripId/expenses` and `/api/expenses/:id`.
  - A non-2xx response throws an error that carries the server's `error` text. Any other failure throws a generic error, so the screen can show `"Something went wrong. Try again."`.
- **Done when:** a test named `F4.AC5` (the server's "Choose who paid." text is passed through) passes with a stubbed `fetch`.
- **Covers:** F4.AC5

### F4.T9 — Add expense form
- **Files:** `app/web/src/expenses/AddExpenseForm.tsx`, `app/web/src/expenses/AddExpenseForm.test.tsx`
- **Depends on:** F4.T8, F3.T9 (people list the payer and sharers come from)
- **Work:**
  - Fields: description (optional, labelled), amount (labelled), payer (choice list with an empty first option), participants (checkboxes in a "Shared by" legend, all ticked by default, each labelled with the person's name).
  - The form does not save when the payer is empty or no participant is ticked, and shows the matching message. When the trip has no people, the form is blocked and shows `"Add people to the trip before you add an expense."` (F4.R3).
  - Errors are linked to their fields and announced. Focus moves to the first error after a failed submit. The Save button is disabled while the request runs. Enter submits.
- **Done when:** tests named `F4.AC5` (no payer → "Choose who paid." and no save call), `F4.AC6` (no one ticked → "Choose at least one person to share this expense." and no save call), and `F4.AC9` (a trip with no people blocks saving with the message) pass, with the API replaced by a fake.
- **Covers:** F4.R3, F4.R4, F4.R5, F4.AC5, F4.AC6, F4.AC9

### F4.T10 — Expenses list, row view and trip page
- **Files:** `app/web/src/expenses/ExpensesSection.tsx`, `app/web/src/expenses/ExpenseRow.tsx`, `app/web/src/expenses/ExpensesSection.test.tsx`, `app/web/src/pages/TripPage.tsx` (adds the section under People, F3.T9), `app/web/src/pages/TripPage.test.tsx`
- **Depends on:** F4.T8, F4.T9, F3.T9
- **Work:**
  - Loads the list with a loading state. Shows the add form, then the list. Each row shows description (or nothing if none), amount, payer and a "Shared by" line.
  - The row has a Delete control whose accessible name includes the description, or the amount when there is none (for example "Delete Dinner, 90.00"). The row has no edit control (F4.R11).
  - The list shows expenses in the order the API returns them. The new expense goes to the top after a save.
  - With no expenses, shows "No expenses yet. Add the first one." and an Add expense button.
- **Done when:** tests named `F4.AC11` (row shows description, amount, payer and "Shared by"; rows render in the given order), `F4.AC14` (no edit control in the row), and `F4.AC18` (the empty-state message and button show when the list is empty) pass. The trip page shows the Expenses section below People.
- **Covers:** F4.R9, F4.R11, F4.AC11, F4.AC14, F4.AC18

### F4.T11 — Delete expense dialog
- **Files:** `app/web/src/expenses/DeleteExpenseDialog.tsx`, `app/web/src/expenses/DeleteExpenseDialog.test.tsx`, `app/web/src/expenses/ExpensesSection.tsx` (wires the dialog and the refresh)
- **Depends on:** F4.T10
- **Work:**
  - Title "Delete this expense?", body "The balances on this trip will change.", buttons Cancel and Delete. Focus starts on Cancel, Escape closes without deleting, and focus returns to the row's Delete control.
  - Cancel closes the dialog and calls nothing. Delete calls `deleteExpense` once, then refreshes the list. Delete is disabled while the request runs.
- **Done when:** tests named `F4.AC12` (Cancel does not call delete) and `F4.AC13` (Delete calls it once for the chosen expense) pass.
- **Covers:** F4.R10, F4.AC12, F4.AC13

## Acceptance criteria map
Every AC in the spec appears once.

| AC | How it is checked | Test name(s) or review item | File |
|---|---|---|---|
| F4.AC1 | Unit test | `F4.AC1 gives 30.00 each for 90.00 across three people` | `app/api/src/expenses/split.test.ts` |
| F4.AC2 | Unit test | `F4.AC2 gives 3.34, 3.33, 3.33 for 10.00 in trip order` | `split.test.ts` |
| F4.AC3 | Unit test | `F4.AC3 rejects zero and negative amounts` (rules); `F4.AC3 returns 400 with the matching error and saves nothing` (routes) | `app/api/src/expenses/rules.test.ts`, `app/api/src/routes/expenses.test.ts` |
| F4.AC4 | Unit test | `F4.AC4 rejects 12.345 and accepts 12.34 and 0.01 as cents` | `rules.test.ts` |
| F4.AC5 | Unit test | `F4.AC5 refuses an expense with no payer` (service); `F4.AC5 shows "Choose who paid." and does not save` (form); `F4.AC5 passes through the server's "Choose who paid." text` (client) | `app/api/src/expenses/service.test.ts`, `app/web/src/expenses/AddExpenseForm.test.tsx`, `app/web/src/expenses/api.test.ts` |
| F4.AC6 | Unit test | `F4.AC6 refuses an expense with no participants` (service); `F4.AC6 blocks save when no one is ticked` (form) | `service.test.ts`, `AddExpenseForm.test.tsx` |
| F4.AC7 | Unit test | `F4.AC7 accepts a payer who is not a participant, and leaves them out of shares` | `service.test.ts` |
| F4.AC8 | Unit test | `F4.AC8 accepts 100 characters and refuses 101` | `rules.test.ts` |
| F4.AC9 | Unit test | `F4.AC9 blocks saving when the trip has no people` | `app/web/src/expenses/AddExpenseForm.test.tsx` |
| F4.AC10 | Unit test | `F4.AC10 shares sum to the amount across amounts and participant counts` | `split.test.ts` |
| F4.AC11 | Unit test | `F4.AC11 lists newest first and sorts sharers by position` (service); `F4.AC11 row shows description, amount, payer and Shared by` (view) | `service.test.ts`, `app/web/src/expenses/ExpensesSection.test.tsx` |
| F4.AC12 | Unit test | `F4.AC12 Cancel does not call delete` | `app/web/src/expenses/DeleteExpenseDialog.test.tsx` |
| F4.AC13 | Unit test | `F4.AC13 Delete calls delete once for the chosen expense` | `DeleteExpenseDialog.test.tsx` |
| F4.AC14 | Unit test | `F4.AC14 expense row has no edit control` | `app/web/src/expenses/ExpensesSection.test.tsx` |
| F4.AC15 | Code review | The save, list and delete queries include the trip owner check in the database query, and the save transaction refuses a payer or participant from another trip (see checklist) | — |
| F4.AC16 | Unit test | `F4.AC16 description of only spaces saves with no description` | `rules.test.ts` |
| F4.AC17 | Unit test | `F4.AC17 refuses "$1,200.00" and "1,200.00"` | `rules.test.ts` |
| F4.AC18 | Unit test | `F4.AC18 shows the empty-state message and Add expense button when there are no expenses` | `app/web/src/expenses/ExpensesSection.test.tsx` |
| F4.AC19 | Unit test | `F4.AC19 refuses 21,474,836.48 and accepts 21,474,836.47` | `app/api/src/expenses/rules.test.ts` |

Count: 19 ACs in the spec, 19 rows here. 18 are unit tests and 1 is code review (F4.AC15). The database rules behind F4.AC15 and F4.R12 are checked in the checklist below.

## Build order
1. F4.T1 — Amount and description rules
2. F4.T2 — Equal split function (after T1)
3. F4.T3 — Expense service with fakes (after T1, T2)
4. F4.T4 — Expense tables and migration (after F3.T3; migration needs a person's review)
5. F4.T5 — Prisma expense store (after T3, T4)
6. F4.T6 — Trip delete removes expenses first (after T5, F3.T5)
7. F4.T7 — Expense routes (after T3, T5)
8. F4.T8 — Web expenses API client (after T7)
9. F4.T9 — Add expense form (after T8, F3.T9)
10. F4.T10 — Expenses list and trip page (after T8, T9)
11. F4.T11 — Delete expense dialog (after T10)

Cross-feature dependencies: **F1**, **F2** and **F3** must be built first. F3 supplies the people who pay and share. F4 adds `Restrict` references to `Person`, so F3's removal check (F3.R4) now blocks removal of anyone in an expense. F5 and F6 read expenses and shares, and F6 must add its rows to the trip delete before people (F4.T6 sets that order).

## Verification
- From `app/`: `npm run typecheck`, then `npm test`.
- Code review checklist (every AC marked "Code review" above, and the database rules behind the unit-tested ACs):
  - [ ] F4.AC15: every expense query (list, save, delete) filters by the trip owner inside the database query. The save refuses a payer or participant from another trip inside the same transaction (`person.findMany` with `tripId`, count compared). No query reads the owner from the request.
  - [ ] F4.R12: the expense row and its participant rows are written in one `db.$transaction`.
  - [ ] F4.R8: the stored `shareCents` values for each expense sum to `amountCents`.
  - [ ] F4.R1: `migration.sql` has `CHECK (amount_cents > 0)`.
  - [ ] F4.R13: `amount_cents` is an `Int` column (32-bit), so the 21,474,836.47 cap in `parseAmount` matches what storage can hold.
  - [ ] F4.R14: all three expense routes are behind `requireLogin`, and no route takes the owner from the request.
  - [ ] F4.T4: a person reviewed `migration.sql` before it was applied to any shared database.
  - [ ] F4 cascade: `deleteForOwner` in the trip store deletes expenses (and their participants) before people, and people before the trip, in one transaction.
  - [ ] F3.R4 with F4: removing a person who is in an expense is refused by the `Restrict` foreign key and reported as `in-use`.

## Decisions log
- 2026-11-05: Amount parser → string-based. Accepts digits with an optional decimal point and at most two decimals, and converts to integer cents without floats. `12.` and `.5` are accepted because they are plain decimals with one point (F4.R2). Leading and trailing spaces are trimmed first.
- 2026-11-05: Negative amounts (`-5`) → "The amount must be more than zero." This is the States table's row for "Amount zero or negative" (F4.R1). Other non-numeric text → the cents message.
- 2026-11-05: Amount sent as a JSON string, not a number. A number could carry float error before the server sees it, so a non-string `amount` is refused with the cents message.
- 2026-11-05: Payer or participant not on the trip → 400 `{ "error": "Choose people from this trip." }`. Confirmed in the spec revision (F4.R3, 2026-11-05).
- 2026-11-05: Expense `id` is an autoincrement Int, not a random ID, so newest-first can break ties on `id` when two expenses share a `createdAt` millisecond. Ownership is still checked on every request, so the sequence reveals nothing that matters.
- 2026-11-05: Shares are computed in the service with the pure split function, over people in position order, and stored by the store in the same transaction. This lets the split and the payer/participant rules be tested with fakes (project rules).
- 2026-11-05: Sharers' order for "Shared by" is by person position, sorted in the service. Prisma cannot order a nested relation by a field of the related model in one query.
- 2026-11-05: Not-found copy: a missing or not-owned trip (save, list) → `"Trip not found."`; a missing or not-owned expense (delete) → `"Expense not found."`, both 404 (F1.R9). Confirmed in the spec revision (2026-11-05).
- 2026-11-05: Amount cap → the parser refuses anything above 2,147,483,647 cents, which is the limit of the `Int` column (F4.R13). Confirmed in the spec revision.
- 2026-11-05: Spec revised and approved (2026-11-05). This plan now covers the cap (F4.T1), the two new messages (F4.T3, F4.T7), and the empty-state criterion (F4.T10, F4.AC18). It also covers F4.AC19. Nothing is sent back.
- 2026-11-05: Plan approved by the user.
- 2026-11-05: The spec test-plan row for the same-transaction check was relabelled F4.R12 (it was labelled F4.AC1). The plan's checklist already treated it as a code-review item, so no task changes.
- 2026-11-05: Payer and participant foreign keys are `Restrict`. This is what makes F3.R4 block removal of a person in an expense, and it means the trip delete must remove expenses before people (F4.T6).
- 2026-11-05: Expense tables and the trip-delete change (F4.T6) supersede F3.T5's order. F3.T5 still holds for trips with no expenses.

## Sent back to the spec
None. The spec was revised and approved on 2026-11-05. The cap (F4.R13), the two new messages, and the empty-state criterion (F4.AC18) are all covered by tasks above.
