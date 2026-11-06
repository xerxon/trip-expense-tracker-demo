# F2 plan — Trips

_Status: Approved · Spec: `docs/specs/features/F2-trips.md` (Approved) · Last updated: 2026-11-05_

## Approach
Build the trip rules first as pure functions (name trimming and length, newest-first ordering, the view shape), then the service with a fake store, then the `Trip` table and a Prisma store. The store does every ownership check inside its query, and the delete runs in one transaction. The HTTP routes (`POST /trips`, `GET /trips`, `GET /trips/:id`, `DELETE /trips/:id`) sit behind F1's `requireLogin` guard. The web screens come last: a Create trip page, the Trips list with its empty state and row links, the delete dialog, and the trip page that shows the trip name as its only content.

## Tasks
Each task is one commit. Its commit message starts with its ID, for example `F2.T1 add trip name rules`.

### F2.T1 — Trip name rules
- **Files:** `app/api/src/trips/rules.ts`, `app/api/src/trips/rules.test.ts`
- **Depends on:** none
- **Work:**
  - `normalizeTripName(name)`: trims surrounding spaces (F2.R1).
  - `validateTripName(name)`: after normalizing, empty returns "Enter a trip name."; more than 50 characters returns "Trip names can be up to 50 characters."; otherwise null. Length is counted in code points, so `Array.from(name).length` (see Decisions log) (F2.R1).
  - `newestFirst(trips)`: sorts by `createdAt` descending, then `id` descending, and returns a new array (F2.R4, F2.R10).
  - No imports from Prisma, Fastify or the network.
- **Done when:** `F2.AC2`, `F2.AC14` tests pass in `rules.test.ts`, and the `F2.AC6` ordering test passes (`newestFirst` puts the newest trip first).
- **Covers:** F2.R1, F2.R4, F2.R10, F2.AC2, F2.AC6, F2.AC14

### F2.T2 — Trip service with fakes
- **Files:** `app/api/src/trips/types.ts`, `app/api/src/trips/service.ts`, `app/api/src/trips/service.test.ts`
- **Depends on:** F2.T1
- **Work:**
  - `types.ts`: `Trip` (`id`, `ownerId`, `name`, `createdAt: Date`), `TripStore` (`create`, `listByOwner`, `findForOwner` returning the trip or null, `deleteForOwner` returning the count of rows deleted), `TripNotFoundError`, and the logger type. No database import.
  - `createTrip(store, { ownerId, name })`: validates and trims with T1, then calls `store.create`. `ownerId` comes only from the session (F2.R2). Validation errors are thrown as a `TripValidationError` carrying the copy.
  - `listTrips(store, ownerId)`: calls `store.listByOwner` and returns the result through `newestFirst` (F2.R4).
  - `getTrip(store, ownerId, tripId)`: calls `store.findForOwner`. A null result throws `TripNotFoundError`, which covers both a missing trip and one owned by someone else (F2.R9, F2.R12).
  - `deleteTrip(store, ownerId, tripId)`: calls `store.deleteForOwner`. A count of 0 throws `TripNotFoundError`, which covers both a missing trip and one owned by someone else (F2.R9).
  - `toTripView(trip)`: returns `{ id, name, created_at }` with `created_at` as an ISO UTC string (F2.R10).
  - Logging: event names with trip id and user id only, through the injected logger. Never the trip name (project rules on personal data).
  - Other errors are rethrown, never swallowed (project rules).
- **Done when:** the named service tests pass against a fake store and a fake logger, including `F2.AC17 getTrip throws not-found for a trip the owner does not have`.
- **Covers:** F2.R1, F2.R2, F2.R4, F2.R9, F2.R10, F2.R12, F2.AC1, F2.AC3, F2.AC4, F2.AC6, F2.AC17

