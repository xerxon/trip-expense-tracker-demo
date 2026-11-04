# F5 — Balances

_Status: Approved · Last updated: 2026-11-04 · Source: product.md §3, §4 (R4, R5), §5 Goals, §6 Worked examples_

## Summary
The trip shows what each person is owed or owes, so anyone can see where the group stands. A balance is what a person paid, minus their share of expenses, adjusted by payments. All balances on a trip always add up to exactly zero. This feature is read-only: it shows numbers computed from expenses and payments.

## User stories
- As a user, I want to see each person's balance, so that I know who is owed money and who owes it.
- As a user, I want the balances to always add up to zero, so that I can trust them.
- As a user, I want a person who is square to show as settled, so that nobody is listed with an amount that doesn't matter.

## Scope
**In:**
- Each person's balance on a trip, shown as "is owed" or "owes" with an amount (product.md §3 F5)
- Balance formula including payments (product.md R4; Key terms "Balance")
- Settled display for a balance of zero (decided 2026-11-04)
- Balances section on the trip page, in trip order (decided 2026-11-04)
- Balances always sum to zero (product.md R5, F5 "Done when")

**Out:**
- Suggested payments and marking them paid (F6)
- Editing balances or any manual adjustment (product.md §2 Assumptions: no editing)
- Currency, conversion and export (product.md "After the core")
- Charts or history of balances over time (not in product.md)

## User flow & screens
Screens: **Trip page** (from F3 and F4), with a **Balances** section below the Expenses section. No mock screens exist in `docs/design`.

1. **View balances.** User opens a trip. The Balances section lists every person on the trip in trip order, each with their balance.
2. **Owed.** A positive balance shows "is owed" and the amount (for example, "Sam is owed 50.00").
3. **Owes.** A negative balance shows "owes" and the absolute amount (for example, "Alex owes 10.00").
4. **Settled.** A zero balance shows "Settled" with no amount (for example, "Jo: Settled").
5. **Changes.** After an expense is added or deleted, or a payment is marked (F6), the Balances section shows the new numbers on refresh.

## Requirements
- **F5.R1** A person's balance = what they paid − their shares + payments they made − payments they received (product.md R4).
- **F5.R2** A positive balance shows as "is owed" with the amount. A negative balance shows as "owes" with the absolute amount. (product.md §3 F5, Key terms "Balance".)
- **F5.R3** A balance of exactly zero shows as "Settled" with no amount. (Decided 2026-11-04.)
- **F5.R4** The balances of everyone on a trip always add up to exactly zero (product.md R5). The sum is calculated in cents from the stored records, not from rounded values.
- **F5.R5** Balances are shown in trip order, the same order as the People list. (Decided 2026-11-04.)
- **F5.R6** Amounts are shown with two decimal places and no currency symbol (product.md §2 Assumptions: one currency, no currency setting).
- **F5.R7** Balances are computed from stored records each time they are read. They are not stored as their own values, so they can't drift from the expenses and payments.
- **F5.R8** Balances are read-only. No control on this section changes any record.
- **F5.R9** Balances are shown only to the owner of the trip. The request checks ownership (F1.R10, F2.R9).

## Data & contract
**No new tables.** Balances are calculated from:
- `people` (F3) — for names and order
- `expenses` and `expense_participants` (F4) — for amounts paid and shares
- `payments` (F6) — for payments made and received

**Calculation:** a single function takes a trip's people, expenses and payments, and returns one balance per person in cents. The function is pure: it takes the data as input and touches no database, so it can be unit tested with fake data (project rules).

**Endpoint (path chosen in the plan):**
- Balances for a trip id: no body. Success: array of `{ person_id, name, balance_cents }` in trip order. Not found: same response as a missing trip (F1.R9).

The display label ("is owed", "owes", "Settled") is decided in the front end from the sign of `balance_cents`. It is not stored.

**Browser storage:** none.

## States & errors
Copy below is confirmed as written (2026-11-04).

| Situation | Where | Proposed copy | Rule |
|---|---|---|---|
| Positive balance | Balances | "[name] is owed [amount]" | R2 |
| Negative balance | Balances | "[name] owes [amount]" | R2 |
| Zero balance | Balances | "[name]: Settled" | R3 |
| No people on trip | Balances | "Add people to see balances." | R1 |
| No expenses or payments yet | Balances | Everyone shows "Settled" (no separate message) | R3 |
| Totals do not add to zero | Balances | Section is not shown; error is logged (see Edge cases) | R4 |
| Not found (missing or not owned) | Trip page | "Trip not found." | F1.R9 |
| Server error | Balances | "Balances couldn't be loaded. Try again." | Project rules |

