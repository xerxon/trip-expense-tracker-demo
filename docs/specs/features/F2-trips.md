# F2 — Trips

_Status: Approved · Last updated: 2026-11-04 · Source: product.md §3, §2, §4 (R8)_

## Summary
A logged-in user creates a trip with a name, sees a list of their own trips, and deletes a trip they no longer need. Trips are the container for everything else in the app: people (F3), expenses (F4), balances (F5) and settling up (F6). This feature guarantees that a user sees and changes only their own trips.

## User stories
- As a user, I want to create a trip with a name, so that I can start tracking its shared spending.
- As a user, I want to see a list of my trips, so that I can open the one I need.
- As a user, I want to delete a trip I no longer need, so that my list stays clean.
- As a user, I want my trips hidden from everyone else, so that my trip data stays private.

## Scope
**In:**
- Create a trip with a name (product.md §3 F2)
- List your trips (product.md §3 F2)
- Delete a trip, with confirmation, removing everything in it (product.md §3 F2, R8)
- Ownership: a user sees and changes only their own trips (product.md §2 Ownership rule; F2 "Done when")
- Empty state on the trip list

**Out:**
- Editing a trip's name or any other field (product.md §2 Assumptions: no editing)
- Trip dates, description, currency or any other trip field (product.md §3 F2 lists only a name)
- Trip page contents: people (F3), expenses (F4), balances (F5), settling up (F6)
- Sharing trips with other users (product.md "After the core": out of scope)
- Undo after delete (not stated anywhere in product.md, and deletion is confirmed before it happens)
- Deleting people, expenses or payments individually (F3, F4, F6)

## User flow & screens
Screens: **Trips** (the landing page from F1), **Create trip** (a separate page, opened from a Create trip button on Trips), and the **Delete trip** confirmation dialog. No mock screens exist in `docs/design`.

1. **Empty list.** A new user lands on Trips and sees the empty-state message with a Create trip button (R5).
2. **Create a trip.** User chooses Create trip, enters a name, and submits. The trip is saved and the user is back on Trips, with the new trip at the top of the list (R1, R3).
3. **View trips.** Trips shows only the user's own trips, newest first, each row showing the name only (R4).
4. **Delete a trip.** User chooses Delete on a trip row. A dialog asks them to confirm, with Cancel and Delete buttons (R6). Cancel closes the dialog and nothing changes. Delete removes the trip and everything in it, then the list refreshes without that trip (R7).
5. **Trip belonging to someone else.** Another user's trip never appears in the list. If its URL is opened, the user sees Not found (R8, F1.R9).

## Requirements
- **F2.R1** A logged-in user can create a trip by entering a name. The name is trimmed of surrounding spaces before any check; a name of only spaces counts as empty. After trimming, the name is required and at most 50 characters. Two trips owned by the same user may have the same name. (Decided 2026-11-04.)
- **F2.R2** The owner of a new trip is the logged-in user. The owner is set by the server from the session and is never taken from the request.
- **F2.R3** After a trip is created, the user lands on Trips, and the new trip appears at the top of the list.
- **F2.R4** The trip list shows only trips owned by the logged-in user, newest first by creation time, and each row shows only the trip name. (Decided 2026-11-04.)
- **F2.R5** When the user has no trips, the list shows an explanatory message and a Create trip button. (Decided 2026-11-04.)
- **F2.R6** Deleting a trip requires confirmation in a dialog with Cancel and Delete. The trip is deleted only when the user chooses Delete. (Decided 2026-11-04.)
- **F2.R7** Deleting a trip removes the trip and everything in it (product.md R8). The delete runs in one database transaction, so a partial delete never happens (project rules). Each later feature (F3–F6) must add its own records to this delete.
- **F2.R8** Trips cannot be edited. Only create, list and delete exist (product.md §2 Assumptions).
- **F2.R9** Create, list and delete all require a logged-in user, and every delete or read of a single trip checks ownership, per F1.R10. A request for another user's trip returns Not found, per F1.R9.
- **F2.R10** Each trip records its creation time in UTC (project rules). The list orders by this time.

## Data & contract
**Trips (new table):**
- `id` — unique identifier
- `owner_id` — the user who owns the trip; required; references users (F1)
- `name` — required; 1 to 50 characters (R1)
- `created_at` — UTC (R10)

**Indexes:** trips are read by `owner_id` and ordered by `created_at`. The plan decides the index.

