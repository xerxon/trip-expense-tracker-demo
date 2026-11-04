# F1 — Registration and login

_Status: Approved · Last updated: 2026-11-04 · Source: product.md §3_

## Summary
A visitor creates an account with an email and password, then logs in and out. Every trip page and trip action requires a logged-in user, and a user can only ever see or change their own trips. This is the base for every other feature: nothing else is safe to build until it works.

## User stories
- As a visitor, I want to register with my email and a password, so that I can start tracking trips.
- As a user, I want to log in and out, so that only I can open my account.
- As a user, I want to stay logged in while I use the app, so that I don't re-enter my password on every page.
- As a user, I want other people's trips to be invisible to me, so that my trip data stays private.

## Scope
**In:**
- Registration with email and password (product.md §3 F1)
- Login and logout
- Password hashing (product.md §3 F1, project rules)
- Login check on every trip page and trip endpoint, and the ownership check on each (product.md §2 Ownership rule, F1 "Done when")
- Session that ends when the browser closes (decided 2026-11-04)

**Out:**
- Email verification and password reset (product.md §2 Assumptions)
- Display name or any profile field beyond email and password (product.md §3 F1 lists only email and password)
- Account deletion (not in MVP, product.md §3)
- Login rate limiting or lockout (decided 2026-11-04: none for the demo)
- Sharing trips with other users (product.md "After the core": out of scope)
- Trip list, trip creation and trip deletion screens are F2; this spec only guarantees they are protected

## User flow & screens
Screens: **Register**, **Log in**, and the existing **Trips** page (F2, used here as the landing page). No mock screens exist in `docs/design`.

1. **Register.** Visitor opens Register, enters email and password, submits. Valid input creates the account and logs the user in. The user lands on Trips.
2. **Log in.** Visitor opens Log in, enters email and password, submits. Correct details log the user in and send them to the page they asked for, or Trips if none.
3. **Use the app.** The session stays active until the browser is closed. Each trip page checks the session and the ownership rule.
4. **Log out.** User chooses Log out. The session ends and the user lands on Log in.
5. **Logged-out visitor opens a trip URL.** Visitor is sent to Log in. After a successful login they are taken to the trip page they first asked for, if they still own it. Otherwise they see Not found (see R9).
6. **Other user's trip.** A logged-in user opens a trip URL that belongs to someone else. They see Not found, the same as for a trip that doesn't exist.

## Requirements
- **F1.R1** A visitor can register with an email and a password. A new account is created only when both are valid. An email is valid when, after trimming (R2), it has exactly one `@`, text on both sides of it, a dot in the domain part, no spaces, and is at most 254 characters.
- **F1.R2** Email is trimmed of surrounding spaces and compared case-insensitively. `Sam@Example.com` and `sam@example.com` are the same account. Two accounts cannot share an email after this normalization.
- **F1.R3** Password must be at least 8 characters. Spaces count as characters, so a password made only of spaces is valid if it is 8 or more long. There is no maximum length and no required character types.
- **F1.R4** Passwords are stored only as salted hashes. They are never stored, logged or returned in plain text.
- **F1.R5** A failed login (unknown email or wrong password) shows the same message in both cases. A failed registration because the email is already taken shows the same neutral message, not one that reveals the account exists.
- **F1.R6** A user can log in with email and password, and log out. Logout ends the session immediately.
- **F1.R7** The session ends when the browser is closed. It has no fixed expiry time while the browser stays open. (Derived from the 2026-11-04 decision; see Decisions log.)
- **F1.R8** A logged-out visitor who opens any trip page is sent to Log in and, after a successful login, returned to that page.
- **F1.R9** A logged-in user who requests a trip they don't own gets the same Not found response as for a trip that does not exist. The response does not confirm the trip exists.
- **F1.R10** Every trip endpoint requires a logged-in user and checks, in the same query or action, that the trip belongs to that user. Being logged in alone is not enough (product.md §2 Ownership rule).
- **F1.R11** Registration and login do not allow a user to take over an existing account. A logged-out request can only create a new account or log in to an existing one.
- **F1.R12** A logged-in user who opens Register or Log in is sent to Trips. A logged-in user cannot create a second account; they must log out first.

## Data & contract
**Users (new table or store):**
- `id` — unique identifier
- `email` — normalized per R2; unique; required
- `password_hash` — salted hash per R4; required; never returned by any endpoint
- `created_at` — UTC (project rules)

**Sessions:** a server-side session or signed session cookie. The mechanism is chosen in the plan. Required behavior: the cookie is a session cookie with no fixed expiry (R7), and logout invalidates it (R6).