Loading: a loading state is shown in the section while the balances are fetched.

## Accessibility
- Each balance is a row with the name and the status in text, so a screen reader reads "Sam is owed 50.00", not a bare number.
- "Settled" is text, not colour alone.
- Owed and owes are distinguished by the word, not by colour alone.
- Contrast for text meets WCAG AA. Any colour used for owed or owes must also meet it.
- Keyboard: the section is reachable in the normal tab order. It has no controls.
- Reduced motion: no animation in this section.

## Edge cases
- A balance of 0.00 after payments → shows "Settled" (R3).
- A balance of 0.01 → shows "is owed 0.01" or "owes 0.01" (R2, R6).
- Total of balances is not zero → this should never happen, since the stored records always balance (R4). If it does, the section is hidden, the error is logged without any personal data, and the user sees the error message (project rules: do not swallow errors).
- A person removed from the trip → cannot be, while they are in any expense or payment (F3.R4). A person with no expenses, payments or shares is at zero and is shown as Settled.
- Expense deleted → balances change at once on refresh (R1).
- Two people with the same balance → both shown, in trip order (R5).
- Trip with people but no expenses → every balance is zero and shows "Settled" (R3).
- Very large amounts → computed in cents, so there is no rounding drift (R4).

## Acceptance criteria
- **F5.AC1** Given product.md §6 Example 1 (Sam pays 90.00, Alex pays 30.00, all three share), when balances are read, then Sam is owed 50.00, Alex owes 10.00 and Jo owes 40.00. (R1, R2)
- **F5.AC2** Given the same trip, when balances are read, then the three amounts add up to exactly zero. (R4)
- **F5.AC3** Given the example in product.md §6 Example 3 (Jo pays Sam 40.00 recorded as a payment), when balances are read, then Jo owes 0.00 and shows Settled, Sam is owed 10.00, and Alex owes 10.00. (R1, R3)
- **F5.AC4** Given a person whose balance is exactly zero, when the balances are shown, then the row reads "Settled" with no amount. (R3)
- **F5.AC5** Given a balance of 0.01, when shown, then it reads with two decimal places and the correct label. (R2, R6)
- **F5.AC6** Given a trip, when balances are shown, then the people are listed in the order they were added. (R5)
- **F5.AC7** Given an expense is deleted, when balances are read again, then they reflect the deletion. (R7)
- **F5.AC8** Given the balance section, when the user looks for a control that changes a record, then none exists. (R8)
- **F5.AC9** Given user B's trip, when user A requests its balances, then the response is Not found. (R9; F1.R9)

## Dependencies
- **F1**, **F2**, **F3** and **F4** must be built first. F6 must exist for payments to affect balances.
- **Build order:** step 5. Balances can be built and tested once F4 exists; the payment term is added when F6 lands.
- **External services:** none.

## Test plan
Unit tests only (project rules). Each test names its AC ID. The ownership check goes to code review.

- **F5.AC1** Unit test: balance function returns +50.00, −10.00, −40.00 in cents for product.md §6 Example 1. (R1, R2)
- **F5.AC2** Unit test: balance function's total is zero for Example 1 and for a set of random trips with fake data. (R4)
- **F5.AC3** Unit test: balance function gives the Example 3 result when a payment from Jo to Sam is included in the fake data. (R1, R3)
- **F5.AC4** Unit test: label function returns "Settled" with no amount for zero. (R3)
- **F5.AC5** Unit test: label function formats 1 cent as "0.01" with the right label. (R2, R6)
- **F5.AC6** Unit test: balances are returned in position order. (R5)
- **F5.AC7** Unit test: removing an expense from the fake data changes the balance function's result. (R7)
- **F5.AC8** Unit test: balances view has no control that writes data. (R8)
- **F5.AC9** Code review: the balances query checks trip ownership. (R9)

## Open questions
None. Both questions were answered on 2026-11-04 (see Decisions log).

## Decisions log
- 2026-11-04: How to show a zero balance? → "Settled" with no amount.
- 2026-11-04: Order and place of the balances list? → Trip order, in a section on the trip page.
- 2026-11-04: Spec approved by the user.
- 2026-11-04: Wording of the proposed messages, including "Settled" and the error text → Accepted as written.
- 2026-11-04: Where does the Balances section sit on the trip page? → Below Expenses.
- 2026-11-04: Answers changed the spec's substance (placement), so the spec returns to Draft and needs re-approval.
- 2026-11-04: Spec re-approved by the user.
