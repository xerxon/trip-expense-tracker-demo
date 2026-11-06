# F3 plan — People

_Status: Approved · Spec: `docs/specs/features/F3-people.md` (Approved) · Last updated: 2026-11-05_

## Approach
Build the name rules first as pure functions, then the people service with a fake store, then the `Person` table and a Prisma store that does every ownership check in its query and checks the name key in the database. Add people to the HTTP layer behind F1's `requireLogin`, and extend F2's trip delete so it removes people inside the same transaction. The web work comes last: an API client, an add form, the People section on the trip page (F2.T10), then the remove dialog and the blocked-removal message. Removal is blocked by foreign keys that F4 and F6 add, so F3 itself has no expense or payment code.

## Tasks
Each task is one commit. Its commit message starts with its ID, for example `F3.T1 <short title>`.

### F3.T1 — Person name rules
- **Files:** `app/api/src/people/rules.ts`, `app/api/src/people/rules.test.ts`
- **Depends on:** none
- **Work:**
  - `normalizePersonName(input)`: trims surrounding spaces. A spaces-only name becomes `""`.
  - `personNameKey(name)`: the trimmed name lower-cased, used for the uniqueness check.
  - `validatePersonName(name)`: returns `"Enter a name."` for empty, `"Names can be up to 50 characters."` for over 50, otherwise `null`. Accepts exactly 50.
- **Done when:** `F3.AC3` and `F3.AC14` tests in `rules.test.ts` pass.
- **Covers:** F3.R1, F3.R2 (name key), F3.AC3, F3.AC14

### F3.T2 — People service with fakes
- **Files:** `app/api/src/people/types.ts`, `app/api/src/people/service.ts`, `app/api/src/people/service.test.ts`
- **Depends on:** F3.T1
- **Work:**
  - `PeopleStore` interface with `add`, `listForOwner`, `removeForOwner`. Each takes the owner ID, so the store can check ownership in its query. The service takes only this store, so no expense or payment store can be reached (F3.R9).
  - `addPerson`: returns `unauthenticated` when there is no owner ID, `invalid` for a rule failure, and `duplicate` when the list already has the name key (checked ignoring capitals). Otherwise it calls the store. The view is `{ id, name, position }` only.
  - `listPeople`: sorts by `position`, ascending.
  - `removePerson`: maps the store result. `in-use` gives the message `"<name> is in an expense or payment, so they can't be removed."` (F3.R4).
  - `toHttpError(result)`: `invalid` → 400 `{ error }`; `duplicate` → 409 with `"Someone with this name is already on the trip."`; `in-use` → 409 with the blocked message; `not-found` → 404 `{ "error": "Trip not found." }`; `unauthenticated` → 401 `{ "error": "Log in required" }`.
- **Done when:** service tests named `F3.AC1`, `F3.AC2`, `F3.AC4`, `F3.AC5`, `F3.AC6`, `F3.AC11`, `F3.AC12`, `F3.AC13` pass with fakes.
- **Covers:** F3.R1, F3.R2, F3.R3, F3.R4, F3.R7, F3.R8, F3.R9, F3.AC1, F3.AC2, F3.AC4, F3.AC5, F3.AC6, F3.AC11, F3.AC12, F3.AC13

### F3.T3 — Person table and migration
- **Files:** `app/api/prisma/schema.prisma`, `app/api/prisma/migrations/<timestamp>_add_people/migration.sql` (generated)
- **Depends on:** F2.T3 (the `Trip` model), F1.T4
- **Work:**
  - `Person` model with `id`, `tripId` (references `Trip`, `onDelete: Cascade`), `name`, `nameKey`, `position`. No other fields (F3.R8).
  - `@@unique([tripId, nameKey])` for the name rule (F3.R2). `@@unique([tripId, position])` so two concurrent adds can't take the same position (F3.R3).
  - Generate the migration. **A person reviews `migration.sql` before it is applied to any shared database** (project rules).
