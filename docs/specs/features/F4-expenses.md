# F4 — Expenses

_Status: Approved · Last updated: 2026-11-05 · Source: product.md §3, §2, §4 (R1, R2, R3, R8), §5 Goals, §6 Worked examples_

## Summary
A user records an expense by entering four things: what it was, how much, who paid, and who shares it. The amount is split equally, to the cent, between the people who share it. This is the core data entry of the app. Every balance (F5) and settlement (F6) is built from these records.

## User stories
- As a user, I want to add an expense with a description, amount, payer and sharers, so that the trip's spending is recorded.
- As a user, I want everyone on the trip to share an expense by default, so that most expenses take one step.
- As a user, I want to see the list of expenses, so that I can check what was recorded.
- As a user, I want to delete an expense I entered by mistake, so that the balances are correct again.

## Scope
**In:**
- Add an expense: description (optional), amount, payer, participants (everyone by default) (product.md §3 F4, Goals)
- Equal split to the cent, rounded as R3 requires (product.md R3, Example 2)
- List expenses, newest first (decided 2026-11-04)
- Delete an expense, with confirmation (decided 2026-11-04)
- Ownership: a user sees and changes only expenses on their own trips (product.md §2 Ownership rule)

**Out:**
- Editing an expense (product.md §2 Assumptions: no editing; a mistake is fixed by deleting and adding again)
- Uneven splits, custom shares, currency and conversion (product.md §2 Assumptions; "After the core")
- An expense date, category or receipt (not in product.md §3 F4, which lists four inputs)
- Balances and suggested payments, which are F5 and F6

## User flow & screens
Screens: **Trip page** (the page created in F3) with an **Expenses** section, an **Add expense** form, and a **Delete expense** confirmation dialog. No mock screens exist in `docs/design`.

1. **Add an expense.** User chooses Add expense and fills in:
   - Description (optional)
   - Amount, greater than zero
   - Payer, chosen from the trip's people (no default; the user must pick one)
   - Participants, from the trip's people, with everyone selected by default
2. **Submit.** The expense is saved, and the expenses list shows it at the top (R3 split is computed and stored with the expense).
3. **View expenses.** The list shows each expense's description, amount and payer, newest first. Under each row, a "Shared by" line names the people who share it.
4. **Delete an expense.** User chooses Delete on an expense. A dialog asks them to confirm with Cancel and Delete. Delete removes the expense and the list refreshes.

Adding is blocked when the trip has no people, because an expense needs a payer and at least one participant (R2).

## Requirements
- **F4.R1** An expense amount is greater than zero (product.md R1). Amounts are stored in whole cents (project rules, product.md §2).
- **F4.R2** An amount must be entered in whole cents: at most two decimal places. An amount with more than two decimal places is rejected, not rounded. The amount is plain decimal only: digits and one decimal point. A currency symbol or thousands separator (for example "$1,200.00") is refused with the cents message. (Decided 2026-11-04.)
- **F4.R3** An expense has exactly one payer and at least one participant, all of them people on the same trip. The payer does not have to be a participant (product.md R2).
- **F4.R4** The payer has no default. The user must choose one before the expense can be saved. (Decided 2026-11-04.)
- **F4.R5** Participants default to everyone on the trip. The user can untick people, but must leave at least one ticked (product.md R2, §3 F4 "everyone by default").
- **F4.R6** The expense description is optional and at most 100 characters. It is trimmed of surrounding spaces. A description of only spaces is saved as no description, with no error. (Decided 2026-11-04.)
- **F4.R7** Each expense is split equally between its participants, rounded down to the cent. Leftover cents go one each to participants in the order they were added to the trip (product.md R3). The share for each participant is stored with the expense so that later changes to the trip can't change it. The worked example in product.md §6 (10.00 across Sam, Alex, Jo gives 3.34, 3.33, 3.33) is the test reference.
- **F4.R8** The sum of an expense's shares always equals its amount.
- **F4.R9** The expense list shows only expenses on the user's own trip, newest first. Each row shows the description, amount and payer, and a "Shared by" line naming the people who share the expense. (Decided 2026-11-04.)
- **F4.R10** Deleting an expense requires confirmation in a dialog with Cancel and Delete. The expense is deleted only when the user chooses Delete. (Decided 2026-11-04.)
- **F4.R11** Expenses cannot be edited (product.md §2 Assumptions).
- **F4.R12** A new expense is saved together with its payer, participants and shares in one database transaction (project rules).
- **F4.R13** An amount above 21,474,836.47 is refused, not saved, with the message "Amounts can be up to 21,474,836.47." Cents are stored as a 32-bit whole number, which sets this limit. (Decided 2026-11-05; replaces the 2026-11-04 "no cap" wording.)
- **F4.R14** Every request to add, list or delete expenses requires a session and an ownership check on the trip (F1.R10, F2.R9). A request for another user's trip returns Not found (F1.R9).