**Endpoints (paths chosen in the plan):**
- Register: request `{ email, password }`. Success: account created, session started.
- Log in: request `{ email, password }`. Success: session started.
- Log out: no body. Success: session ended.
- Every trip endpoint (added in F2–F6): requires a session (R10). A request without a session gets HTTP 401 with the JSON body `{ "error": "Log in required" }` and no data. Other errors are covered under States & errors.

**Constraint:** a unique constraint on normalized `email` in the database (R2). Verified in code review, not by unit test.

**Browser storage:** none beyond the session cookie. No passwords or tokens in local storage.

## States & errors
Copy below is confirmed as written (2026-11-04).

| Situation | Where | Proposed copy | Rule |
|---|---|---|---|
| Registration succeeds | Register → Trips | None (user lands on Trips) | R1 |
| Email empty or malformed | Register | "Enter a valid email address." | R1 |
| Password under 8 characters | Register | "Password must be at least 8 characters." | R3 |
| Email already in use | Register | "We couldn't create an account with that email. Try logging in." | R5 |
| Wrong email or password | Log in | "Email or password is incorrect." | R5 |
| Field empty on login | Log in | "Enter your email and password." | R5 |
| Logout | Any page → Log in | None (user sees Log in) | R6 |
| Trip not owned or missing | Trip page | "Trip not found." (Not found page) | R9 |
| Logged-out visitor opens trip | Trip URL → Log in | None; return to trip after login | R8 |
| Logged-out API request to a trip endpoint | API | HTTP 401, JSON error `{ "error": "Log in required" }`, no data | R10 |
| Server error during register or login | Register / Log in | "Something went wrong. Try again." | Project rules: do not swallow errors |

Loading: the Register and Log in buttons are disabled while the request is in progress, to prevent double submits.

Empty: not applicable (no lists on these screens).

## Accessibility
- Every input has a visible label. Placeholders do not replace labels.
- Error messages sit next to the field they concern and are announced to screen readers (`role="alert"` or `aria-live`).
- Keyboard: Tab order follows the visual order; Enter submits the form; focus moves to the first error after a failed submit.
- Password fields use `autocomplete="new-password"` on Register and `autocomplete="current-password"` on Log in, so password managers work.
- Contrast for error text meets WCAG AA.
- Reduced motion: no animation in this feature, so nothing to reduce.

## Edge cases
- Email with different capitals or surrounding spaces on login → treated as the same account (R2).
- Email with different capitals on register → rejected as taken (R2, R5).
- Password of exactly 8 characters → accepted (R3).
- Password of 7 characters → rejected, no account created (R3).
- Password of 8 or more spaces → accepted (R3).
- Very long password (no maximum) → accepted; the hashing step must still complete in reasonable time. Confirm the hash cost in the plan.
- Two registrations with the same email at the same moment → one succeeds; the other gets the "already in use" message (unique constraint, R2).
- Logged-out API request to a trip endpoint → HTTP 401 with a JSON error and no data (R10).
- Email with a space inside, two `@`, or 255 characters → rejected as malformed, no account created (R1).
- User logs out in one tab and clicks a trip in another → the other tab's next request is rejected and the visitor is sent to Log in (R6, R8).
- Browser closed → session gone; next visit requires login (R7).
- Password saved in the database as plain text, or in logs → must never happen (R4).

## Acceptance criteria
- **F1.AC1** Given a visitor on Register with a valid email and an 8+ character password, when they submit, then an account is created, the password is stored only as a hash, the user is logged in, and they land on Trips. (R1, R4)
- **F1.AC2** Given a password of 7 characters, when a visitor submits Register, then no account is created and the password error is shown. (R3)
- **F1.AC3** Given an existing account for `sam@example.com`, when a visitor registers with `SAM@example.com`, then no account is created and the neutral "already in use" message is shown. (R2, R5)
- **F1.AC4** Given an email typed as `  Sam@Example.com `, when the account is created, then the stored email is `sam@example.com`. (R2)
- **F1.AC5** Given a registered user, when they log in with the correct email and password, then they are logged in and taken to the page they asked for, or Trips if none. (R6, R8)
- **F1.AC6** Given a registered email, when someone logs in with a wrong password, and separately with an unknown email, then both show the same message. (R5)
- **F1.AC7** Given a logged-in user, when they log out, then the session ends and any trip URL redirects to Log in. (R6, R8)
- **F1.AC8** Given a logged-out visitor, when they open a trip URL, then they are sent to Log in, and after a successful login they return to that trip. (R8)
- **F1.AC9** Given user A's trip, when user B opens its URL, then B sees Not found, the same as for a missing trip. (R9)
- **F1.AC10** Given a request to any trip endpoint without a session, when it is received, then no trip data is returned and the request is rejected. (R10)
- **F1.AC11** Given a logged-in user, when they call a trip endpoint for a trip they don't own, then the request is rejected in the same query that loads the trip. (R10)
- **F1.AC12** Given a session cookie from before the browser was closed, when the browser is reopened, then the user must log in again. (R7)
- **F1.AC13** Given the users table, when two accounts are created with the same normalized email, then the database rejects the second. (R2)
- **F1.AC14** Given the code, when a password is handled, then it is never logged, returned or stored in plain text. (R4)
- **F1.AC15** Given a logged-in user, when they open Register or Log in, then they are sent to Trips. (R12)
- **F1.AC16** Given an email with no `@`, two `@`, a space, no dot in the domain, or more than 254 characters, when a visitor submits Register, then no account is created and "Enter a valid email address." is shown. (R1)
- **F1.AC17** Given a logged-out request to a trip endpoint, when it is an API request, then the response is HTTP 401 with a JSON error and no trip data; when it is a page request, then the visitor is redirected to Log in. (R8, R10)

