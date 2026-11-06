# F1 plan — Registration and login

_Status: Approved · Spec: `docs/specs/features/F1-registration-and-login.md` (Approved) · Last updated: 2026-11-06_

## Approach

Build the account and session layer in the API first, as pure rules and services with fakes, then the database models and Prisma stores, then the HTTP routes and the auth guard. The web app comes last: its route rules are pure functions, and the Register, Log in and logout screens call the API. Sessions are a random token in a signed cookie, with a session row in the database so logout takes effect at once. Passwords use Node's built-in scrypt, so no new hashing dependency is needed.

## Tasks

Each task is one commit. Its commit message starts with its ID, for example `F1.T2 add password hashing`.

### F1.T1 — Email and password rules

- **Files:** `app/api/src/auth/rules.ts`, `app/api/src/auth/rules.test.ts`
- **Depends on:** none
- **Work:**
  - `normalizeEmail`: trim and lower-case (F1.R2).
  - `validateEmail`: after normalizing, exactly one `@`, text on both sides, a dot in the domain part, no spaces, at most 254 characters. Returns the copy "Enter a valid email address." or null (F1.R1).
  - `validatePassword`: at least 8 characters; spaces count; no maximum; returns "Password must be at least 8 characters." or null (F1.R3).
  - No imports from Prisma, Fastify or the network.
- **Done when:** `F1.AC2`, `F1.AC4` and `F1.AC16` tests pass in `rules.test.ts`.
- **Covers:** F1.R1, F1.R2, F1.R3, F1.AC2, F1.AC4, F1.AC16

### F1.T2 — Password hashing

- **Files:** `app/api/src/auth/password.ts`, `app/api/src/auth/password.test.ts`
- **Depends on:** none
- **Work:**
  - `hashPassword(password)` uses `crypto.scrypt` with a random 16-byte salt and the parameters N=2^17, r=8, p=1, maxmem 256 MiB (the OWASP minimum for scrypt). The result is one string holding the algorithm, parameters, salt and hash.
  - `verifyPassword(password, stored)` compares with `crypto.timingSafeEqual`. A malformed stored value returns false.
  - Record the time of one hash on the dev machine in the Decisions log (plan check for F1.R3 "confirm the hash cost in the plan").
- **Done when:** tests pass for: the stored value is not the password; two hashes of the same password differ (salt); verify is true for the right password and false for a wrong one or a malformed value. Hash time is recorded.
- **Covers:** F1.R4, F1.AC1 (hash part), F1.AC14 (no plain value stored)

### F1.T3 — Register and log-in services with fakes

- **Files:** `app/api/src/auth/types.ts`, `app/api/src/auth/service.ts`, `app/api/src/auth/service.test.ts`
- **Depends on:** F1.T1, F1.T2
- **Work:**
  - `types.ts`: `UserStore` (find by `emailKey`, create), `EmailTakenError`, `InvalidCredentialsError`, and the logger type. No database import.
  - `register({ email, password })`: validate (T1), normalize, check for an existing `emailKey`, hash (T2), create. If the store raises `EmailTakenError` (race between two registrations), return the same neutral message as the pre-check (F1.R5).
  - `login({ email, password })`: find by `emailKey`. Unknown email and wrong password both run a hash verify (a dummy hash for the unknown case) and both raise `InvalidCredentialsError` with the same copy (F1.R5).
  - Logging: log event names and the user id only, through the injected logger. Never the email, password, hash or token (project rules).
  - Errors other than the two named ones are rethrown, never swallowed (project rules).
- **Done when:** tests named below pass against a fake store and a fake logger.
- **Covers:** F1.R5, F1.R6 (service side), F1.R11, F1.AC1, F1.AC3, F1.AC6, F1.AC14, F1.AC2 (service rejects a short password)

### F1.T4 — Database models and migration

