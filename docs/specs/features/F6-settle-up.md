# F6 — Settle up

_Status: Approved · Last updated: 2026-11-05 · Source: product.md §3, §4 (R4, R6, R7, R8), §5 Goals, §6 Worked examples, §2 Key terms_

## Summary
The app proposes the fewest payments that bring every balance to zero. The user marks each suggested payment as paid once the money has moved outside the app, and can delete a payment that was marked by mistake. Once every suggested payment is marked paid, every balance on the trip is zero. This is the last step of the trip.

## User stories
- As a user, I want to see the fewest payments needed to settle up, so that I don't have to work them out.
- As a user, I want to mark a suggested payment as paid, so that the app shows what is still owed.
- As a user, I want to delete a payment I marked by mistake, so that the balances are right again.
- As a user, I want everyone to be square once all payments are marked paid, so that I know the trip is settled.

## Scope
**In:**
- Suggested payments, calculated by rule R6 (product.md R6; Key terms "Suggested payment")
- Mark a suggested payment as paid, for its full amount (product.md §3 F6; decided 2026-11-04)
- List payments already marked as paid (implied by "delete a payment", product.md §3 F6)
- Delete a payment, with confirmation, which brings its suggestion back (decided 2026-11-04)
- Suggestions recalculated when expenses or payments change (decided 2026-11-04)
- Minimum number of payments, with ties resolved by trip order (decided 2026-11-04; R6 changed to this method on 2026-11-04)

**Out:**
- Partial payments (decided 2026-11-04: full amount only)
- Payments made in the app and sent outside it, or any money transfer (product.md §2 Assumptions: money moves outside the app)
- Editing a payment (product.md §2 Assumptions: no editing)
- Email or notifications about payments (not in product.md)

## User flow & screens
Screens: **Trip page** (from F3–F5), with a **Settle up** section below **Balances**, containing **Suggested payments** and **Payments made**, plus a **Delete payment** confirmation dialog. No mock screens exist in `docs/design`.

1. **See suggestions.** The Settle up section lists the suggested payments, each as "[payer] pays [payee] [amount]" (for example, "Alex pays Sam 10.00"), in the order set by F6.R14. With Example 1 from product.md §6, that is two suggestions, in this order: Alex pays Sam 10.00, then Jo pays Sam 40.00.
2. **Mark a suggestion as paid.** User chooses "Mark as paid" on a suggestion. The suggestion moves to Payments made, and the balances update (F5).
3. **After all payments.** When no suggestions remain, Settle up shows that everyone is settled, and every balance shows Settled (F5.R3).
4. **Delete a payment.** User chooses Delete on a payment in Payments made. A dialog asks them to confirm with Cancel and Delete. The payment is removed; its suggestion comes back, recalculated from current balances.
5. **Expense changes.** If an expense is added or deleted, the remaining suggestions are recalculated from the new balances. Payments already marked paid stay.