### F2.T3 — Trip table and migration
- **Files:** `app/api/prisma/schema.prisma`, `app/api/prisma/migrations/<timestamp>_add_trips/migration.sql` (generated)
- **Depends on:** F1.T4 (the `User` model)
- **Work:**
  - `Trip`: `id` (uuid), `ownerId` (required, references `User`), `name` (required), `createdAt` (UTC, default now).
  - Index on `(ownerId, createdAt)`, since trips are read by owner and ordered by creation time (spec Data & contract).
  - No unique constraint and no normalized key on `name`, because the spec allows duplicate names for one owner (F2.AC3, see Decisions log).
  - Generate with `npm run db:migrate -w api -- --name add_trips`, then `npm run db:generate -w api`.
  - **Stop for person review:** a person reads `migration.sql` and approves it before it is committed or applied to a shared database (CLAUDE.md, project rules).
- **Done when:** the migration is approved by a person; `npm run typecheck -w api` passes; the `(ownerId, createdAt)` index is in `migration.sql`; the `ownerId` foreign key is in `migration.sql`.
- **Covers:** F2.R10 (column), F2.R2 (owner column), F2.R9 (owner link), Data & contract

### F2.T4 — Prisma trip store
- **Files:** `app/api/src/trips/prisma-store.ts`
- **Depends on:** F2.T2, F2.T3
- **Work:**
  - `createTripStore(db)` implements `TripStore`.
  - `listByOwner(ownerId)`: `findMany` with `where: { ownerId }` and `orderBy: [{ createdAt: "desc" }, { id: "desc" }]` (F2.R4, F2.AC5).
  - `findForOwner(ownerId, tripId)`: `findFirst` with `where: { id: tripId, ownerId }`, returning the trip or null (F2.R9, F2.R12). It uses `findFirst`, not `findUnique`, because `ownerId` is not unique on its own (see Decisions log).
  - `deleteForOwner(ownerId, tripId)`: runs inside `db.$transaction`, with `deleteMany({ where: { id: tripId, ownerId } })` and returns the count. The transaction is the seam where F3, F4 and F6 add their deletes (F2.R7). The ownership check is inside the query (F2.R9).
  - `create` uses Prisma `create` with parameters only (project rules).
  - This file has no logic beyond the Prisma calls, so its acceptance criteria are checked in code review, not unit tests.
- **Done when:** the code review items for F2.AC5, F2.AC10 and F2.AC11 pass (see Verification).
- **Covers:** F2.R4, F2.R7, F2.R9, F2.R12, F2.AC5, F2.AC10, F2.AC11

### F2.T5 — Trip routes
- **Files:** `app/api/src/routes/trips.ts`, `app/api/src/routes/trips.test.ts`, `app/api/src/server.ts`
- **Depends on:** F2.T2, F2.T4, F1.T7 (app factory and cookie plugin), F1.T8 (`requireLogin`)
- **Work:**
  - `buildServer({ logger, auth, trips })` takes an optional `trips` store, so tests inject a fake and the default is the Prisma store. The existing `/health` test must still pass.
  - `POST /trips`: `requireLogin` first. Reads `name` from the body only and ignores any `ownerId` (F2.R2). A validation error returns 400 `{ "error": "<copy>" }` and calls no store method. Success returns 201 with `{ id, name, created_at }`.
  - `GET /trips`: `requireLogin`, then the list for the session user, returned as an array of views.
  - `GET /trips/:id`: `requireLogin`, then `getTrip`. Success returns 200 with the view. `TripNotFoundError` returns 404 `{ "error": "Trip not found." }`, the same response for a missing or not-owned trip (F2.R12, F1.R9).
  - `DELETE /trips/:id`: `requireLogin`, then delete. Success returns 204 with no body. `TripNotFoundError` returns 404 `{ "error": "Trip not found." }`, the same response for a missing or not-owned trip (F1.R9).
  - Requests with no session get 401 `{ "error": "Log in required" }` from the guard, before any store call (F1.R10).
  - Other errors reach the Fastify error handler (F1.T7), with no swallowing.
  - Validation is done in the route code, not by Fastify schema validation, so the 400 body keeps the `{ "error" }` shape (F2.AC15).