- **Files:** `app/api/prisma/schema.prisma`, `app/api/prisma/migrations/<timestamp>_add_users_and_sessions/migration.sql` (generated), `app/api/prisma/migrations/migration_lock.toml` (generated), `app/api/src/db.ts`, `app/api/package.json` (adds `@prisma/adapter-better-sqlite3`), `app/package-lock.json`
- **Depends on:** F1.T3
- **Work:**
  - `User`: `id` (uuid), `email` (normalized, required), `emailKey` (normalized, unique), `passwordHash` (required), `createdAt` (UTC).
  - `Session`: `id` (the SHA-256 hash of the token, primary key), `userId` (references User, cascade delete), `createdAt` (UTC).
  - Generate the migration with `npm run db:migrate -w api -- --name add_users_and_sessions`. Then run `npm run db:generate -w api`.
  - `db.ts`: create the Prisma client. Prisma 7 needs a SQLite driver adapter, so add the adapter that matches Prisma 7.10.1. Check its constructor against the installed package before writing the code. Read `DATABASE_URL` from the environment (via `prisma.config.ts`).
  - **Stop for person review:** a person reads `migration.sql` and approves it before the migration is committed or applied to any shared database (CLAUDE.md, project rules).
- **Done when:** the migration file is approved by a person; `npm run typecheck -w api` passes; the unique index on `emailKey` is in `migration.sql`.
- **Covers:** F1.R2, F1.R4 (column), F1.R7 (session table), F1.AC13 (code review)

### F1.T5 — Prisma-backed stores

- **Files:** `app/api/src/auth/prisma-stores.ts`, `app/api/src/auth/prisma-stores.test.ts`
- **Depends on:** F1.T4
- **Work:**
  - `createUserStore(db)` implements `UserStore`. `create` maps a unique-constraint error on `emailKey` to `EmailTakenError`. Any other error is rethrown.
  - `createSessionStore(db)` implements the session store used by F1.T6: insert, find by hash, delete by hash.
  - Only Prisma query methods, with parameters (project rules). No string-built queries.
  - Pure helper `isEmailKeyViolation(err)` holds the mapping rule, so it can be unit tested with a fake error.
- **Done when:** the `F1.AC13` mapping test passes; the uniqueness constraint is confirmed in code review against `migration.sql`.
- **Covers:** F1.R2, F1.AC13

### F1.T6 — Session service and cookie options

- **Files:** `app/api/src/auth/session.ts`, `app/api/src/auth/session.test.ts`
- **Depends on:** F1.T3
- **Work:**
  - `startSession(store, userId)`: random 32-byte token; stores only `sha256(token)`; returns the token.
  - `findSessionUser(store, token)`: returns the user id for a live session, or null.
  - `endSession(store, token)`: deletes the row by hash.
  - `sessionCookieOptions({ secure })`: `httpOnly`, `sameSite: "lax"`, `path: "/"`, signed. It has **no** `expires` or `maxAge` (session cookie, F1.R7). `secure` comes in as a parameter so tests do not read the environment.
  - Tokens are never logged.
- **Done when:** `F1.AC7` (ending a session removes it from the fake store) and `F1.AC12` (the cookie options have no expiry key) tests pass.
- **Covers:** F1.R6, F1.R7, F1.AC7, F1.AC12

### F1.T7 — Auth routes and cookie plugin

- **Files:** `app/api/src/routes/auth.ts`, `app/api/src/routes/auth.test.ts`, `app/api/src/server.ts`, `app/api/src/index.ts`, `app/api/package.json` (adds `@fastify/cookie`)
- **Depends on:** F1.T3, F1.T5, F1.T6
- **Work:**
  - `buildServer({ logger, auth })` takes optional stores and the cookie secret, so tests inject fakes and default to the Prisma stores. The existing `/health` test must still pass.
  - `POST /auth/register` → 201 with `{ id, email }` and the session cookie. Failures → 400 with `{ "error": "<copy>" }`. A duplicate email gets the same neutral 400 as other registration failures, so the response does not show whether an account exists (F1.R5).
  - `POST /auth/login` → 200 with the cookie. Empty fields → 400 "Enter your email and password.". Wrong or unknown → 401 "Email or password is incorrect."
  - `POST /auth/logout` → 204; ends the session and clears the cookie.
  - `GET /auth/me` → 200 `{ id, email }` or 401 `{ "error": "Log in required" }`. Never returns the password hash.
  - Unexpected errors go to the Fastify error handler (500 "Something went wrong. Try again."), with no swallowing.
  - `index.ts` reads `SESSION_SECRET` from the environment and refuses to start without it. No default value.
- **Done when:** route tests pass with `app.inject`: `F1.AC5` (login sets the cookie and returns the user), `F1.AC6` (same 401 body for unknown and wrong password), `F1.AC7` (logout returns 204, clears the cookie, and the next `/auth/me` is 401), `F1.AC14` (no response body contains the password or the hash).
- **Covers:** F1.R4 (responses), F1.R5, F1.R6, F1.AC5, F1.AC6, F1.AC7, F1.AC14