- **Done when:** `npm run db:generate` and `npm run typecheck` pass, and a person has approved `migration.sql`. The constraints are checked in code review (see the checklist), since unit tests cannot prove them.
- **Covers:** F3.R2, F3.R3, F3.R8

### F3.T4 — Prisma people store
- **Files:** `app/api/src/people/prisma-store.ts`
- **Depends on:** F3.T2, F3.T3
- **Work:**
  - `add`: in one `db.$transaction`, first find the trip with `findFirst({ where: { id, ownerId } })`, then read the highest `position` in the trip, then create the person at that position plus one. A missing or not-owned trip returns `not-found`. A `P2002` error is turned into `duplicate` only when its target is the name key. Any other error is rethrown.
  - `listForOwner`: one `findMany` with `where: { tripId, trip: { ownerId } }` and `orderBy: { position: "asc" }`.
  - `removeForOwner`: in one `db.$transaction`, `findFirst({ where: { id, trip: { ownerId } } })`. Missing → `not-found`. Otherwise `delete`. A `P2003` error (a foreign key from F4 or F6 still refers to the person) becomes `in-use` with the person's name. Any other error is rethrown.
  - All queries use Prisma parameters only (project rules).
- **Done when:** the code review items below are checked. `npm run typecheck` is clean. No unit test (the store needs a database, so it is verified in code review).
- **Covers:** F3.R2, F3.R3, F3.R4, F3.R7

### F3.T5 — Trip delete removes people
- **Files:** `app/api/src/trips/prisma-store.ts` (created in F2.T4)
- **Depends on:** F3.T4, F2.T4
- **Work:**
  - Inside the existing `deleteForOwner` transaction, delete the trip's people first: `person.deleteMany({ where: { tripId, trip: { ownerId } } })`. Then delete the trip row (F2.R7, spec Data "Cascade").
  - The `onDelete: Cascade` on `Person` is a safety net only. The explicit delete keeps the order right when F4 and F6 add their own rows.
- **Done when:** the code review item below is checked. `npm run typecheck` is clean.
- **Covers:** F2.R7 (extended to people), F3 Data & contract "Cascade"

