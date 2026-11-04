# F<N> plan — <Feature name>

_Status: Draft · Spec: `docs/specs/features/F<N>-<slug>.md` (Approved) · Last updated: <YYYY-MM-DD>_

## Approach
2 to 4 sentences: what gets built, which layers change (rules, database, routes, screens), and any technical choice made here (see Decisions log).

## Tasks
Each task is one commit. Its commit message starts with its ID, for example `F<N>.T1 <short title>`.

### F<N>.T1 — <title>
- **Files:** `app/…`, `app/….test.ts`
- **Depends on:** none
- **Work:**
  - …
- **Done when:** …
- **Covers:** F<N>.R…, F<N>.AC…

### F<N>.T2 — <title>
- **Files:** …
- **Depends on:** F<N>.T1
- **Work:**
  - …
- **Done when:** …
- **Covers:** …

## Acceptance criteria map
Every AC in the spec appears once.

| AC | How it is checked | Test name(s) or review item | File |
|---|---|---|---|
| F<N>.AC1 | Unit test | `F<N>.AC1 …` | `app/….test.ts` |
| F<N>.AC2 | Code review | Ownership check is part of the database query | — |

## Build order
1. F<N>.T1 — …
2. F<N>.T2 — … (after T1)

Cross-feature dependencies: <from the spec's Dependencies section, or "none">.

## Verification
- From `app/`: `npm run typecheck`, then `npm test`.
- Code review checklist (every AC marked "Code review" above, as a checkable statement):
  - [ ] …

## Decisions log
- <YYYY-MM-DD>: <technical decision> → <what was chosen, and why in one line>

## Sent back to the spec
Product questions found while planning. Leave the dependent tasks out until these are answered through `/spec-feature F<N>`.
- [ ] …