### F1.T8 — Auth guard for trip endpoints (API side)

- **Files:** `app/api/src/auth/guard.ts`, `app/api/src/auth/guard.test.ts`
- **Depends on:** F1.T6, F1.T7
- **Work:**
  - `requireLogin` is a Fastify `preHandler`. It reads the signed cookie, looks up the session, and sets `request.userId`. With no live session it replies 401 `{ "error": "Log in required" }` and does not call the handler.
  - The check happens before any trip lookup. F2 applies this hook to every trip route.
  - F1 has no trip routes yet. The tests use a dummy protected route.
- **Done when:** `F1.AC10` (a spy handler is never called and the session store is never queried when there is no cookie) and `F1.AC17` (API request with no session → 401 JSON, no data) pass.
- **Covers:** F1.R8 (API part), F1.R9 (guard part; the Not found response itself is built in F2), F1.R10 (guard part), F1.AC10, F1.AC17

### F1.T9 — Web route rules (pure functions)

- **Files:** `app/web/src/routes/rules.ts`, `app/web/src/routes/rules.test.ts`, `app/web/package.json` (adds `react-router`, the router named in CLAUDE.md)
- **Depends on:** none (web can start in parallel with the API tasks)
- **Work:**
  - `redirectFor(session, path)`: no session and a trip or app page → `/login?next=<path>`. Session and a Register or Log in path → `/trips`. Otherwise null (F1.R8, F1.R12).
  - `safeNextPath(next)`: accepts only a path that starts with a single `/` and is not `//`. Anything else returns `/trips` (the open-redirect guard).
  - `afterLogout()` → `/login`.
  - No React imports, so these run as plain unit tests.
- **Done when:** tests pass for `F1.AC5` (`next` used when safe, ignored when not), `F1.AC7` (after logout a trip path goes to login), `F1.AC8` (logged-out trip path goes to login with the path kept), `F1.AC15` (session on Register or Log in goes to `/trips`).
- **Covers:** F1.R8, F1.R12, F1.AC5, F1.AC7, F1.AC8, F1.AC15, F1.AC17 (page half: logged-out page request redirects to Log in)

### F1.T10 — Register and Log in screens

- **Files:** `app/web/src/pages/RegisterPage.tsx`, `app/web/src/pages/RegisterPage.test.tsx`, `app/web/src/pages/LoginPage.tsx`, `app/web/src/pages/LoginPage.test.tsx`, `app/web/src/auth/api.ts`
- **Depends on:** F1.T7 (contract), F1.T9
- **Work:**
  - `api.ts`: `register`, `login`, `logout`, `me`. Calls use relative `/api/auth/...` paths, which the Vite proxy strips. Same-origin cookies only.
  - Forms with visible labels, `autocomplete="new-password"` on Register and `autocomplete="current-password"` on Log in, errors linked to fields, `role="alert"`, focus moved to the first error, and buttons disabled while a request is in flight (spec Accessibility and Loading).
  - The server's `error` text is shown as the message. The web app does not duplicate the validation rules, so there is one source of truth.
  - Server error → "Something went wrong. Try again."
- **Done when:** component tests with a fake `api` module pass for `F1.AC1` (success calls the success callback), `F1.AC2` (400 password message shown and no success callback), `F1.AC6` (login shows the same message for either failure), plus a test that the submit button is disabled while the request is pending.
- **Covers:** F1.R1, F1.R5, F1.R6 (UI), F1.AC1, F1.AC2, F1.AC6

### F1.T11 — App shell, router and Trips placeholder

- **Files:** `app/web/src/App.tsx`, `app/web/src/App.test.tsx` (existing test kept as it is), `app/web/src/router.test.tsx` (new), `app/web/src/pages/TripsPage.tsx` (placeholder), `app/web/src/main.tsx`
- **Depends on:** F1.T9, F1.T10
- **Work:**
  - `App` keeps the top heading "Trip Expense Tracker" on every page, so the existing test still passes unchanged.
  - Checks `GET /auth/me` on load and applies `redirectFor` (T9). Logout button calls `POST /auth/logout` and goes to `/login`, with no change to route rules.
  - After a successful register or log in, goes to `safeNextPath(next)`, or `/trips`.
  - `TripsPage` is a placeholder with a heading only. F2 replaces it.