**Endpoints (paths chosen in the plan):**
- Create trip: request `{ name }`. Success: the new trip, with `id`, `name`, `created_at`.
- List my trips: no body. Success: array of trips for the session user, newest first, each with `id`, `name`, `created_at`.
- Delete trip: path takes the trip `id`. Success: no body. Not found: same response as a missing trip (F1.R9).

**Error shapes:**
- Validation error on create: HTTP 400, body `{ "error": "<message>" }`, no trip created (F2.AC15).
- Logged-out request to any trip endpoint: HTTP 401, body `{ "error": "Log in required" }`, no data (F1.R10, F1.AC17).

**Cascade:** the trip delete removes trip rows only, until F3–F6 add their tables. Each of those specs must list its records in the delete (R7).

**Browser storage:** none.

## States & errors
Copy below is confirmed as written (2026-11-04).

| Situation | Where | Proposed copy | Rule |
|---|---|---|---|
| No trips yet | Trips | "You don't have any trips yet." + Create trip button | R5 |
| Name empty | Create trip | "Enter a trip name." | R1 |
| Name over 50 characters | Create trip | "Trip names can be up to 50 characters." | R1 |
| Trip created | Trips | None; new trip at top of list | R3 |
| Delete dialog | Trips | Title: "Delete this trip?" Body: "This removes the trip and everything in it. This can't be undone." Buttons: Cancel, Delete | R6, R7 |
| Trip deleted | Trips | None; row removed | R7 |
| Trip not found (missing or not owned) | Trip URL | "Trip not found." | F1.R9 |
| Server error on create, list or delete | Trips | "Something went wrong. Try again." | Project rules: do not swallow errors |

Loading: the list shows a loading state while it fetches. The Create and Delete buttons are disabled while their request is in progress.

## Accessibility
- The Create trip form's name field has a visible label. Its error is linked to the field and announced to screen readers.
- The delete dialog traps focus while open, moves focus to Cancel by default, and returns focus to the Delete button on the row when it closes. Escape closes it without deleting.
- Each row's Delete control has an accessible name that includes the trip name (for example, "Delete Lisbon trip"), so screen-reader users can tell rows apart.
- Keyboard: Tab order follows the visual order. Enter submits the create form.
- Contrast for text and error messages meets WCAG AA.
- Reduced motion: the dialog may animate. Animation is removed when the user prefers reduced motion.

## Edge cases
- Name of only spaces → treated as empty, refused with "Enter a trip name." (R1, F2.AC14).
- Name of exactly 50 characters after trimming → accepted (R1).
- Name of 51 characters → rejected (R1).
- Two trips with the same name → both shown, newest first (R1, R4).
- Trip created in one tab while the list is open in another → list shows it after refresh; no live update (decided 2026-11-04).
- Delete clicked twice quickly → only one delete runs; the second gets Not found if the trip is already gone (R7, F1.R9).
- Delete of a trip that someone else owns, via a forged request → Not found, nothing deleted (R9).
- Delete fails partway → the transaction rolls back, and the trip still exists (R7).
- Session ends while the create form is open → the request is rejected and the user is sent to Log in (F1.R8).

## Acceptance criteria
- **F2.AC1** Given a logged-in user on Create trip, when they submit the name "Lisbon", then a trip named "Lisbon" is created and they land on Trips with it at the top. (R1, R3)
- **F2.AC2** Given a logged-in user, when they submit an empty name, a name of only spaces, or a name of 51 characters, then no trip is created and the matching error is shown. (R1)
- **F2.AC3** Given a user who already has a trip named "Italy", when they create another "Italy", then both trips exist. (R1)
- **F2.AC4** Given a logged-in user, when they create a trip with a request that tries to set a different owner, then the trip is owned by the logged-in user. (R2)
- **F2.AC5** Given users A and B each with trips, when A opens Trips, then only A's trips are listed. (R4; product.md F2 "Done when")
- **F2.AC6** Given a user with three trips created at different times, when they open Trips, then the newest trip is listed first and each row shows only its name. (R4, R10)
- **F2.AC7** Given a user with no trips, when they open Trips, then the empty-state message and Create trip button are shown. (R5)
- **F2.AC8** Given a trip row, when the user chooses Delete and then Cancel, then the trip still exists. (R6)
- **F2.AC9** Given a trip row, when the user chooses Delete and then Delete in the dialog, then the trip is removed from the list and from the database. (R6, R7)
- **F2.AC10** Given a trip being deleted, when the delete fails partway, then the trip is still there after the failure. (R7)
- **F2.AC11** Given a logged-in user, when they request a trip owned by another user, then they get Not found and nothing changes. (R9; F1.R9)
- **F2.AC12** Given a logged-out visitor, when they call create, list or delete for a trip, then the request is rejected with HTTP 401 and a JSON error, and no trip data is returned. (R9; F1.R10, F1.AC17)
- **F2.AC13** Given a trip, when the user looks for a way to change its name, then no edit control exists. (R8)
- **F2.AC14** Given a name with surrounding spaces, when it is submitted, then the saved name has no surrounding spaces; and a name of only spaces is refused with "Enter a trip name." (R1)
- **F2.AC15** Given a create request that fails validation, when the API responds, then the status is 400 with a JSON body `{ "error": "<message>" }` and no trip is created. (R1)

