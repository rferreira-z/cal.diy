# Pull request review and approval policy

Only **simple, low-risk changes** are approved automatically: styles, docs, translations, assets and
features that do not directly touch scheduling. Everything else needs an explicit OK from the owner.

The policy is run by the `/revisar-pr` Claude Code skill (`.claude/skills/revisar-pr/SKILL.md`),
which collects evidence and applies the decision. It is enforced by the `review-policy` commit
status (`.github/workflows/review-policy.yml`), which is a required check on `main`.
The rules below are implemented in `.github/scripts/review-policy.mjs`; **that file is the source of
truth** — if this document and the script disagree, the script wins and this document is out of date.

## Risk tiers

| Tier | Examples | Outcome |
| --- | --- | --- |
| **Low** | CSS/SCSS, Tailwind classes outside critical paths, docs, i18n strings, images/assets, UI features unrelated to scheduling (settings pages, profile, onboarding, API keys UI, …) | `auto-approved` once validation and CI pass |
| **High** | Anything matching a critical path group below, or over the size limit | `needs-owner-review` until the owner adds `owner-approved` |

A PR is **low risk only if no changed file matches any high-risk group** and it is within the size
limit. It is a denylist: new areas of the codebase are low risk until added to a group.

### High-risk groups

| Group | What it protects | Main paths |
| --- | --- | --- |
| `scheduling-core` | Slots, availability, bookings, event types, booking UI | `packages/features/{slots,availability,schedules,bookings,eventtypes,calendars,busyTimes,ooo,…}`, trpc `viewer/{slots,availability,bookings,eventTypes,…}`, `apps/web/modules/{availability,bookings,schedules,event-types,d,…}`, trpc `publicViewer`/`loggedInViewer`, booking pages and `apps/web/pages/api/book/**`, embed, `packages/platform/**`, `packages/embeds/**` |
| `date-time` | Date, time zone and recurrence handling | `packages/dayjs/**`, `packages/lib` date/tz/availability modules |
| `integrations-notifications` | Calendar and video integrations, emails, SMS, webhooks, tasks, crons | `packages/app-store/*calendar*/**`, video/conferencing apps, any app `lib/{CalendarService,VideoApiAdapter,PaymentService}`, `packages/emails/**`, `packages/sms/**`, `packages/features/{webhooks,tasker,notifications}`, `apps/web/app/api/cron/**` |
| `data-api-security` | Database, public API, auth, credentials, payments | `packages/prisma/**`, `packages/kysely/**`, `apps/api/**`, `apps/web/pages/api/**`, payment apps, auth/credentials/oauth, users/membership/credits, watchlist/blocklist/bot-detection, trpc middlewares/procedures, `packages/lib/server/**` |
| `supply-chain-ci` | CI, dependencies, build/runtime config, agent instructions | `.github/**`, `**/package.json`, `yarn.lock`, `.env*`, `next.config.*`, `tsconfig*.json`, `Dockerfile*`, `CLAUDE.md`, `.claude/**` |

Rules that apply to every group:

- **Both the old and the new path** of a renamed file are checked, and deleted files count — moving
  or deleting code out of a critical path is itself high risk.
- **Size guard:** more than **20 files** or more than **400 changed lines** is high risk.
- If the file list cannot be fully listed, the PR is high risk.

## Flow

1. The author opens the PR against `main`.
2. A maintainer runs **`/revisar-pr <number>`** in Claude Code. The skill:
   1. classifies the PR with the script above;
   2. runs type-check, lint and unit tests **only for the touched workspaces**;
   3. waits for the PR's CI checks to complete;
   4. decides — `auto-approved`, `needs-owner-review` or `blocked`;
   5. posts (or updates) a **"Review policy evidence"** comment tied to the head SHA and sets labels.
3. The `review-policy` workflow re-classifies the PR independently and sets the `review-policy`
   commit status on the head SHA:
   - **success** when the evidence is for the current head SHA and policy version, its risk matches
     the gate's own classification, validation and CI passed, and either
     - risk is low and decision is `auto-approved`; or
     - risk is high, decision is `needs-owner-review`, and a maintainer added `owner-approved`
       **after** the evidence comment for the head SHA was last written;
   - **failure** otherwise, with the reason in the status description and job summary.
4. Any new push invalidates everything: the workflow removes `auto-approved` and `owner-approved`,
   the evidence no longer matches the head SHA, and `/revisar-pr` has to run again.

Auto-approval does **not** merge the PR and does not skip any other required check.

## Evidence comment

Posted by `/revisar-pr`, one per PR, edited in place on re-runs. It contains the per-file
classification, the validation commands with their exit codes, the CI checks at decision time, and
the decision. The last line is a machine-readable marker read by the gate:

```html
<!-- review-policy-evidence {"policyVersion":1,"sha":"<head sha>","risk":"low","decision":"auto-approved","validation":"pass","ci":"pass"} -->
```

Only comments by users with write, maintain or admin access are considered.

## Separation of duties

- `/revisar-pr` **never** adds `owner-approved` and never merges. The owner adds the label by hand
  in the GitHub UI after reading the evidence.
- The gate only trusts `owner-approved` when the latest `labeled` event was made by a user with
  write access.

## Known limits

- Classification is **path-based**. A Tailwind-only change inside a `.tsx` file under a critical path
  (e.g. the Booker) is still high risk. This is deliberate: path rules are predictable and hard to
  game; a diff-content heuristic is not.
- The gate verifies that evidence exists and matches, but it **trusts the validation results** the
  skill reports; it does not re-run type-check, lint or tests.
- `owner-approved` being manual is a convention: the skill runs with the owner's GitHub account, so
  the gate cannot tell a label added by hand from one added by the agent.
- The workflow runs from `main` (`pull_request_target` / `issue_comment`), so changes to the policy
  itself only take effect after they are merged.