- **Done when:** the existing `App.test.tsx` passes without edits; a new router test named `F1.AC1` (after registration the app shows Trips) passes; `F1.AC7` (logout shows the Log in page) passes in a component test.
- **Covers:** F1.R8, F1.R12, F1.AC1, F1.AC7

## Acceptance criteria map

Every AC in the spec appears once.

| AC      | How it is checked | Test name(s) or review item                                                                                                                                                                                                                 | File                                                                  |
| ------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| F1.AC1  | Unit test         | `F1.AC1 stores only a salted hash, never the password` (T2); `F1.AC1 registration stores a hash and returns the user` (T3); `F1.AC1 after registration the app shows Trips` (T11)                                                           | `password.test.ts`, `service.test.ts`, `router.test.tsx`              |
| F1.AC2  | Unit test         | `F1.AC2 rejects 7 characters and accepts 8, including 8 spaces` (T1); `F1.AC2 register service refuses a short password and creates nothing` (T3); `F1.AC2 shows the password error and does not call onSuccess` (T10)                      | `rules.test.ts`, `service.test.ts`, `RegisterPage.test.tsx`           |
| F1.AC3  | Unit test         | `F1.AC3 rejects a second account whose normalized email matches and shows the neutral message` (T3)                                                                                                                                         | `service.test.ts`                                                     |
| F1.AC4  | Unit test         | `F1.AC4 normalizer trims and lower-cases the email` (T1)                                                                                                                                                                                    | `rules.test.ts`                                                       |
| F1.AC5  | Unit test         | `F1.AC5 login sets the session cookie and returns the user` (T7); `F1.AC5 uses a safe next path and ignores an external one` (T9)                                                                                                           | `auth.test.ts`, `rules.test.ts`                                       |
| F1.AC6  | Unit test         | `F1.AC6 unknown email and wrong password give the same error` (T3); `F1.AC6 same 401 body for both` (T7); `F1.AC6 login shows the same message for either failure` (T10)                                                                    | `service.test.ts`, `auth.test.ts`, `LoginPage.test.tsx`               |
| F1.AC7  | Unit test         | `F1.AC7 ending a session removes it from the store` (T6); `F1.AC7 logout returns 204, clears the cookie, and /auth/me is then 401` (T7); `F1.AC7 after logout a trip path goes to Log in` (T9); `F1.AC7 logout shows the Log in page` (T11) | `session.test.ts`, `auth.test.ts`, `rules.test.ts`, `router.test.tsx` |
| F1.AC8  | Unit test         | `F1.AC8 logged-out trip path redirects to Log in and keeps the path` (T9)                                                                                                                                                                   | `rules.test.ts`                                                       |
| F1.AC9  | Code review       | Trip lookup for another user's trip returns the same response as a missing trip. **Cannot be checked in F1** (no trip routes until F2). Verified when the first F2 trip lookup is built.                                                    | —                                                                     |
| F1.AC10 | Unit test         | `F1.AC10 guard rejects a trip request with no session before any lookup` (T8)                                                                                                                                                               | `guard.test.ts`                                                       |
| F1.AC11 | Code review       | The ownership check is part of the trip database query. **Cannot be checked in F1** (no trip queries until F2). Verified when F2 adds its first query.                                                                                      | —                                                                     |
| F1.AC12 | Unit test         | `F1.AC12 session cookie options have no expiry or max-age` (T6)                                                                                                                                                                             | `session.test.ts`                                                     |
| F1.AC13 | Code review       | Unique index on `emailKey` in `migration.sql` (T4). The mapping of the error is tested in `F1.AC13 maps only an emailKey unique violation to EmailTakenError` (T5).                                                                         | `migration.sql`, `prisma-stores.test.ts`                              |
| F1.AC14 | Unit test         | `F1.AC14 logger receives no password or hash on register and login` (T3); `F1.AC14 no response body contains the password or hash` (T7)                                                                                                     | `service.test.ts`, `auth.test.ts`                                     |
| F1.AC15 | Unit test         | `F1.AC15 session on Register or Log in goes to Trips` (T9)                                                                                                                                                                                  | `rules.test.ts`                                                       |
| F1.AC16 | Unit test         | `F1.AC16 rejects malformed emails and accepts a 254-character address` (T1)                                                                                                                                                                 | `rules.test.ts`                                                       |
| F1.AC17 | Unit test         | `F1.AC17 API request with no session gets 401 JSON` (T8); `F1.AC17 page request with no session redirects to Log in` (T9)                                                                                                                   | `guard.test.ts`, `rules.test.ts`                                      |