## Requirements
- **F6.R1** Suggested payments are the fewest payments that bring every balance to zero, calculated from the current balances (product.md R6). Each payment goes from a person who owes to a person who is owed, and its amount is a whole number of cents.
- **F6.R2** If more than one set of payments has the fewest count, the set chosen is the first in this order: list each set's payments sorted by payer position, then payee position, both in trip order; compare the lists element by element, where each element is compared by payer position, then payee position, then amount; the smaller list wins. So for two payments with the same payer and payee, the smaller amount comes first. (Decided 2026-11-04; amount rule decided 2026-11-05.)
- **F6.R3** The number of suggested payments is the fewest possible. It equals the number of people with a non-zero balance, minus the largest number of groups into which those people can be split so that each group's balances add up to zero. Example 1 gives two suggestions (product.md §6). (Derived from product.md R6 and the §5 goal.)
- **F6.R4** A suggested payment can be marked as paid only for its full amount. Partial payments are not allowed. (Decided 2026-11-04.)
- **F6.R5** Marking a suggestion as paid creates a payment record with the payer, the payee and the amount, in one database transaction (project rules, product.md R4).
- **F6.R6** A payment is refused if the suggestion it was based on no longer exists in the current calculation, for example because the balances changed in another tab. The user is told to refresh. (Derived from R1 and R5: a payment must match a current suggestion.)
- **F6.R7** Deleting a payment requires confirmation in a dialog with Cancel and Delete. The payment is removed only when the user chooses Delete. (Decided 2026-11-04.)
- **F6.R8** When an expense is added or deleted, or a payment is marked or deleted, the suggestions are recalculated from the current balances. Payments already marked paid are kept. (Decided 2026-11-04.)
- **F6.R9** Balances include payments: a payment reduces what the payer owes and what the payee is owed (product.md R4). Because a payment moves the same amount from one person to another, the total of balances stays zero (product.md R5).
- **F6.R10** Once no suggestions remain, every balance on the trip is zero (product.md §3 F6 "Done when"). This follows from R1 and R9.
- **F6.R11** Payments and suggestions are shown only to the owner of the trip. Every request checks ownership (F1.R10, F2.R9).
- **F6.R12** A payment record stores its creation time in UTC (project rules).
- **F6.R13** Deleting a trip (F2) removes its payments in the same transaction (F2.R7).
- **F6.R14** The suggested payments are shown in the order F6.R2 sorts them: by payer position, then payee position, then amount, all in trip order. With Example 1 this puts Alex pays Sam 10.00 before Jo pays Sam 40.00. (Decided 2026-11-05.)

## Data & contract
**Payments (new table):**
- `id` — unique identifier
- `trip_id` — references trips; required
- `payer_id` — references people on the same trip; required
- `payee_id` — references people on the same trip; required; different from `payer_id`
- `amount_cents` — whole number greater than zero (matches the suggestion it was based on)
- `created_at` — UTC (R12)

**Constraints:**
- `payer_id` ≠ `payee_id`. Database check.
- `amount_cents > 0`. Database check.
- Payer and payee are on the same trip as the payment. Enforced in the transaction and checked in code review.
- Removal of a person is blocked while a payment refers to them (F3.R4).

**Calculation:** a pure function takes the balances from F5 and returns the suggestions in order. It touches no database, so it is unit tested with fake data (project rules). The algorithm is chosen in the plan. The exact minimum is required for every trip size (decided 2026-11-04), so the plan must measure the running time on large trips, since the work can grow very fast with the number of people. A payment request re-runs this function, and refuses if the suggestion does not match (R6).

**Endpoints (paths chosen in the plan):**
- Suggestions for a trip id: no body. Success: `{ has_expenses, suggestions }`, where `has_expenses` is true when the trip has at least one expense, and `suggestions` is an array of `{ payer_id, payer_name, payee_id, payee_name, amount_cents }`. The `has_expenses` flag decides which empty-state message shows (see States & errors).
- Mark as paid: request `{ payer_id, payee_id, amount_cents }` for a trip id. Success: the new payment. Mismatch: refused with the stale-suggestion message (R6).
- List payments for a trip id. Success: array, newest first.
- Delete payment: payment id. Success: no body. Not found: same response as a missing payment (F1.R9).

**Browser storage:** none.

## States & errors
Copy below is confirmed as written (2026-11-04).

| Situation | Where | Proposed copy | Rule |
|---|---|---|---|
| Suggestion shown | Settle up | "[payer] pays [payee] [amount]" + "Mark as paid" button | R1 |
| No suggestions | Settle up | "Everyone is settled." | R10 |
| No expenses yet | Settle up | "Add expenses to see who pays whom." | R1 |
| Suggestion is stale | Settle up | "These balances have changed. Refresh to see the current suggestions." | R6 |
| Payment marked | Settle up | None; moves to Payments made | R5 |
| Delete dialog | Settle up | Title: "Delete this payment?" Body: "The suggested payment will come back and the balances will change." Buttons: Cancel, Delete | R7 |
| Payment deleted | Settle up | None; suggestion reappears | R7, R8 |
| Not found (missing or not owned) | Trip page | "Trip not found." | F1.R9 |
| Server error | Settle up | "Something went wrong. Try again." | Project rules |

