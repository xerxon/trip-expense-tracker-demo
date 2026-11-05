# F3 — People

_Status: Approved · Last updated: 2026-11-04 · Source: product.md §3, §2, §4 (R3, R7)_

## Summary
A user adds the people on a trip by name and removes them when they are no longer needed. People are names only and do not have accounts. Each person is in the trip's order of addition, which decides who gets leftover cents when an expense is split (R3). A person who appears in any expense or payment can't be removed, so the balances never break.

## User stories
- As a user, I want to add the people on a trip by name, so that they can share expenses.
- As a user, I want to remove a person I added by mistake, so that the trip list is right.
- As a user, I want to be told when a person can't be removed, so that I know why nothing happened.

## Scope
**In:**
- Add a person to a trip by name (product.md §3 F3)
- Remove a person from a trip, with confirmation (product.md §3 F3; decided 2026-11-04)
- Block removal of anyone in an expense or payment (product.md §3 F3 "Done when", R7)
- Keep people in the order they were added (product.md R3, for the leftover-cents rule)
- Names are unique within a trip, ignoring capitals (Key terms "Person"; decided 2026-11-04)

**Out:**
- Editing a person's name (product.md §2 Assumptions: no editing)
- Accounts, emails or any other detail about a person (product.md §2: people are names only)
- Expense and payment entry, which are F4 and F6
- A minimum or maximum number of people per trip (decided 2026-11-04: no minimum; no maximum stated)

## User flow & screens
Screens: **Trip page** (new in this feature; opened from the Trips list in F2), with a **People** section, an **Add person** form, and a **Remove person** confirmation dialog. No mock screens exist in `docs/design`.

1. **Open a trip.** User opens a trip from the Trips list (F2). The trip page shows the People section, in the order they were added. An empty trip shows an empty-state message.
2. **Add a person.** User enters a name and submits. The person appears at the bottom of the list (R3 order). A name already used in this trip (ignoring capitals) is refused.
3. **Remove a person.** User chooses Remove on a person. If the person is in no expense or payment, a dialog asks them to confirm with Cancel and Remove. Remove deletes the person and the list refreshes.
4. **Blocked removal.** If the person is in any expense or payment, the user is told why and the person stays on the list (R7).

## Requirements
- **F3.R1** A user can add a person to a trip by entering a name. The name is trimmed of surrounding spaces before any check; a name of only spaces counts as empty. After trimming, the name is required and at most 50 characters. (Decided 2026-11-04; trimming follows F2.R1.)
- **F3.R2** A person's name is unique within the trip, ignoring capitals: "Sam" and "sam" are the same person. Adding a duplicate is refused with HTTP 409 and a JSON error `{ "error": "Someone with this name is already on the trip." }`. The name is stored and shown as typed, so "Sam" stays "Sam". (Key terms "Person"; decided 2026-11-04.)
- **F3.R3** People are kept in the order they were added to the trip, and the order is stored. This order is the one R3 uses for leftover cents. (product.md R3.)
- **F3.R4** A person can be removed from a trip only when they are not in any expense or payment (product.md R7). The check happens in the database, in the same transaction as the removal, so two requests can't race past it.
- **F3.R5** Removing a person requires confirmation in a dialog with Cancel and Remove. The person is removed only when the user chooses Remove. (Decided 2026-11-04.)
- **F3.R6** A person can't be renamed. Only add and remove exist (product.md §2 Assumptions).
- **F3.R7** A person can only be added to or removed from a trip the user owns. Ownership is checked on every request, per F1.R10. A request for a trip the user doesn't own returns Not found, per F1.R9.
- **F3.R8** People have no accounts, emails or other fields. Only a name and their place in the trip's order are stored (product.md §2 Roles).
- **F3.R9** Adding or removing a person writes only the trip's people, so no expense or payment is changed by it.

## Data & contract
**People (new table):**
- `id` — unique identifier
- `trip_id` — references trips (F2); required
- `name` — required; 1 to 50 characters (R1)
- `name_key` — the name in lower case, used for the uniqueness check (R2)
- `position` — the order of addition within the trip (R3)

**Constraints:**
- Unique on (`trip_id`, `name_key`) (R2). Verified in code review, not by unit test.
- Removal is refused while any expense participant row or payment row refers to the person (R4). Foreign keys from F4 and F6 enforce this. Verified in code review.

