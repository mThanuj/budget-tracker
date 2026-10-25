# Claude Code

@AGENTS.md

## Claude Code specifics

Everything above is shared with other agents; this adds only what's specific
to Claude Code.

- **Skills:** the workflows in `.claude/skills/` (`add-server-action`,
  `change-schema`, `fix-bug`, `review-changes`) are project skills. Invoke one by
  name, or follow it when the task matches its description.
- **Permissions:** `.claude/settings.json` blocks reading `.env` files with
  real values and asks before `git push`, merging PRs, `pnpm db:migrate`, the
  Vercel CLI and commands that spend real AI quota. If a command is denied or
  declined, don't look for another way to run it; ask the owner. These rules
  prevent accidents; they aren't a security boundary.
- **Memory:** durable project knowledge goes in `docs/project-memory/` (in
  git, visible to every agent), not in Claude's per-user memory. Use that only
  for the owner's personal preferences.
- **Large output:** read the `test-<suite>.log` files rather than long terminal
  output, and use a subagent for broad searches across many files.
