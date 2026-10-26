# Project memory

The long-term memory of this repository: what was decided and why, the rules
the code must keep, and what's still open. It's plain Markdown in git, so any
person or coding agent can use it, and it changes in the same commits as the
code. Nothing here depends on an AI tool's private memory.

## What's here

| File                                               | Read it when                                                                           | Holds                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [architecture.md](architecture.md)                 | any non-trivial change                                                                 | layers, request flow, conventions, API surface, data model, feature map |
| [business-rules.md](business-rules.md)             | changing behaviour or data                                                             | rules the code enforces, with where                                     |
| [design-decisions.md](design-decisions.md)         | changing structure, tools or a pattern                                                 | decisions with status, dates, reasons, alternatives                     |
| [implementation-notes.md](implementation-notes.md) | something behaves oddly; before using Next.js, React, Better Auth, AI or Razorpay APIs | gotchas and workarounds                                                 |
| [known-issues.md](known-issues.md)                 | planning work, or before reporting a "new" problem                                     | confirmed open issues and debt                                          |
| [roadmap.md](roadmap.md)                           | proposing a larger change                                                              | approved and proposed future work                                       |
| [changelog.md](changelog.md)                       | catching up on recent changes                                                          | significant changes, newest first                                       |

Elsewhere, kept current and not repeated here: [docs/TESTING.md](../TESTING.md)
(test suites), [docs/DESIGN.md](../DESIGN.md) (UI rules),
[docs/DEPLOY.md](../DEPLOY.md) and [docs/RESTORE.md](../RESTORE.md) (operations),
[SECURITY.md](../../SECURITY.md) (security model), the [README](../../README.md)
(setup and scripts).

## Before a task

1. Small, isolated change: read the row above that matches, then the code.
2. Anything larger: read `architecture.md`, then the files the table points to
   for your area (business rules for behaviour, decisions for structure).
3. Check what you read against the code. The memory can be out of date or
   incomplete; the code, tests and config are what actually runs.
4. If your plan conflicts with a decision or rule, follow the decision, or say
   so and ask before going against it.

## After a task: the memory review

Ask, and update the matching file in the same change if the answer is yes:

1. New or changed decision (structure, tool, pattern)? → `design-decisions.md`
2. Changed a business rule or invariant? → `business-rules.md` (needs the owner's approval)
3. Found or introduced a workaround, gotcha or limitation? → `implementation-notes.md`
4. Fixed or found a known issue? → `known-issues.md`
5. Is something here now wrong? → correct it
6. Significant change? → one line in `changelog.md`, newest first

Then say in your report what you updated, or "memory review: no durable changes".
Trivial changes (a typo, a style fix) don't need any of this.

## Rules for writing here

- Facts only, checked against the code, with the path where it's enforced.
  Mark anything else: **proposed** (not approved), **unverified** (believed,
  not checked), **open question**.
- Never invent history. If the reason for a past choice isn't recorded, write
  "Rationale: not recorded".
- One place per fact: link instead of copying; link to source files instead of
  pasting code. A value quoted for readability (a limit, a price) names its
  source file, and the source wins if they differ. Keep each file short enough
  to read in one go.
- Decisions are never deleted: mark them superseded and add the new one
  (template at the top of `design-decisions.md`).
- If the memory and the code disagree, don't silently change either: note the
  difference, work out which is wrong, and fix that one (code changes to
  approved behaviour need the owner).
- No secrets, credentials, personal data or production data, ever.