**Endpoints (paths chosen in the plan):**
- Add person: request `{ name }` for a trip id. Success: the new person, with `id`, `name`, `position`. Validation error: HTTP 400 with `{ "error": "<message>" }`, the same shape as F2.AC15. Duplicate: HTTP 409 with `{ "error": "Someone with this name is already on the trip." }` (R2).
- List people: for a trip id. Success: array of people in `position` order.
- Remove person: person id. Success: no body. Blocked: HTTP 409 with the blocked message (R4). Not found: same response as a missing person (F1.R9).

**Cascade:** removing a trip (F2) also removes its people. Add this to the F2 cascade list in the plan.

**Browser storage:** none.

## States & errors
Copy below is confirmed as written (2026-11-04). The Remove control stays visible on a blocked person; choosing it shows the blocked message (R4).

| Situation | Where | Proposed copy | Rule |
|---|---|---|---|
| No people yet | Trip page | "No one is on this trip yet. Add the people who share its expenses." | R1 |
| Name empty | Add person | "Enter a name." | R1 |
| Name over 50 characters | Add person | "Names can be up to 50 characters." | R1 |
| Name already on trip | Add person | "Someone with this name is already on the trip." | R2 |
| Person added | Trip page | None; person at the bottom of the list | R3 |
| Remove dialog | Trip page | Title: "Remove [name] from the trip?" Buttons: Cancel, Remove | R5 |
| Removal blocked | Trip page (shown when Remove is chosen) | "[name] is in an expense or payment, so they can't be removed." | R4 |
| Person removed | Trip page | None; row removed | R5 |
| Not found (missing or not owned) | Trip page | "Trip not found." | F1.R9 |
| Server error | Trip page | "Something went wrong. Try again." | Project rules: do not swallow errors |

Loading: the People list shows a loading state while it fetches. Add and Remove are disabled while their request is in progress.

## Accessibility
- The name field has a visible label. Its error is linked to the field and announced to screen readers.
- The remove dialog traps focus, moves focus to Cancel by default, returns focus to the row's Remove control on close, and closes on Escape without removing.
- Each row's Remove control has an accessible name that includes the person's name (for example, "Remove Sam").
- A blocked removal is announced to screen readers, not only shown visually.
- Keyboard: Tab order follows the visual order. Enter submits the add form.
- Contrast for text and error messages meets WCAG AA.
- Reduced motion: any dialog animation is removed when the user prefers reduced motion.

## Edge cases
- Name of only spaces → treated as empty, refused with "Enter a name." (R1, F3.AC14).
- Name "sam" when "Sam" exists → refused (R2).
- Two adds of the same name at the same moment → one succeeds; the other is refused by the unique constraint (R2).
- Remove a person who was added in an expense that was then deleted → allowed, since they are no longer in any expense (R4).
- Remove a person who is in a payment (F6) → blocked (R4).
- Remove clicked twice quickly → the second request gets Not found (F1.R9) or succeeds as a no-op; only one removal takes effect.
- Re-adding a removed person → they go to the end of the order, which changes leftover-cent allocation for future expenses (R3). This is expected.

## Acceptance criteria
- **F3.AC1** Given a trip owned by the user, when they add the name "Sam", then Sam appears at the bottom of the people list. (R1, R3)
- **F3.AC2** Given a trip with "Sam", when the user adds "sam", then the add is refused with HTTP 409 and the duplicate message, and no second person is created. (R2)
- **F3.AC3** Given a trip, when the user adds a name of 51 characters or an empty name, then no person is created and the matching error is shown. (R1)
- **F3.AC4** Given a trip with three people added in order Sam, Alex, Jo, when the list is read, then the order is Sam, Alex, Jo. (R3)
- **F3.AC5** Given a person in an expense, when the user chooses Remove, then the removal is refused, the blocked message is shown, and the person stays on the trip. (R4)
- **F3.AC6** Given a person in a payment, when the user tries to remove them, then the removal is refused. (R4)
- **F3.AC7** Given a person not in any expense or payment, when the user chooses Remove and then Cancel, then the person still exists. (R5)
- **F3.AC8** Given a person not in any expense or payment, when the user chooses Remove and then Remove in the dialog, then the person is removed. (R5)
- **F3.AC9** Given a person in an expense, when the user renames them, then no rename control exists. (R6)
- **F3.AC10** Given users A and B with trips, when A tries to add or remove a person on B's trip, then the request returns Not found and nothing changes. (R7; F1.R9)
- **F3.AC11** Given a logged-out visitor, when they add or remove a person, then the request is rejected with HTTP 401 and a JSON error. (R7; F1.R10, F1.AC17)
- **F3.AC12** Given a person added to the trip, when the trip is viewed, then the person's record holds only a name and position. (R8)
- **F3.AC13** Given a person is added or removed, when the change is saved, then no expense or payment is changed. (R9)
- **F3.AC14** Given a name with surrounding spaces, when it is added, then the saved name has no surrounding spaces; and a name of only spaces is refused with "Enter a name." (R1)
- **F3.AC15** Given a person added as "Sam", when the trip is viewed, then the name is shown as "Sam". (R2)
- **F3.AC16** Given a trip with no people, when the trip page is viewed, then the message "No one is on this trip yet. Add the people who share its expenses." is shown. (R1)

