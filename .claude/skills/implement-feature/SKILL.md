---
name: implement-feature
description: Builds the next task of an Approved plan (F<N>) with the developer agent. Picks the next uncommitted F<N>.T<k> from the plan's Build order, hands only that task to the developer agent, reruns its tests, and commits after the user approves. Refuses unless the plan is Approved, the branch is not main, and the tree is clean. Use when the user runs /implement-feature F<N> or asks to build, implement, or continue a feature by its ID.
argument-hint: F<N> (e.g. F5)
model: haiku
---

# Implement the next task of a feature

Build one task at a time from an Approved plan in `docs/plans/F<N>-<slug>.md`, one commit per task. The developer agent writes the code. This skill checks the work, asks the user, and makes the commit.

Target feature: **$ARGUMENTS**

This skill never pushes. It never edits a spec, a plan, or `product.md`.

## 1. Resolve and gate

- Expect an ID like `F5` (accept `f5` or `5`). No argument → list the plan files in `docs/plans/` with their status and ask which one. Stop.
- Find the plan with `docs/plans/F<N>-*.md`. No plan file → say so and say to run `/plan-feature F<N>` first. Stop.
- Line 3 of the plan must read `_Status: Approved`. Otherwise refuse, say the plan must be approved through `/plan-feature F<N>`, and stop.
- `git branch --show-current` must not be `main`. On `main`, refuse and say to switch to the feature branch (for example `F5-balances` or `week-2`) first. Stop.
- `git status --porcelain -- . ':!docs/activities-outputs/session-logs/'` must print nothing. The session-logs folder is excluded on purpose: its files are never committed and are left untracked. Any other uncommitted change → refuse, list the files, and stop. Do not stash or discard anything.

## 2. Pick the next task

- Read the plan's **Build order** list, in order. Each item names a task ID, `F<N>.T<k>`.
- A task is done when a commit subject starts with its ID. Check with `git log --format=%s` and match the subject against `^F<N>\.T<k>\b`. The `\b` lets both `F5.T1: title` and `F5.T1 title` count.
- The next task is the first Build order item with no such commit.
- If every task has a commit, say "All F<N> tasks are committed." Stop.
- Check the next task's **Depends on** line. Every task ID it names from this plan must already have a commit. If one does not, stop and say which one is missing. Cross-feature dependencies (for example `F4.T5`) are not checked here, but the plan says those features must be built first. Mention that.
- Extract the task section: from its `### F<N>.T<k> — <title>` heading to the next `###` or `##` heading. This is the task's full text.
- Extract the ACs the task covers: take the IDs `F<N>.AC<n>` from the task's **Covers** line, and copy each matching `- **F<N>.AC<n>** …` line from the spec in `docs/specs/features/F<N>-<slug>.md`. Copy the spec text, not the plan's test names.

## 3. Run the developer agent

Call the Agent tool with `subagent_type: "developer"`. The brief has these parts and nothing else:

- The task's full text, copied from the plan.
- The AC texts, copied from the spec.
- The spec path and the plan path, so the agent can read more if it needs to. Do not paste the whole plan or the whole spec.
- The reminder: build this task only, do not commit, end with the report block.

## 4. Check the work yourself

- Read the agent's report: its **Status**, its file lists, its **Problems**.
- Rerun the task's tests yourself. Do not trust the report's test claims. From `app/`:
  - `npm test -w api` if the task's files are all under `app/api/`
  - `npm test -w web` if they are all under `app/web/`
  - `npm test` if they span both
  - Then `npm run typecheck`.
- Compare `git status --porcelain -- . ':!docs/activities-outputs/session-logs/'` with the task's **Files** line. Any changed or new file outside that list is a problem. Show it.
- Show the user the agent's report and the test results (the command and its pass or fail summary).

## 5. Retry rule

- A run is good when the report says **Done**, the tests pass, and no file is outside the task's list.
- Otherwise, if the report says **Blocked** or **Partial**, the tests fail, or a file is outside the list, run the developer agent once more. Use a fresh Agent call with the same brief, plus the previous report and the failing test output or the outside file list. Then rerun the tests as in step 4.
- At most two agent runs per task in one invocation of this skill. If the second run is still not good, stop. Do not commit. Tell the user what is wrong: the report's **Problems**, the failing test name and message, or the outside file. Say that the plan task (`F<N>.T<k>` in `docs/plans/F<N>-<slug>.md`) probably needs clarifying, and that they should clarify it and run `/implement-feature F<N>` again.
- Leave any files the agent wrote in place. Do not revert them without asking.

## 6. Ask for approval

- List the files to review. These are the agent's **Files for human review** entries. Authentication, secrets and `.env` files, database migrations, CI and deployment config, and deleting or disabling a test always need a person to read them. Name each file and its reason.
- Show the full list of changed files (from `git status --porcelain`) and mark the ones on the human-review list.
- Ask: "Approve these files and commit as `F<N>.T<k>: <title>`?" Then stop and wait for the answer. Do not commit before a yes.
- If the user says no or asks for changes, do not commit. Take their changes as a new brief for the developer agent, within the two-run limit for this invocation. If they ask for more work than that, stop and say so.

## 7. Commit after a yes

- Stage each file by its path, with `git add -- <path>`, for every changed or new file in the task's **Files** list. Never use `git add -A`, `git add .`, or `git commit -a`.
- Run `git diff --cached --name-only`. It must list only the files you staged. If it lists anything else, unstage it with `git restore --staged -- <path>` and say so.
- Commit with the subject `F<N>.T<k>: <title>`, where `<title>` is the task's title from its heading, and this trailer:

```
git commit -m "F<N>.T<k>: <title>" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

- Never push. Do not run `git push` or any command that sends commits to a remote.
- Show the commit hash and subject with `git log -1 --oneline`.

## 8. Finish

- Say which task is committed and which is next in the Build order. If none is left, say the feature's tasks are all committed.
- Remind the user to run `/clear` before the next task. A new session picks up from the commit history.
- Mention any cross-feature dependencies from step 2 that the plan still needs met.