When there are no suggestions: if the trip has no expenses, the section shows "Add expenses to see who pays whom."; otherwise it shows "Everyone is settled." (decided 2026-11-05; the two messages never show together).

Loading: a loading state is shown in the section while suggestions and payments are fetched. Mark as paid and Delete are disabled while their request is in progress, so a double click can't record the same payment twice.

## Accessibility
- Each suggestion is a row with the full sentence, so a screen reader reads "Jo pays Sam 40.00".
- The Mark as paid button's accessible name includes the sentence (for example, "Mark Jo pays Sam 40.00 as paid").
- The delete dialog traps focus, moves focus to Cancel by default, returns focus to the payment's Delete control on close, and closes on Escape without deleting.
- Each payment's Delete control has an accessible name that includes its sentence.
- Status changes (a suggestion moving to Payments made) are announced to screen readers.
- Contrast for text and buttons meets WCAG AA.
- Keyboard: Tab order follows the visual order. No action depends on hover.
- Reduced motion: any dialog animation is removed when the user prefers reduced motion.

## Edge cases
- Example 1 → two suggestions, shown as Alex pays Sam 10.00, then Jo pays Sam 40.00 (product.md §6; order per R14).
- Two minimum sets pay the same pair different amounts → the set with the smaller amount for that pair is chosen (R2).
- Example 3 → after Jo pays Sam 40.00 is marked paid, one suggestion remains: Alex pays Sam 10.00 (product.md §6).
- Two people owing 10.00 each, one person owed 20.00 → two suggestions, both paying the person owed 20.00 (R1, R3).
- Balances A +10.00, B −10.00, C +5.00, D −5.00 → two suggestions: B pays A 10.00 and D pays C 5.00. A method that pays through one person would give three (R3).
- Large trip with many people → the exact minimum is still required (R1). The running time must be measured in the plan; if it is too slow, the plan goes back to the user, since the rule is fixed.
- Mark as paid, then add an expense that changes the balances → the paid payment stays; remaining suggestions are recalculated (R8).
- Mark as paid in one tab while the suggestion was already marked in another → the second request is refused as stale (R6).
- Delete a payment that was marked by mistake → the suggestion returns from current balances (R7, R8).
- Delete a payment after an expense was deleted → the suggestion returns using the new balances (R8).
- A person in a payment cannot be removed (F3.R4).
- A trip with no people → no suggestions, nothing to mark (R1).