### F3.T6 — People routes
- **Files:** `app/api/src/routes/people.ts`, `app/api/src/routes/people.test.ts`, `app/api/src/server.ts` (accepts an optional `people` store, like F1.T7's `auth` option)
- **Depends on:** F3.T2, F3.T4, F2.T5, F1.T7, F1.T8
- **Work:**
  - `POST /trips/:tripId/people` with body `{ name }` → 201 with `{ id, name, position }`. `GET /trips/:tripId/people` → 200 with the array. `DELETE /people/:id` → 204.
  - All three are behind `requireLogin`. The owner is always `request.userId`, never a value from the body (F3.R7).
  - Errors go through `toHttpError`. Validation failures return 400 `{ "error" }`.
  - Route tests use `buildServer({ logger: false, people: fake })` with `app.inject`.
- **Done when:** route tests named `F3.AC11` (no cookie → 401, and the store is not called), `F3.AC2` (duplicate → 409 with the message), and `F3.AC5` (in use → 409 with the blocked message) pass.
- **Covers:** F3.R2, F3.R4, F3.R7, F3.AC2, F3.AC5, F3.AC11

### F3.T7 — Web people API client
- **Files:** `app/web/src/people/api.ts`, `app/web/src/people/api.test.ts`
- **Depends on:** F3.T6 (contract), F2.T6 (the `/api/...` pattern)
- **Work:**
  - `addPerson(tripId, name)`, `listPeople(tripId)`, `removePerson(personId)`, calling `/api/trips/:tripId/people` and `/api/people/:id`.
  - A non-2xx response throws an error that carries the server's `error` text. A network failure or a 5xx response throws a generic error, so the screen can show `"Something went wrong. Try again."`.
- **Done when:** tests named `F3.AC2` (a 409 duplicate message is passed through) and `F3.AC5` (a 409 blocked message is passed through) pass with a stubbed `fetch`.
- **Covers:** F3.R2, F3.R4, F3.AC2, F3.AC5

### F3.T8 — Add person form
- **Files:** `app/web/src/people/AddPersonForm.tsx`, `app/web/src/people/AddPersonForm.test.tsx`
- **Depends on:** F3.T7
- **Work:**
  - A name field with a visible label. Its error text is linked with `aria-describedby` and announced (`role="alert"`).
  - Enter submits. The Add button is disabled while the request is in progress.
  - Shows the error text from the API. Any other failure shows `"Something went wrong. Try again."`.
- **Done when:** tests named `F3.AC3` (an empty name and a 51-character name each show their error) and `F3.AC14` (a spaces-only name shows `"Enter a name."`) pass, with the API client replaced by a fake.
- **Covers:** F3.R1, F3.AC3, F3.AC14

### F3.T9 — People section on the trip page
- **Files:** `app/web/src/people/PeopleSection.tsx`, `app/web/src/people/PeopleSection.test.tsx`, `app/web/src/pages/TripPage.tsx` (adds the section under the trip name, F2.T10), `app/web/src/pages/TripPage.test.tsx`
- **Depends on:** F3.T7, F3.T8, F2.T10
- **Work:**
  - Loads the list with a loading state. Shows the empty-state copy from the spec's States table when there are no people.
  - Renders people in the order the API returns them. A person added appears at the bottom. The name is shown exactly as stored, with its capitals.
  - Each row has a Remove control named `Remove <name>`. The row has no rename control (F3.R6).
- **Done when:** tests named `F3.AC1` (an added person appears at the bottom), `F3.AC4` (rows render in the given order), `F3.AC9` (no rename control), `F3.AC15` (the name shows as "Sam"), and `F3.AC16` (the empty-state message shows with no people) pass.
- **Covers:** F3.R1, F3.R3, F3.R6, F3.R2 (display), F3.AC1, F3.AC4, F3.AC9, F3.AC15, F3.AC16

### F3.T10 — Remove person dialog
- **Files:** `app/web/src/people/RemovePersonDialog.tsx`, `app/web/src/people/RemovePersonDialog.test.tsx`, `app/web/src/people/PeopleSection.tsx` (wires the dialog and the refresh)
- **Depends on:** F3.T9
- **Work:**
  - Title `Remove <name> from the trip?`, with Cancel and Remove buttons. Focus starts on Cancel. Escape closes without removing. Focus returns to the row's Remove control when the dialog closes.
  - Cancel closes the dialog and calls nothing. Remove calls `removePerson` once, then refreshes the list. The Remove button is disabled while the request runs.
- **Done when:** tests named `F3.AC7` (Cancel does not call the remove) and `F3.AC8` (Remove calls it once for the chosen person) pass.
- **Covers:** F3.R5, F3.AC7, F3.AC8

### F3.T11 — Blocked removal message
- **Files:** `app/web/src/people/RemovePersonDialog.tsx`, `app/web/src/people/RemovePersonDialog.test.tsx`
- **Depends on:** F3.T10, F3.T7
- **Work:**
  - When `removePerson` fails with the blocked message, show it inside the dialog with `role="alert"`, so screen readers announce it. The person stays on the list.
  - Any other failure shows `"Something went wrong. Try again."`.
- **Done when:** a test named `F3.AC5` (the blocked message shows, and the person is still in the list) passes.
- **Covers:** F3.R4, F3.AC5

## Acceptance criteria map
Every AC in the spec appears once.

| AC | How it is checked | Test name(s) or review item | File |
|---|---|---|---|
| F3.AC1 | Unit test | `F3.AC1 adds a person at the end of the order` (service); `F3.AC1 a person added appears at the bottom of the list` (T9) | `app/api/src/people/service.test.ts`, `app/web/src/people/PeopleSection.test.tsx` |
| F3.AC2 | Unit test | `F3.AC2 refuses a name that matches ignoring capitals` (service); `F3.AC2 returns 409 with the duplicate message` (routes); `F3.AC2 surfaces the duplicate message from a 409` (client) | `service.test.ts`, `app/api/src/routes/people.test.ts`, `app/web/src/people/api.test.ts` |
| F3.AC3 | Unit test | `F3.AC3 rejects empty and 51-character names, accepts 50` (rules); `F3.AC3 shows the error for an empty or 51-character name` (form) | `app/api/src/people/rules.test.ts`, `app/web/src/people/AddPersonForm.test.tsx` |
| F3.AC4 | Unit test | `F3.AC4 lists people in position order` (service); `F3.AC4 renders people in the order given` (section) | `service.test.ts`, `PeopleSection.test.tsx` |
| F3.AC5 | Unit test | `F3.AC5 refuses removal when the store reports an expense` (service); `F3.AC5 returns 409 with the blocked message` (routes); `F3.AC5 surfaces the blocked message from a 409` (client); `F3.AC5 shows the blocked message and keeps the person` (dialog) | `service.test.ts`, `routes/people.test.ts`, `api.test.ts`, `RemovePersonDialog.test.tsx` |
| F3.AC6 | Unit test | `F3.AC6 refuses removal when the store reports a payment` | `app/api/src/people/service.test.ts` |
| F3.AC7 | Unit test | `F3.AC7 Cancel does not call the remove` | `app/web/src/people/RemovePersonDialog.test.tsx` |
| F3.AC8 | Unit test | `F3.AC8 Remove calls remove once for the chosen person` | `app/web/src/people/RemovePersonDialog.test.tsx` |
| F3.AC9 | Unit test | `F3.AC9 person row has no rename control` | `app/web/src/people/PeopleSection.test.tsx` |
| F3.AC10 | Code review | The people queries include the trip owner check in the database query (T4 checklist) | — |
| F3.AC11 | Unit test | `F3.AC11 rejects add and remove with no session before the store` (service); `F3.AC11 returns 401 with no cookie and does not call the store` (routes) | `service.test.ts`, `routes/people.test.ts` |
| F3.AC12 | Unit test | `F3.AC12 person view holds only id, name and position` | `app/api/src/people/service.test.ts` |
| F3.AC13 | Unit test | `F3.AC13 add and remove never touch expense or payment data` (the service receives only the people store) | `app/api/src/people/service.test.ts` |
| F3.AC14 | Unit test | `F3.AC14 trims surrounding spaces and treats spaces-only as empty` (rules); `F3.AC14 a spaces-only name shows "Enter a name."` (form) | `rules.test.ts`, `AddPersonForm.test.tsx` |
| F3.AC15 | Unit test | `F3.AC15 shows the name as typed, with its capitals` | `app/web/src/people/PeopleSection.test.tsx` |
| F3.AC16 | Unit test | `F3.AC16 shows the empty-state message when there are no people` | `app/web/src/people/PeopleSection.test.tsx` |

Count: 16 ACs in the spec, 16 rows here. 15 are unit tests and 1 is code review (F3.AC10). The database rules behind F3.AC2, F3.AC5 and F3.AC6 are also code review items in the checklist below.

## Build order
1. F3.T1 — Person name rules
2. F3.T2 — People service with fakes (after T1)
3. F3.T3 — Person table and migration (after F2.T3; migration needs a person's review)
4. F3.T4 — Prisma people store (after T2, T3)
5. F3.T5 — Trip delete removes people (after T4)
6. F3.T6 — People routes (after T2, T4)
7. F3.T7 — Web people API client (after T6)
8. F3.T8 — Add person form (after T7)
9. F3.T9 — People section on the trip page (after T7, T8)
10. F3.T10 — Remove person dialog (after T9)
11. F3.T11 — Blocked removal message (after T10)

Cross-feature dependencies: **F1** must be built first (app factory, `requireLogin`, `User` model). **F2** must be built first (`Trip` model, `deleteForOwner` transaction, trip routes, trip page). F4 and F6 add their rows to the trip delete and set their references to people to `onDelete: Restrict`, so removal of a person in use is refused by the database (F3.R4). Until F4 and F6 exist, no database row can block removal, so the blocked path is tested with fakes only.

## Verification
- From `app/`: `npm run typecheck`, then `npm test`.
- Code review checklist (every AC marked "Code review" above, and the database rules behind the unit-tested ACs, as checkable statements):
  - [ ] F3.AC10: every people query (list, add, remove) filters by the trip owner inside the database query, with `trip: { ownerId }` or `findFirst({ where: { id, ownerId } })`. No query reads the owner from the request.
  - [ ] F3.AC2 (database): `migration.sql` has a unique index on (`trip_id`, `name_key`), and the store turns only that `P2002` into `duplicate`.
  - [ ] F3.AC5 and F3.AC6 (database): the removal check and the `delete` run in the same `db.$transaction`, and only a `P2003` from a foreign key becomes `in-use`. F4 and F6 plans set `onDelete: Restrict` on their person references.
  - [ ] F3.R3: position is assigned inside the add transaction, and `migration.sql` has a unique index on (`trip_id`, `position`).
  - [ ] F2.R7: `deleteForOwner` deletes the trip's people before the trip row, in the same transaction.
  - [ ] F3.T3: a person reviewed `migration.sql` before it was applied to any shared database.

## Decisions log
- 2026-11-05: Where do the name rules live? → `app/api/src/people/rules.ts`, not `trips/rules.ts`. The messages differ ("Enter a name." vs "Enter a trip name."), and the trim and length logic is three lines. Extract a shared helper when a third copy appears.
- 2026-11-05: How is removal blocked before F4 and F6 exist? → The store deletes the person and maps a foreign-key error (`P2003`) to `in-use`, in one transaction. The spec's Constraints section says F4 and F6 foreign keys enforce R4, so the database blocks removal and the service stays free of expense and payment code. Chosen over an explicit "is this person used" query, which would need tables that don't exist yet.
- 2026-11-05: Routes. → `POST /trips/:tripId/people`, `GET /trips/:tripId/people`, `DELETE /people/:id`. The delete path takes the person ID as the spec says, and the store checks the owner through the trip relation.
- 2026-11-05: How is the position chosen? → The highest position in the trip plus one, read and written in the same transaction, with a unique index on (`trip_id`, `position`) as a backstop. Positions may have gaps after a removal, which doesn't change the order (F3.R3).
- 2026-11-05: Name key. → `name.trim().toLowerCase()`, stored in `name_key` and used for the unique index (F3.R2).
- 2026-11-05: Spec change: the Dependencies line now says F1 is Approved (the stale Draft line is fixed), and F3.AC16 was added for the empty-state message. The plan was approved by the user with these changes, so T9 and the AC map include AC16.
- 2026-11-05: Trip delete cascade. → The F2 transaction deletes people explicitly before the trip, and `Person.tripId` has `onDelete: Cascade` as a backstop. F4 and F6 must delete their rows before people, because their references to people are `Restrict`.
- 2026-11-05: Not-found copy for a missing person (remove). The spec's States table gives "Trip not found." for missing or not-owned, and F3.R7 says the same response as a missing trip. → The API returns 404 `{ "error": "Trip not found." }` for a missing or not-owned person too. Flagged for the user to confirm, because the copy says "trip" when a person was not found.
- 2026-11-05: The spec's Dependencies line says F1 is Draft. The F1 spec and plan status lines both say Approved (2026-11-04), so the line looks stale. The spec was not edited (plan skill rule). Fix it through `/spec-feature F3` when convenient. It does not block the plan.

## Sent back to the spec
None. Every requirement and acceptance criterion has enough detail to build.