## Dependencies
- **F1** (login and ownership) and **F2** (trips, trip page entry point) must be built first. F1 spec and plan are both Approved.
- **F4** (Expenses) and **F6** (Settle up) add the rows that R4 checks. Until they exist, removal is only blocked by the foreign keys they add, so F3 is not fully testable before F4 is built. Record this in the plan.
- **Build order:** step 3.
- **External services:** none.

## Test plan
Unit tests only (project rules). Each test names its AC ID. Uniqueness, ownership and the R4 check are database rules, so they go to code review.

- **F3.AC1** Unit test: add service, with a fake store, saves the trimmed name at the end of the position order. (R1, R3)
- **F3.AC3** Unit test: name validator rejects empty and 51-character names, accepts 50. (R1)
- **F3.AC2** Unit test: add service refuses a name that matches an existing name ignoring capitals, in the fake store, and maps the refusal to HTTP 409 with the duplicate message. (R2)
- **F3.AC14** Unit test: name normalizer trims surrounding spaces and returns empty for a spaces-only name. (R1)
- **F3.AC15** Unit test: person row view shows the name as stored, with its capitals. (R2)
- **F3.AC16** Unit test: the People section shows the empty-state message when the people list is empty. (R1)
- **F3.AC4** Unit test: people list returns people in position order. (R3)
- **F3.AC5** Unit test: remove service refuses when the fake store reports the person in an expense. (R4)
- **F3.AC6** Unit test: remove service refuses when the fake store reports the person in a payment. (R4)
- **F3.AC7** Unit test: Cancel in the remove dialog does not call the remove service. (R5)
- **F3.AC8** Unit test: Remove in the dialog calls the remove service once for the chosen person. (R5)
- **F3.AC9** Unit test: person row view has no rename control. (R6)
- **F3.AC11** Unit test: add and remove services reject a request with no session before touching the store. (R7)
- **F3.AC12** Unit test: person record has only name and position fields. (R8)
- **F3.AC13** Unit test: add and remove services do not call the expense or payment store. (R9)
- **F3.AC2** Code review: unique constraint on (trip, name ignoring capitals) exists in the database.
- **F3.AC5, F3.AC6** Code review: the removal check runs in the same transaction as the delete, against expense and payment rows.
- **F3.AC10** Code review: the people queries include the trip owner check. (R7)

## Open questions
None. The blocked-removal question was answered on 2026-11-04 (see Decisions log).

## Decisions log
- 2026-11-04: Person names unique within a trip, ignoring capitals? → Case-insensitive.
- 2026-11-04: Maximum length of a person's name? → 50 characters.
- 2026-11-04: Minimum number of people on a trip? → No minimum.
- 2026-11-04: Confirmation before removing a person? → Yes, with Cancel and Remove.
- 2026-11-04: Spec approved by the user.
- 2026-11-04: Wording of the proposed messages, including the blocked-removal message → Accepted as written.
- 2026-11-04: Trim person names, and is spaces-only empty? → Same as trip names (F3.R1, F3.AC14).
- 2026-11-04: When a person is blocked, how does the Remove control look? → Visible; choosing it shows why (F3.R4, F3.AC5).
- 2026-11-04: Show names with capitals as typed? → Yes; uniqueness still ignores capitals (F3.R2, F3.AC15).
- 2026-11-04: Response for a duplicate name → HTTP 409 with JSON `{ "error" }` (F3.R2, F3.AC2).
- 2026-11-04: Answers changed the spec's substance (trimming, duplicate response, Remove control), so the spec returns to Draft and needs re-approval.
- 2026-11-04: Response for a blocked removal → HTTP 409 with JSON `{ "error": "[name] is in an expense or payment, so they can't be removed." }` (F3.R4, F3.AC5).
- 2026-11-04: Spec re-approved by the user.
- 2026-11-05: Dependencies said F1 was Draft. F1 spec and plan are Approved, so the line was corrected. No requirement changed.
- 2026-11-05: The empty-state message ("No one is on this trip yet…", from the States table) had no acceptance criterion. Added F3.AC16 (R1) and its unit test. Approved by the user with the plan.
