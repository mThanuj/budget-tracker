# Where this skill comes from

Copied unchanged from the Next.js repository at the tag matching the installed
version: https://github.com/vercel/next.js/tree/v16.4.2/skills/next-bundle-optimizer
(files `SKILL.md`, `references/fix-patterns.md`, `references/graph-methods.md`).
Reviewed on 2026-10-25: it reads the build's bundle data and source, writes only
analysis files to `/tmp`, installs nothing, and changes app code only when
asked for "fix" mode. It mentions three other Next.js skills
(`next-cache-components-optimizer`, `next-partial-prefetching-optimizer`,
`next-dev-loop`) that aren't installed here; it works without them.

To update it: when `next` is upgraded, copy the same folder from the new
version's tag, read the diff, and update this note. Prettier is told to leave
these files alone (`.prettierignore`) so they stay identical to upstream.