## Dependencies
- **Build order:** step 1. Everything else (F2–F6) depends on F1.
- **F2** (Trips) must use the ownership check from R10 on every trip action.
- **External services:** none. Password hashing uses a library chosen in the plan.

## Test plan
Unit tests only (project rules). Each test names its AC ID.

- **F1.AC2** Unit test: password validator rejects 7 characters and accepts 8, including 8 spaces. (R3)
- **F1.AC4** Unit test: email normalizer trims and lowercases. (R2)
- **F1.AC16** Unit test: email validator rejects each malformed example (no `@`, two `@`, a space, no dot in the domain, 255 characters) and accepts a valid address of 254 characters. (R1)
- **F1.AC3** Unit test: registration service, with a fake user store, rejects a second account whose normalized email matches. Shows the neutral message. (R5)
- **F1.AC6** Unit test: login service returns the same error for unknown email and wrong password. (R5)
- **F1.AC1** Unit test: registration stores a hash, not the plain password, using a fake store. (R4)
- **F1.AC14** Unit test: the logger does not receive the password or hash in the register and login paths, using a fake logger. (R4)
- **F1.AC7** Unit test: logout invalidates the session in the fake session store. (R6)
- **F1.AC8** Unit test: the auth guard redirects a request with no session to Log in, and keeps the requested URL. (R8)
- **F1.AC10** Unit test: the auth guard rejects a trip endpoint request with no session before any trip lookup. (R10)
- **F1.AC17** Unit test: the auth guard returns HTTP 401 with a JSON error for an API request with no session, and redirects a page request to Log in. (R8, R10)
- **F1.AC12** Unit test: session cookie has no expiry attribute. (R7)
- **F1.AC5** Unit test: a successful login starts a session and returns the requested URL. (R6, R8)
- **F1.AC15** Unit test: the route guard for Register and Log in redirects a request with a session to Trips. (R12)
- **F1.AC9** Code review: the trip lookup for another user's trip returns the same response as a missing trip. (R9)
- **F1.AC11** Code review: the ownership check is part of the trip database query, not a separate check after load. (R10)
- **F1.AC13** Code review: unique constraint exists on normalized email in the database. (R2)

## Open questions
None. All four questions were answered on 2026-11-04 (see Decisions log).

## Decisions log
- 2026-11-04: Password rules (min length, character types) → Minimum 8 characters, no other rules.
- 2026-11-04: Maximum password length → No maximum.
- 2026-11-04: How long a login lasts → Until the browser is closed.
- 2026-11-04: Failed login and duplicate-email messages → Generic message (same text for both).
- 2026-11-04: Where a logged-out visitor goes when opening a trip URL → Login page, then return to the trip.
- 2026-11-04: What happens after registration → Logged in and sent to Trips.
- 2026-11-04: Failed-login limiting → No limit for the demo.
- 2026-11-04: Email comparison → Case-insensitive, trimmed.
- 2026-11-04: Trip owned by someone else → Not found, same as a missing trip.
- 2026-11-04: Logout destination → Login page.
- 2026-11-04: Logged-in user opens Register or Log in → Sent to Trips (added as F1.R12, F1.AC15).
- 2026-11-04: Password made only of spaces (8 or more) → Valid (clarified in F1.R3).
- 2026-11-04: Spec approved by the user.
- 2026-11-04: Wording of the proposed messages → Accepted as written.
- 2026-11-04: What counts as a valid email address → Simple check: trimmed, exactly one `@`, text on both sides, a dot in the domain, no spaces, at most 254 characters (F1.R1, F1.AC16).
- 2026-11-04: Response for a logged-out trip API request → HTTP 401 with a JSON error and no data; page requests redirect to Log in (F1.R10, F1.AC17).
- 2026-11-04: Can a logged-in user register a second account? → No, they must log out first. Derived from F1.R12, now stated explicitly.
- 2026-11-04: Answers changed the spec's substance (email rule, error response), so the spec returns to Draft and needs re-approval.
- 2026-11-04: Spec re-approved by the user.