- **Done when:** route tests with `app.inject` and a fake store pass for F2.AC1, F2.AC4, F2.AC12 (including GET), F2.AC15 and F2.AC17 (GET returns 404 for another user's or a missing trip); the `/health` test still passes.
- **Covers:** F2.R1, F2.R2, F2.R3 (response data), F2.R9, F2.R10, F2.R12, F2.AC1, F2.AC4, F2.AC12, F2.AC15, F2.AC17

### F2.T6 — Web trips API client
- **Files:** `app/web/src/trips/api.ts`, `app/web/src/trips/api.test.ts`
- **Depends on:** F2.T5 (contract), F1.T10 (the `api.ts` pattern for `/api/...` paths)
- **Work:**
  - `listTrips()`, `getTrip(id)`, `createTrip(name)`, `deleteTrip(id)`. Calls use relative `/api/trips` paths, which the Vite proxy strips. Same-origin cookies only.
  - A 401 response raises a session-ended error that the app turns into a redirect to Log in (F1.R8, spec edge case "Session ends while the create form is open").
  - Any other non-2xx response raises an error carrying the server's `error` text, or "Something went wrong. Try again." when there is none. A 404 from `getTrip` carries "Trip not found." (F2.R12). The client does not duplicate validation rules (F1 decision: validation lives only in the API).
- **Done when:** tests with a fake `fetch` pass for F2.AC12 (a 401 becomes the session-ended error) and the error mapping, including the 404 text from `getTrip`.
- **Covers:** F2.R9 (web side), F2.R12 (web side), F2.AC12, spec States & errors (server error)

### F2.T7 — Create trip page
- **Files:** `app/web/src/pages/CreateTripPage.tsx`, `app/web/src/pages/CreateTripPage.test.tsx`, `app/web/src/App.tsx` (adds the `/trips/new` route)
- **Depends on:** F2.T6, F1.T11 (app shell and router)
- **Work:**
  - A separate page at `/trips/new`, opened from a Create trip button on Trips (spec Decisions log).
  - Form with a visible label on the name field. Errors linked to the field and announced (`role="alert"`). Focus moves to the field on error. Enter submits. The Create button is disabled while the request is in flight (spec Accessibility and Loading).
  - Shows the server's error text for a 400 (for example "Enter a trip name."). On success it goes to `/trips`, where the new trip is at the top.
  - Other errors show "Something went wrong. Try again."
- **Done when:** component tests pass for F2.AC1 (success navigates to Trips), F2.AC2 (the server's name error is shown and no success call happens), and the router test for F2.AC1 passes (the new trip is at the top after creation).
- **Covers:** F2.R1, F2.R3, F2.AC1, F2.AC2

### F2.T8 — Trips list, empty state and row links
- **Files:** `app/web/src/pages/TripsPage.tsx` (replaces the F1 placeholder), `app/web/src/pages/TripsPage.test.tsx`
- **Depends on:** F2.T6, F1.T11
- **Work:**
  - Loads `listTrips()` and shows a loading state. The list shows the server's order and each row shows only the trip name (F2.R4).
  - Each trip name is a link to `/trips/:id` (F2.R11). The link's text is the trip name, so screen-reader users can tell rows apart.
  - Empty state: "You don't have any trips yet." and a Create trip button (F2.R5).
  - Each row has a Delete control with an accessible name that includes the trip name, for example "Delete Lisbon trip" (spec Accessibility). The Delete control opens the dialog from F2.T9; this task renders the button only.
  - No edit control on rows (F2.R8).
  - "Something went wrong. Try again." when the list fails.
- **Done when:** component tests pass for F2.AC6 (each row shows only the name, in the order given), F2.AC7 (empty state with the message and the button), F2.AC13 (no edit control on a row), and F2.AC16 (each name links to `/trips/:id`).
- **Covers:** F2.R4, F2.R5, F2.R8, F2.R11, F2.AC6, F2.AC7, F2.AC13, F2.AC16

### F2.T9 — Delete trip dialog
- **Files:** `app/web/src/trips/DeleteTripDialog.tsx`, `app/web/src/trips/DeleteTripDialog.test.tsx`, `app/web/src/pages/TripsPage.tsx` (wires the dialog and the refresh)
- **Depends on:** F2.T8
- **Work:**
  - Dialog with title "Delete this trip?", body "This removes the trip and everything in it. This can't be undone.", and Cancel and Delete buttons (spec States & errors).
  - Focus starts on Cancel, is trapped while open, and Escape closes without deleting. Focus returns to the row's Delete button on Cancel. After a confirmed delete the row is gone, so focus moves to the Trips heading (see Decisions log).
  - Cancel closes the dialog and calls nothing. Delete calls `deleteTrip(id)` once for the chosen trip, disables both buttons while the request runs, then refreshes the list without that trip (F2.R6, F2.R7 on the web side).
  - Reduced motion removes any dialog animation.
  - A failed delete shows "Something went wrong. Try again." and leaves the trip in the list.
- **Done when:** component tests pass for F2.AC8 (Cancel does not call the delete) and F2.AC9 (Delete calls it once for the chosen trip, and the row goes away).
- **Covers:** F2.R6, F2.R7, F2.AC8, F2.AC9

### F2.T10 — Trip page
- **Files:** `app/web/src/pages/TripPage.tsx`, `app/web/src/pages/TripPage.test.tsx`, `app/web/src/App.tsx` (adds the `/trips/:id` route)
- **Depends on:** F2.T6 (`getTrip`), F2.T8 (row links point here), F1.T11 (router)
- **Work:**
  - Reads `:id` from the route and calls `getTrip(id)`. Shows a loading state while it fetches.
  - Shows the trip name as the page's only top-level heading and no other trip content (F2.R12, spec Accessibility).
  - A 404 shows "Trip not found." (spec States & errors). Other errors show "Something went wrong. Try again."
  - Registered after `/trips/new` in `App.tsx`, so the static path is not read as an id (see Decisions log).
- **Done when:** component tests pass for F2.AC16 (the name is the only heading) and F2.AC17 (a 404 shows "Trip not found." and no trip data).
- **Covers:** F2.R12, F2.AC16, F2.AC17

## Acceptance criteria map
Every AC in the spec appears once.

| AC | How it is checked | Test name(s) or review item | File |
|---|---|---|---|
| F2.AC1 | Unit test | `F2.AC1 create saves the trimmed name and returns the trip` (T2); `F2.AC1 POST returns 201 with id, name and created_at` (T5); `F2.AC1 after create the new trip is at the top of Trips` (T7) | `service.test.ts`, `trips.test.ts`, `CreateTripPage.test.tsx` |
| F2.AC2 | Unit test | `F2.AC2 rejects empty, spaces-only and 51-character names, accepts 50` (T1); `F2.AC2 shows the name error and calls no success` (T7) | `rules.test.ts`, `CreateTripPage.test.tsx` |
| F2.AC3 | Unit test | `F2.AC3 accepts a duplicate name for the same owner` (T2) | `service.test.ts` |
| F2.AC4 | Unit test | `F2.AC4 owner comes from the session user and ignores one in the request` (T2); `F2.AC4 POST ignores an ownerId in the body` (T5) | `service.test.ts`, `trips.test.ts` |
| F2.AC5 | Code review | The list query filters by the session user's ID in the database query (T4) | — |
| F2.AC6 | Unit test | `F2.AC6 newestFirst puts the newest trip first` (T1); `F2.AC6 row shows only the trip name, in the order given` (T8) | `rules.test.ts`, `TripsPage.test.tsx` |
| F2.AC7 | Unit test | `F2.AC7 empty list shows the message and the Create trip button` (T8) | `TripsPage.test.tsx` |
| F2.AC8 | Unit test | `F2.AC8 Cancel closes the dialog and does not call delete` (T9) | `DeleteTripDialog.test.tsx` |
| F2.AC9 | Unit test | `F2.AC9 Delete calls deleteTrip once for the chosen trip and the row is removed` (T9) | `DeleteTripDialog.test.tsx` |
| F2.AC10 | Code review | The delete runs in one transaction and rolls back on error (T4) | — |
| F2.AC11 | Code review | The `findFirst` for get and the `deleteMany` for delete include `ownerId` in the same query, and a not-owned trip returns the same 404 as a missing trip (T4, T5) | — |
| F2.AC12 | Unit test | `F2.AC12 create, list, get and delete return 401 without a session and never call the store` (T5); `F2.AC12 a 401 from a trip call becomes the session-ended error` (T6) | `trips.test.ts`, `api.test.ts` |
| F2.AC13 | Unit test | `F2.AC13 trip row has no edit control` (T8) | `TripsPage.test.tsx` |
| F2.AC14 | Unit test | `F2.AC14 trims surrounding spaces and treats spaces-only as empty` (T1) | `rules.test.ts` |
| F2.AC15 | Unit test | `F2.AC15 validation error gives 400 with an error body and no store call` (T5) | `trips.test.ts` |
| F2.AC16 | Unit test | `F2.AC16 trip name in a row links to /trips/:id` (T8); `F2.AC16 trip page shows the name as its only heading` (T10) | `TripsPage.test.tsx`, `TripPage.test.tsx` |
| F2.AC17 | Unit test | `F2.AC17 getTrip throws not-found for a trip the owner does not have` (T2); `F2.AC17 GET /trips/:id returns 404 Trip not found. for another user's or a missing trip` (T5); `F2.AC17 trip page shows Trip not found. on a 404` (T10) | `service.test.ts`, `trips.test.ts`, `TripPage.test.tsx` |

Counts: 17 ACs. 14 have unit tests (API and web); 3 are code review (F2.AC5, F2.AC10, F2.AC11).

Carried over from F1, checked here (F1 plan, deferred to F2):
- **F1.AC9** (another user's trip gives the same response as a missing trip): code review in T5 and T4.
- **F1.AC11** (the ownership check is inside the trip query): code review in T4.

## Build order
1. F2.T1 — Trip name rules
2. F2.T2 — Trip service with fakes (after T1)
3. F2.T3 — Trip table and migration (after F1.T4; **person review of migration.sql**)
4. F2.T4 — Prisma trip store (after T2, T3)
5. F2.T5 — Trip routes (after T2, T4, F1.T7, F1.T8)
6. F2.T6 — Web trips API client (after T5 contract)
7. F2.T7 — Create trip page (after T6, F1.T11)
8. F2.T8 — Trips list, empty state and row links (after T6, F1.T11)
9. F2.T9 — Delete trip dialog (after T8)
10. F2.T10 — Trip page (after T6, T8, F1.T11)

Cross-feature dependencies: **F1** must be built first. F2 uses `requireLogin` (F1.T8), the app factory and cookie plugin (F1.T7), the `User` model (F1.T4), and the web router and shell (F1.T9–T11). F1 spec and plan are both Approved; F1 still needs to be built before F2 is built. F3, F4 and F6 add their deletes to the F2.T4 transaction (spec R7), and their sections to the F2.T10 trip page (spec Dependencies).

## Verification
- From `app/`: `npm run typecheck`, then `npm test`, then `npm run build`.
- Code review checklist (every AC marked "Code review" above, as a checkable statement):
  - [ ] F2.AC5: the list query in `prisma-store.ts` has `where: { ownerId }` built from the session user, not from the request.
  - [ ] F2.AC10: `deleteForOwner` runs inside `db.$transaction`, and an error inside it rolls back the delete.
  - [ ] F2.AC11: the get query (`findFirst`) and the delete query (`deleteMany`) each include `ownerId` in the same `where`. A not-owned trip and a missing trip both return the same 404 body, `{ "error": "Trip not found." }`.
  - [ ] F1.AC9 (deferred to F2): another user's trip lookup returns the same response as a missing trip.
  - [ ] F1.AC11 (deferred to F2): the ownership check is inside the trip query, not a separate check after load.
  - [ ] Migration `add_trips` reviewed and approved by a person before it is committed.
  - [ ] Every Prisma query uses parameters; no query is built from strings.
  - [ ] No `console` or `print` calls; no trip name, user email or session token appears in a log line.
  - [ ] `POST /trips` and `GET /trips/:id` never read `ownerId` from the request.

## Decisions log
- 2026-11-04: Trip name length is counted in Unicode code points (`Array.from(name).length`) → Users read "characters" as what they see, so an emoji counts as one. The spec says nothing more precise.
- 2026-11-04: Equal `createdAt` values → Ordered by `id` descending as a tie-break, so the order is fixed but arbitrary between two trips created in the same millisecond.
- 2026-11-04: Trip name uniqueness → None. Duplicates are allowed (F2.AC3), so the CLAUDE.md normalized key column is not added to `Trip`. It applies only where the spec requires uniqueness.
- 2026-11-04: Index → `(ownerId, createdAt)` for the owner-filtered, newest-first list.
- 2026-11-04: Route paths → `POST /trips`, `GET /trips`, `DELETE /trips/:id`, served through the Vite `/api` proxy like F1's routes. Success codes: 201 create, 204 delete.
- 2026-11-04: Not-found response → 404 `{ "error": "Trip not found." }`, the same for a missing or not-owned trip (F1.R9). The copy comes from the spec's States table.
- 2026-11-04: Validation → checked in route code, not by Fastify schema validation, so the 400 body is `{ "error" }` (F2.AC15).
- 2026-11-04: Ownership → the Prisma `deleteMany` filters on `id` and `ownerId` together. Its count of 0 means "not found", which covers both a missing trip and another user's trip.
- 2026-11-04: Transaction → the delete goes through `db.$transaction` in the store now, so F3, F4 and F6 add their deletes to it (spec R7).
- 2026-11-04: Auth → the guard is applied in each trip route. The no-session check is a guard test (F2.AC12), not a service check, because services receive a user ID and never see the session.
- 2026-11-04: Logging → event names with trip ID and user ID only. The trip name is personal data and is never logged.
- 2026-11-04: Focus after a confirmed delete → moves to the Trips heading, because the row's Delete button no longer exists. Cancel returns focus to that button as the spec requires.
- 2026-11-04: Create trip route → `/trips/new`, a static path, so it does not clash with a `/trips/:id` route.
- 2026-11-04: Spec dependency note is out of date. The F2 spec's Dependencies section says F1 is Draft, but the F1 spec now reads Approved (2026-11-04). This plan treats F1 as approved. F1 still needs to be built before F2 is built. The spec note needs correcting through `/spec-feature F2`.
- 2026-11-04: Plan approved by the user. Tasks F2.T1–T9 are buildable; the trip page task stays out until the Sent back item is answered.
- 2026-11-04: Test style → the pure rules and service run with fakes. The route tests use `app.inject` with a fake store, as F1 does. No real database in unit tests (project rules).
- 2026-11-05: Spec change. The spec added the row link (R11), the trip page (R12), `GET /trips/:id` and ACs 16–17. Changed: T2 (`findForOwner`, `getTrip`), T4 (`findForOwner`), T5 (GET route), T6 (`getTrip`), T8 (row links). Added: T10 (trip page). The Sent back question below is answered in the spec.
- 2026-11-05: Read query → `findFirst` with `where: { id, ownerId }`, not `findUnique`. `findUnique` takes only unique fields, and `ownerId` is not unique on its own. It is the same owner-in-the-query pattern as the delete.
- 2026-11-05: Trip page route → `/trips/:id` is registered after `/trips/new`. react-router ranks a static segment above a dynamic one, so `/trips/new` still wins. The router test checks this.
- 2026-11-05: Plan re-approval needed. The 2026-11-04 approval covered the earlier tasks, and T2, T4, T5, T6, T8 and T10 have changed. This plan is Draft until the user approves it again.
- 2026-11-05: Plan approved by the user (re-approval after the spec change above).

## Sent back to the spec
None. The trip page and row-link questions were answered on 2026-11-05 and are in the spec as R11 and R12.
