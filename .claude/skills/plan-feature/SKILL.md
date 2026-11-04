---
name: plan-feature
description: Turn one Approved feature spec (F<N>) in docs/specs/features/ into a build plan of small F<N>.T<k> tasks at docs/plans/, mapping every acceptance criterion to a named unit test or code review. Refuses specs that are not Approved or still have open questions. Use when the user runs /plan-feature F<N> or asks to plan, break down, or schedule a feature by its ID.
argument-hint: F<N> (e.g. F1)
model: haiku
---

# Plan a feature

Turn one Approved spec in `docs/specs/features/F<N>-<slug>.md` into a build plan at `docs/plans/F<N>-<slug>.md`, using [plan-template.md](plan-template.md) in this skill's folder.

Target feature: **$ARGUMENTS**

This skill never edits a spec or `docs/specs/product.md`. A product question goes back to the spec through `/spec-feature`.

## 1. Resolve and gate the feature

- Expect an ID like `F1` (accept `f1` or `1`). No argument → list the spec files in `docs/specs/features/` with their status and ask which one.
- No spec file for that ID → say so, and say to run `/spec-feature F<N>` first. Stop.
- The spec's `_Status:` line must read `Approved`. If it reads `Draft`, refuse, say the spec needs approval through `/spec-feature F<N>`, and stop.
- Read the spec's **Open questions** section. Any line starting with `- [ ]` is unanswered. If there is one or more, refuse, list them, and say each one must be answered through `/spec-feature F<N>`. Stop. Do not plan around an open question, and do not answer one yourself.
- `<slug>` is the spec's file name without the `.md`.

## 2. Read the context (read, don't skim)

- The whole spec: every requirement, acceptance criterion, the Test plan, Data & contract, Edge cases, Dependencies.
- `CLAUDE.md` at the repo root: stack, layout, commands, and the rules summary.
- `docs/rules/project-rules.md`: every rule applies to the plan. Especially: unit tests only, each test names its AC ID, the "code review" list for checks no unit test can prove, one transaction per multi-record write, and the logging and error rules.
- The relevant sections of `docs/specs/product.md` (the business rules the spec cites).
- The specs this one depends on (its **Dependencies** section), so the build order is right.
- Existing code under `app/` that the feature should reuse, such as the app factory, the Prisma client, or shared validators. Search before proposing new code.
- If `docs/plans/F<N>-<slug>.md` already exists, read it. See step 6.

## 3. Check the spec can be built

Before splitting tasks, check the spec gives you enough to build. It is not enough if a step needs a behavior, limit, wording, or edge-case answer the spec doesn't contain.

- **Product question** (changes what the user sees, a rule, a limit, copy, or scope): do not decide it. Add it to **Sent back to the spec**, and leave out the tasks that depend on it. Finish everything that doesn't.
- **Technical choice** (a library, file layout, algorithm, index, or how a test double is built): decide it, following CLAUDE.md and the stack. Record it in the Decisions log with the reason. Ask the user with **AskUserQuestion** only when the choice changes behavior or cost, and then give 2–4 options with trade-offs.
- A spec requirement that CLAUDE.md or project rules forbid, or that conflicts with `product.md`: stop that part and report it. Do not work around it.

## 4. Split the work into tasks

- Task IDs are `F<N>.T<k>`, numbered from `T1`. Each task is one commit, and its commit message starts with its ID, for example `F1.T2 add password validator`. The task-reminder hook depends on this format.
- Keep each task small: one concern, usually one to three source files and their test files. A task that needs more than one screen of description is too big. Split it.
- Order the tasks by layer: pure rules first (validators, calculations, state logic, tested with fakes), then the database layer (Prisma schema, migrations, queries), then the HTTP routes, then the web screens. Put a task's dependencies before it.
- For each task give:
  - **Files:** exact paths under `app/`.
  - **Depends on:** earlier task IDs, or `none`.
  - **Work:** 2 to 4 bullets.
  - **Done when:** one checkable result, such as a named test passing, `npm run typecheck` clean, or a stated code-review item. "Implemented" is not a done-when check.
  - **Covers:** the requirement and AC IDs this task delivers.

## 5. Map every acceptance criterion

- Every `F<N>.AC<n>` in the spec appears in the AC map, exactly once as a row.
- Each row is either **named unit tests** (test name(s) that include the full AC ID, for example `F3.AC4 rejects a duplicate name ignoring capitals`, and the file they sit in) or **code review** (the reviewer check, written as a checkable statement).
- Use the spec's Test plan as the starting point. Do not invent a test type the project rules don't allow. Anything that needs a real database, network, or running app goes to **code review**.
- Coverage check before you write: count the ACs in the spec and the rows in the map. They must match, and every requirement (`F<N>.R<n>`) must be covered by at least one task. If not, fix the plan, not the spec.

## 6. Write the plan

- Create or update `docs/plans/F<N>-<slug>.md` from [plan-template.md](plan-template.md). Save it as `Draft`.
- If the plan already exists: keep its Decisions log. Do not renumber a task that already has a commit. Check with `git log --oneline --grep="F<N>.T"`. New tasks go at the end, with the next number. If the spec changed since the plan was last written, update the tasks it affects and note the change in the Decisions log.
- Never edit the spec, `product.md`, or any file in `docs/specs/`.

## 7. Finish

- Reply with: the plan path, the number of tasks, the number of ACs and how many are unit tests versus code review, every requirement covered, and any items sent back to the spec.
- If anything was sent back, say the feature is not ready to build until those items are answered, and give the command: `/spec-feature F<N>`.
- **Approval:** the plan is saved as `Draft`. Ask the user whether to approve it. Set `_Status: Approved` (and today's date) only when the user explicitly says yes, in this run or later. Never approve a plan on your own.
- `/implement-feature` (Week 2) only runs on Approved plans.