## Acceptance criteria
- **F6.AC1** Given product.md §6 Example 1, when suggestions are read, then they are Alex pays Sam 10.00 and then Jo pays Sam 40.00, in that order. (R1, R3, R14)
- **F6.AC2** Given balances A +10.00, B +10.00, C −10.00, D −10.00 in trip order, when suggestions are read, then they are C pays A 10.00 and D pays B 10.00, because that set comes first in trip order. (R2)
- **F6.AC13** Given balances A +10.00, B −10.00, C +5.00, D −5.00 in trip order, when suggestions are read, then exactly two payments are suggested: B pays A 10.00 and D pays C 5.00. (R3)
- **F6.AC3** Given a suggestion, when the user marks it as paid, then a payment for its full amount is recorded and the balances update. (R4, R5)
- **F6.AC4** Given product.md §6 Example 3, when Jo pays Sam 40.00 is marked paid, then only Alex pays Sam 10.00 remains. (R1, R9)
- **F6.AC5** Given a suggestion that changed because another tab recorded a different payment, when the user marks the stale suggestion, then the payment is refused and the stale message is shown. (R6)
- **F6.AC6** Given a payment, when the user chooses Delete and then Cancel, then the payment still exists. (R7)
- **F6.AC7** Given a payment, when the user chooses Delete and then Delete in the dialog, then the payment is removed and its suggestion returns. (R7, R8)
- **F6.AC8** Given an expense is added after some payments are marked paid, when suggestions are read, then the paid payments are kept and the remaining suggestions are recalculated. (R8)
- **F6.AC9** Given all suggested payments are marked paid, when balances are read, then every balance is zero. (R10; product.md §3 F6 "Done when")
- **F6.AC10** Given any state of payments, when balances are read, then they add up to exactly zero. (R9; product.md R5)
- **F6.AC11** Given a trip of user B, when user A tries to mark a payment or read suggestions for it, then the response is Not found. (R11; F1.R9)
- **F6.AC12** Given a payment, when its record is read, then its payer and payee are on the same trip, and the payer and payee are different people. (Data constraints)
- **F6.AC14** Given balances P +4.00, Q +6.00, X −7.00 and Y −3.00 in trip order P, Q, X, Y, when suggestions are read, then they are X pays P 1.00, X pays Q 6.00 and Y pays P 3.00. Two minimum sets pay X and Y different amounts to P, and the set with 1.00 comes first. (R2, R14)
- **F6.AC15** Given a trip with expenses and no suggested payments remain (every balance is zero), when the Settle up section loads, then "Everyone is settled." is shown and no suggestion rows appear. (R10)
- **F6.AC16** Given a trip with no expenses, when the Settle up section loads, then "Add expenses to see who pays whom." is shown and no suggestion rows appear. (R1)
- **F6.AC17** Given the suggestions request fails, when the Settle up section loads, then "Something went wrong. Try again." is shown and no suggestion rows appear. (Project rules)
- **F6.AC18** Given suggestions are being fetched, when the Settle up section loads, then a loading state is shown and no rows or messages appear until the response arrives. (Loading state)

## Dependencies
- **F1**, **F2**, **F3**, **F4** and **F5** must be built first. F5 supplies the balances that F6 uses.
- **Build order:** step 6, the last feature in the MVP.
- **External services:** none.

## Test plan
Unit tests only (project rules). Each test names its AC ID. Transactions, same-trip checks, ownership and the database constraints go to code review.

- **F6.AC1** Unit test: suggestion function returns Alex pays Sam 10.00, then Jo pays Sam 40.00, for Example 1 with fake balances. (R1, R3, R14)
- **F6.AC2** Unit test: suggestion function returns C pays A 10.00 and D pays B 10.00 for the A +10, B +10, C −10, D −10 case. (R2)
- **F6.AC13** Unit test: suggestion function returns exactly two payments for the A +10, B −10, C +5, D −5 case, with the amounts given. (R1, R3)
- **F6.AC3** Unit test: mark-as-paid service records a payment for the full suggested amount in the fake store. (R4, R5)
- **F6.AC4** Unit test: with a payment from Jo to Sam of 40.00 in the fake data, the suggestion function returns only Alex pays Sam 10.00. (R9)
- **F6.AC5** Unit test: mark-as-paid service refuses a payment whose amount no longer matches the current suggestion. (R6)
- **F6.AC6** Unit test: Cancel in the delete-payment dialog does not call the delete service. (R7)
- **F6.AC7** Unit test: Delete in the delete-payment dialog calls the delete service once, and the suggestions recalculated afterwards include the suggestion again. (R7, R8)
- **F6.AC8** Unit test: suggestions recalculated with an extra expense in the fake data keep the paid payments and change the remaining suggestions. (R8)
- **F6.AC9** Unit test: when the fake data has suggestions all marked paid, the balance function returns zero for every person. (R10)
- **F6.AC10** Unit test: for a set of fake trips with random payments, the balances total zero. (R9)
- **F6.AC11** Code review: suggestion, payment and delete queries check trip ownership. (R11)
- **F6.AC12** Code review: payer and payee are on the trip, and a payment's payer and payee differ. Verified by the database constraint and the save transaction. (R5)
- **F6.AC14** Unit test: suggestion function returns X pays P 1.00, X pays Q 6.00 and Y pays P 3.00 for the P +4, Q +6, X −7, Y −3 case, in that order. (R2, R14)
- **F6.AC15** Unit test: the Settle up section shows "Everyone is settled." and no rows when the stubbed suggestions are empty and the trip has expenses. (R10)
- **F6.AC16** Unit test: the Settle up section shows "Add expenses to see who pays whom." and no rows when the stubbed suggestions are empty and the trip has no expenses. (R1)
- **F6.AC17** Unit test: the Settle up section shows "Something went wrong. Try again." and no rows when the stubbed request fails. (Project rules)
- **F6.AC18** Unit test: the Settle up section shows a loading state and no rows or messages while the stubbed request is pending. (Loading state)