## Data & contract
**Expenses (new table):**
- `id` — unique identifier
- `trip_id` — references trips; required
- `description` — optional text, at most 100 characters (R6)
- `amount_cents` — whole number greater than zero and at most 2,147,483,647 (R1, R13)
- `payer_id` — references people on the same trip; required (R3)
- `created_at` — UTC

**Expense participants (new table, one row per sharer):**
- `expense_id`, `person_id` — both required; references people
- `share_cents` — the share stored at save time (R7)

**Constraints:**
- `amount_cents > 0` (R1). Database check.
- `payer_id` and every `person_id` belong to the same trip as the expense (R3). Enforced by the save transaction and checked in code review.
- Shares sum to `amount_cents` (R8). Enforced by the save transaction and checked in code review.
- Removal of a person is blocked while an expense participant or payer row refers to them (F3.R4).

**Endpoints (paths chosen in the plan):**
- Add expense: request `{ description?, amount, payer_id, participant_ids[] }` for a trip id, where `amount` is a string of decimal dollars. Success: the saved expense with its shares. Validation failure: HTTP 400 with `{ "error": "<message>" }`, the same shape as F2.AC15, and nothing saved. A payer or sharer who is not on the trip: HTTP 400 with `{ "error": "Choose people from this trip." }`, nothing saved (F4.R3).
- List expenses: for a trip id. Success: array, newest first.
- Delete expense: expense id. Success: no body. Not found (missing, or on another user's trip): HTTP 404 with `{ "error": "Expense not found." }`, the same response for both (F1.R9).

**Amount input:** the user types decimal dollars (for example 12.34). The server converts to cents once, before any calculation. Floating-point values are never stored or used in a split (project rules).

**Cascade:** deleting a trip (F2) removes its expenses and their participant rows in the same transaction.

**Browser storage:** none.

## States & errors
Copy below is confirmed as written (2026-11-04). The four messages added on 2026-11-05 (amount too large, payer or sharer not on the trip, expense not found, and the empty state) are also confirmed as written.

| Situation | Where | Proposed copy | Rule |
|---|---|---|---|
| No people on trip | Add expense | "Add people to the trip before you add an expense." | R3 |
| No expenses yet | Trip page | "No expenses yet. Add the first one." + Add expense button | R9 |
| Amount empty | Add expense | "Enter an amount." | R1 |
| Amount zero or negative | Add expense | "The amount must be more than zero." | R1 |
| More than two decimal places | Add expense | "Enter an amount in whole cents, like 12.34." | R2 |
| No payer chosen | Add expense | "Choose who paid." | R4 |
| No participant ticked | Add expense | "Choose at least one person to share this expense." | R5 |
| Description over 100 characters | Add expense | "Descriptions can be up to 100 characters." | R6 |
| Amount above 21,474,836.47 | Add expense | "Amounts can be up to 21,474,836.47." | R13 |
| Payer or sharer not on this trip (forged request only) | Add expense | "Choose people from this trip." | R3 |
| Expense added | Trip page | None; expense at the top of the list | R9 |
| Delete dialog | Trip page | Title: "Delete this expense?" Body: "The balances on this trip will change." Buttons: Cancel, Delete | R10 |
| Expense deleted | Trip page | None; row removed | R10 |
| Not found (missing or not owned) | Trip page | "Trip not found." | F1.R9 |
| Expense not found (missing or not owned) | Trip page | "Expense not found." | F1.R9 |
| Server error | Trip page | "Something went wrong. Try again." | Project rules |

Loading: the expenses list shows a loading state while it fetches. Save and Delete are disabled while their request is in progress, so a double click can't save two expenses.

## Accessibility
- Every field has a visible label. Amount and description are labelled, not placeholder-only.
- The payer field is a choice list with an empty first option and a label, so screen readers announce it.
- Participants are checkboxes grouped under a "Shared by" legend, each with the person's name as its label.
- Validation errors are linked to their fields and announced to screen readers. Focus moves to the first error after a failed submit.
- The delete dialog traps focus, moves focus to Cancel by default, returns focus to the row's Delete control, and closes on Escape without deleting.
- Each row's Delete control has an accessible name that includes the description, or the amount if there is no description (for example, "Delete Dinner, 90.00").
- Keyboard: Tab order follows the visual order. Enter submits the form.
- Contrast for text and error messages meets WCAG AA.
- Reduced motion: any dialog animation is removed when the user prefers reduced motion.

## Edge cases
- Amount of 0.01 → accepted; the smallest positive amount (R1, R2).
- Amount of 12.345 → rejected (R2).
- Amount of "$1,200.00" or "1,200.00" → refused with the cents message; no symbol or separator is stripped (R2, F4.AC17).
- Description of only spaces → saved as no description, no error (R6, F4.AC16).
- Amount of 10.00 shared by three people → shares 3.34, 3.33, 3.33; the first person in trip order gets the extra cent (R7, product.md §6 Example 2).
- Amount of 0.02 shared by three people → shares 0.01, 0.01, 0.00. Rounded-down shares sum to 0.02 with the leftover cent going to the first two in trip order (R7, R8).
- Payer not in the participant list → allowed (R3).
- Amount of 21,474,836.47 → accepted, the largest amount (R13). Amount of 21,474,836.48 → refused with the cap message (R13, F4.AC19).
- Payer or sharer from another trip (forged request) → refused with "Choose people from this trip." (R3).
- Only one person ticked as participant → allowed; the share is the whole amount (R3, R5).
- Trip with no people → adding is blocked (R3).
- Person removed after being in an expense → blocked by F3.R4, so the expense never loses a person.
- Two saves of the same expense at once (double click) → one expense is created; the second is blocked by the disabled button, and any second request is a separate saved expense only if the user submits again.
- Trip deleted while an expense is being saved → the save fails with Not found and nothing is saved (F1.R9, R12).
- Delete of an expense that's already gone → Not found, nothing else changes.
- Delete of an expense changes balances (F5). The dialog says so.

## Acceptance criteria
- **F4.AC1** Given a trip with Sam, Alex and Jo, when the user adds 90.00 paid by Sam, with all three sharing, then the expense is saved with shares of 30.00 each. (R3, R5, R7)
- **F4.AC2** Given a trip with Sam, Alex and Jo, when the user adds 10.00 shared by all three, then the shares are 3.34, 3.33 and 3.33 in trip order. (R7; product.md §6 Example 2)
- **F4.AC3** Given an amount of zero or a negative amount, when the user submits, then the expense is not saved and the matching error is shown. (R1)
- **F4.AC4** Given an amount of 12.345, when the user submits, then the expense is not saved and the cents error is shown. (R2)
- **F4.AC5** Given no payer chosen, when the user submits, then the expense is not saved. (R4)
- **F4.AC6** Given no participant ticked, when the user submits, then the expense is not saved. (R5)
- **F4.AC7** Given a payer who is not a participant, when the user submits, then the expense is saved and the payer is not in its shares. (R3)
- **F4.AC8** Given a description of 101 characters, when the user submits, then the expense is not saved. (R6)
- **F4.AC9** Given a trip with no people, when the user opens Add expense, then saving is blocked and the message is shown. (R3)
- **F4.AC10** Given any saved expense, when its shares are added up, then they equal the amount exactly. (R8)
- **F4.AC11** Given two expenses, when the list is read, then the newest expense is first and each row shows description, amount, payer and a "Shared by" line. (R9)
- **F4.AC12** Given an expense, when the user chooses Delete and then Cancel, then the expense still exists. (R10)
- **F4.AC13** Given an expense, when the user chooses Delete and then Delete in the dialog, then the expense is removed. (R10)
- **F4.AC14** Given an expense, when the user looks for a way to change it, then no edit control exists. (R11)
- **F4.AC15** Given user B's trip, when user A adds an expense to it, then the request returns Not found and nothing is saved. (R14; F1.R9)
- **F4.AC16** Given a description of only spaces, when the expense is saved, then it is saved with no description and no error is shown. (R6)
- **F4.AC17** Given an amount of "$1,200.00" or "1,200.00", when the user submits, then the expense is not saved and the cents error is shown. (R2)
- **F4.AC18** Given a trip with no expenses, when the trip page is viewed, then "No expenses yet. Add the first one." and an Add expense button are shown. (R9)
- **F4.AC19** Given an amount above 21,474,836.47, when the user submits, then the expense is not saved and "Amounts can be up to 21,474,836.47." is shown. (R13)

## Dependencies
- **F1**, **F2** and **F3** must be built first. F3 supplies the people who pay and share.
- **Build order:** step 4.
- **Used by:** F5 (balances) and F6 (settle up) read expenses and shares.
- **External services:** none.

## Test plan
Unit tests only (project rules). Each test names its AC ID. Transactions, the same-trip checks and ownership go to code review.

- **F4.AC3** Unit test: amount validator rejects zero and negative values. (R1)
- **F4.AC4** Unit test: amount parser rejects 12.345 and accepts 12.34 and 0.01, converting to cents without floats. (R2)
- **F4.AC17** Unit test: amount parser refuses "$1,200.00" and "1,200.00". (R2)
- **F4.AC8** Unit test: description validator accepts 100 characters and rejects 101. (R6)
- **F4.AC16** Unit test: description normalizer trims surrounding spaces and returns no description for a spaces-only value. (R6)
- **F4.AC5** Unit test: save service refuses an expense with no payer. (R4)
- **F4.AC6** Unit test: save service refuses an expense with no participants. (R5)
- **F4.AC7** Unit test: save service accepts a payer who is not in the participant list. (R3)
- **F4.AC9** Unit test: add-expense view blocks saving when the people list is empty. (R3)
- **F4.AC1** Unit test: split function gives 30.00 each for 90.00 across three people. (R7)
- **F4.AC2** Unit test: split function gives 3.34, 3.33, 3.33 for 10.00 across three people in trip order. (R7)
- **F4.AC10** Unit test: split function returns shares whose sum equals the amount for a range of amounts and participant counts. (R8)
- **F4.AC11** Unit test: list ordering puts the newest expense first, and the row view shows description, amount, payer and the "Shared by" line. (R9)
- **F4.AC12** Unit test: Cancel in the delete dialog does not call the delete service. (R10)
- **F4.AC13** Unit test: Delete in the dialog calls the delete service once for the chosen expense. (R10)
- **F4.AC14** Unit test: expense row view has no edit control. (R11)
- **F4.AC15** Code review: the save and list queries include the trip owner check, and the save refuses a payer or participant from another trip. (R14)
- **F4.AC18** Unit test: the expenses list view shows "No expenses yet. Add the first one." and the Add expense button when the list is empty. (R9)
- **F4.AC19** Unit test: amount parser refuses 21,474,836.48 and accepts 21,474,836.47. (R13)
- **F4.R12** Code review: the stored shares for an expense are written in the same transaction as the expense. (R12)

## Open questions
None. The four questions from 2026-11-04 and the three from 2026-11-05 are answered (see Decisions log).

## Decisions log
- 2026-11-04: Maximum amount? → No cap beyond storage limits.
- 2026-11-04: Description required or optional, and its limit? → Optional, 100 characters.
- 2026-11-04: Expense list order? → Newest first.
- 2026-11-04: Confirmation before deleting an expense? → Yes, with Cancel and Delete.
- 2026-11-04: Amount with more than two decimal places? → Rejected, not rounded.
- 2026-11-04: Default payer? → None; the user must pick.
- 2026-11-04: Row content in the expense list? → Description, amount, payer.
- 2026-11-04: Spec approved by the user.
- 2026-11-04: Wording of the proposed messages, including the delete dialog text → Accepted as written.
- 2026-11-04: Where can the user see who shares an expense? → A "Shared by" line under each row (F4.R9, F4.AC11).
- 2026-11-04: Trim the description, and is spaces-only empty? → Trimmed; spaces-only saves as no description, no error (F4.R6, F4.AC16).
- 2026-11-04: Accept a currency symbol or thousands separators in the amount? → No; plain decimal only (F4.R2, F4.AC17).
- 2026-11-04: Response for a validation failure → HTTP 400 with JSON `{ "error" }`, the same shape as F2.AC15.
- 2026-11-04: Answers changed the spec's substance (sharers line, description and amount rules), so the spec returns to Draft and needs re-approval.
- 2026-11-04: Spec re-approved by the user.
- 2026-11-05: Too large to store? → Refused above 21,474,836.47 with "Amounts can be up to 21,474,836.47." (F4.R13, F4.AC19). This replaces "no cap beyond storage"; the limit comes from the 32-bit cents column.
- 2026-11-05: Copy when a missing or not-owned expense is deleted? → "Expense not found." (404; F1.R9). The trip-level "Trip not found." stays for trip-level misses.
- 2026-11-05: Copy when a payer or sharer is not on the trip (forged request only)? → "Choose people from this trip." (400; F4.R3).
- 2026-11-05: The empty state for the expenses list had no acceptance criterion. Added F4.AC18 (R9). Its copy was already in the States table.
- 2026-11-05: The test-plan row for the same-transaction check was labelled F4.AC1, which is the split test. Relabelled as F4.R12, since it checks R12, not an AC.
- 2026-11-05: Answers changed the spec's substance (the cap, two new messages, and two new acceptance criteria), so the spec returned to Draft. Its plan (`docs/plans/F4-expenses.md`) needs updating.
- 2026-11-05: Spec approved by the user.