## Build order

1. F1.T1 — Email and password rules
2. F1.T2 — Password hashing (after or alongside T1)
3. F1.T3 — Register and log-in services (after T1, T2)
4. F1.T4 — Database models and migration (after T3; **person review of migration.sql**)
5. F1.T5 — Prisma-backed stores (after T4)
6. F1.T6 — Session service and cookie options (after T3)
7. F1.T7 — Auth routes and cookie plugin (after T3, T5, T6)
8. F1.T8 — Auth guard, API side (after T6, T7)
9. F1.T9 — Web route rules (can start any time; no API dependency)
10. F1.T10 — Register and Log in screens (after T7 contract and T9)
11. F1.T11 — App shell, router and Trips placeholder (after T9, T10)

Cross-feature dependencies: none. F1 is the base. F2 must apply `requireLogin` (F1.T8) to every trip route.

## Verification

- From `app/`: `npm run typecheck`, then `npm test`, then `npm run build`.
- Code review checklist (every AC marked "Code review" above, as a checkable statement):
  - [ ] F1.AC13: `migration.sql` has a unique index on `emailKey`, and the registration path can produce only one row per normalized email.
  - [ ] F1.AC9 (deferred to F2): the trip lookup for another user's trip returns the same response as a missing trip. Recorded here, to be checked when F2 lands.
  - [ ] F1.AC11 (deferred to F2): the ownership check is inside the trip query, not a separate check after load. Recorded here, to be checked when F2 lands.
  - [ ] Migration reviewed and approved by a person before it is committed.
  - [ ] `SESSION_SECRET` is read from the environment only, with no default value, and is never logged.
  - [ ] No `console` or `print` calls added; no password, hash, session token or email appears in any log line.
  - [ ] Every Prisma query uses parameters; no query is built from strings.

## Decisions log

- 2026-11-04: Where are sessions kept? → A session table in the database, holding the SHA-256 hash of each random token. The cookie is signed with `SESSION_SECRET`. Chosen by the user. Logout deletes the row at once, and logins survive a server restart.
- 2026-11-04: Password hashing → Node's built-in `crypto.scrypt`, N=2^17, r=8, p=1, maxmem 256 MiB. No new dependency. Hash time to be recorded in F1.T2.
- 2026-11-04: Email key → `User` keeps `email` (normalized, as the spec's AC4 requires) and `emailKey` (unique, CLAUDE.md's required key column). Both hold the same normalized value.
- 2026-11-04: Registration failures, including a duplicate email, return HTTP 400 with the copy in `error`. A distinct status for a duplicate would reveal that an account exists (F1.R5).
- 2026-11-04: Failed login returns HTTP 401 with the same body for unknown and wrong passwords (F1.AC6). The spec sets no status code, so the choice is made here.
- 2026-11-04: Validation lives only in the API. The web app shows the server's `error` text, so the rules exist in one place.
- 2026-11-04: Page redirects (F1.R8, F1.R12) happen in the web app's route guard, because the server renders no pages. The API answers 401 JSON for trip requests (F1.AC17).
- 2026-11-04: The `next` path after login is accepted only as a same-site path starting with a single `/`, to stop redirects to other sites.
- 2026-11-04: F1 lands on a Trips placeholder page, which F2 replaces. The spec's "lands on Trips" needs a route to land on.
- 2026-11-04: Web routing uses `react-router`, as CLAUDE.md's stack names it. It is not yet installed in `app/web`.
- 2026-11-04: F1.AC9 and F1.AC11 cannot be proven until F2 adds trip queries. They stay in this plan as code-review items to check at F2.
- 2026-11-04: Prisma 7.10.1 needs a SQLite driver adapter. The adapter is chosen when F1.T4 runs, against the installed Prisma version.
- 2026-11-06: Adapter chosen for F1.T4: `@prisma/adapter-better-sqlite3@7.10.1` (Prisma's usual SQLite adapter for Prisma 7, constructor `new PrismaBetterSqlite3({ url })`). Added to `app/api/package.json`, so T4's Files line now lists `app/api/package.json` and `app/package-lock.json`, and the generated `migration_lock.toml`. The user approved the change on 2026-11-06.

## Sent back to the spec

None. Every behavior the tasks need is in the approved spec.