## Open questions
None. All three questions were answered on 2026-11-04 (see Decisions log).

## Decisions log
- 2026-11-04: When expenses change after payments are marked, what happens to suggestions? → Recalculate what's still owed; paid payments stay.
- 2026-11-04: Conflict between product.md R6 (greedy) and the §5 goal of fewest payments? → Change R6 to the minimum-payments method (product.md R6 edited to match).
- 2026-11-04: How are ties chosen among minimum sets? → Trip order, as defined in F6.R2.
- 2026-11-04: Trip size limit for the exact method? → None; exact for any size.
- 2026-11-04: Spec approved by the user.
- 2026-11-04: Full or partial payments? → Full amount only.
- 2026-11-04: Confirmation before deleting a payment? → Yes, with Cancel and Delete.
- 2026-11-04: Wording of the proposed messages, including the stale-suggestion message and the delete dialog → Accepted as written.
- 2026-11-04: Where does the Settle up section sit on the trip page? → Below Balances, on the trip page (no tabs).
- 2026-11-04: Order of the Payments made list? → Newest first.
- 2026-11-04: Answers changed the spec's substance (placement, copy), so the spec returns to Draft and needs re-approval.
- 2026-11-04: Spec re-approved by the user.
- 2026-11-05: Order of the suggestions on the Settle up list? → Rule order (payer position, then payee position, in trip order), so Alex pays Sam 10.00 comes before Jo pays Sam 40.00. Changes AC1 and the Example 1 flow step. Added F6.R14.
- 2026-11-05: Tie-break when two minimum sets pay the same pair different amounts? → Smaller amount first. Added to F6.R2, with the new edge case and F6.AC14.
- 2026-11-05: Answers changed the spec's substance (display order, tie-break, new AC), so the spec returns to Draft. Its plan (`docs/plans/F6-settle-up.md`) is out of date: its two Sent back items are answered, and the blocked tasks can now be added. product.md Example 1 and R6 are not edited yet; see the proposed edit.
- 2026-11-05: Spec approved by the user.
- 2026-11-05: Gap found in planning: the States table has confirmed copy for "Everyone is settled.", "Add expenses to see who pays whom." and "Something went wrong. Try again.", and a loading state, but no acceptance criteria. Added F6.AC15 to F6.AC18 with their unit tests. No new copy.
- 2026-11-05: When both empty-state messages could apply (no expenses, so no suggestions) → Show "Add expenses to see who pays whom." when there are no expenses, otherwise "Everyone is settled.". The suggestions response now carries `has_expenses` so the client can choose.
- 2026-11-05: Spec re-approved by the user (after the new ACs and response shape).
- 2026-11-05: Answers changed the spec's substance (new ACs, response shape), so the spec returns to Draft and needs re-approval. Its plan (`docs/plans/F6-settle-up.md`) is out of date: its Sent back item is answered, and F6.T15 must cover AC15 to AC18.