## Dependencies
- **F1** (Registration and login) must be built first. F2 uses the session and ownership rules from F1. F1 is currently Draft after its 2026-11-04 revision, so F1 needs re-approval before F2 is planned.
- **Build order:** step 2. F3 (People) and later features depend on F2.
- **External services:** none.
- **Cascade contract for later features:** F3, F4 and F6 add their tables to the trip delete (R7).

## Test plan
Unit tests only (project rules). Each test names its AC ID. Ownership and transactions cannot be proven by unit tests, so they go to code review.

- **F2.AC2** Unit test: name validator rejects empty, spaces-only and 51-character names, accepts 50. (R1)
- **F2.AC14** Unit test: name normalizer trims surrounding spaces and returns empty for a spaces-only name. (R1)
- **F2.AC15** Unit test: a validation error maps to HTTP 400 with a JSON `error` body, and the store is not called. (R1)
- **F2.AC1** Unit test: create service, with a fake store, saves the trimmed name and returns the trip. (R1, R3)
- **F2.AC3** Unit test: create service accepts a duplicate name for the same owner in the fake store. (R1)
- **F2.AC4** Unit test: create service sets the owner from the session user and ignores any owner in the request. (R2)
- **F2.AC6** Unit test: list ordering puts the newest trip first in the fake store. Row view shows only the name. (R4, R10)
- **F2.AC7** Unit test: empty list view renders the message and button when the list is empty. (R5)
- **F2.AC8** Unit test: Cancel in the delete dialog does not call the delete service. (R6)
- **F2.AC9** Unit test: Delete in the dialog calls the delete service once for the chosen trip. (R6)
- **F2.AC12** Unit test: create, list and delete services reject a request with no session before touching the store, with HTTP 401 and a JSON error. (R9; F1.AC17)
- **F2.AC13** Unit test: trip row view has no edit control. (R8)
- **F2.AC5** Code review: the list query filters by the session user's ID in the database query. (R4, R9)
- **F2.AC11** Code review: the single-trip lookup for delete includes the owner check and returns the same response as a missing trip. (R9)
- **F2.AC10** Code review: the delete runs in one transaction and rolls back on error. (R7)

## Open questions
None. All six questions were answered on 2026-11-04 (see Decisions log).

## Decisions log
- 2026-11-04: Can two trips owned by the same user have the same name? → Yes, duplicates allowed.
- 2026-11-04: Maximum length of a trip name? → 50 characters.
- 2026-11-04: Where the user lands after creating a trip? → Back on the trip list.
- 2026-11-04: Trip list order and row content? → Newest first, name only.
- 2026-11-04: Delete-trip confirmation? → Dialog with Cancel and Delete.
- 2026-11-04: Empty trip list? → Short message with a Create trip button.
- 2026-11-04: Spec approved by the user.
- 2026-11-04: Wording of the proposed messages, including the delete dialog → Accepted as written.
- 2026-11-04: Trim names, and is spaces-only empty? → Yes, trimmed; spaces-only is empty (F2.R1, F2.AC14).
- 2026-11-04: Create trip as a separate page or a form on Trips? → Separate Create trip page.
- 2026-11-04: Where the Delete control sits? → On each row of the list.
- 2026-11-04: Does the list update when a trip is added in another tab? → Refresh only.
- 2026-11-04: Error response for validation errors → HTTP 400 with JSON `{ "error" }` (F2.AC15). Logged-out responses follow F1 (401, F1.AC17).
- 2026-11-04: Answers changed the spec's substance (trimming, Create trip page, error shape), so the spec returns to Draft and needs re-approval.
- 2026-11-04: Spec re-approved by the user.
