// Keeps the docs that people and coding agents rely on in step with the repo:
// fails if a Markdown link doesn't resolve (including #anchors in other docs),
// a repo path in backticks doesn't exist, or a `pnpm <script>` isn't defined.
//   pnpm docs:check
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const roots = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "SECURITY.md",
  "docs",
  ".claude/skills",
  ".github/pull_request_template.md",
];
const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (p.endsWith(".md")) files.push(p);
};
for (const r of roots) if (existsSync(r)) walk(r);

const scripts = new Set(Object.keys(JSON.parse(readFileSync("package.json", "utf8")).scripts));
// pnpm's own commands and package binaries the docs may name.
const builtins = new Set([
  "install",
  "add",
  "exec",
  "dlx",
  "why",
  "audit",
  "outdated",
  "dedupe",
  "list",
  "vitest",
  "prettier",
  "eslint",
  "tsc",
  "next",
  "drizzle-kit",
]);
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
const anchors = (file) =>
  new Set([...readFileSync(file, "utf8").matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1].replace(/`/g, ""))));
// Generated output (screenshots, reports, logs) is gitignored and only exists after a run.
// Folder-only rules ("dir/") match a missing path only when it ends in "/".
const gitIgnored = (path) =>
  [path, `${path}/`].some((p) => {
    try {
      execFileSync("git", ["check-ignore", "-q", p]);
      return true;
    } catch {
      return false;
    }
  });
const pathRoots = /^(src|tests|scripts|docs|drizzle|\.github|\.claude)\//;
const rootFiles =
  /^(AGENTS|CLAUDE|README|SECURITY)\.md$|^(next|drizzle|playwright)\.config\.ts$|^(vitest\.config\.mts|vercel\.json|package\.json|pnpm-lock\.yaml|\.env\.example|\.nvmrc|Dockerfile|eslint\.config\.mjs|\.prettierrc\.json|\.mcp\.json)$/;

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const where = (i) => `${file}:${text.slice(0, i).split("\n").length}`;

  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [path, anchor] = target.split("#");
    const resolved = path ? normalize(join(dirname(file), path)) : file;
    if (!existsSync(resolved)) problems.push(`${where(m.index)} link to missing ${target}`);
    else if (anchor && resolved.endsWith(".md") && !anchors(resolved).has(anchor))
      problems.push(`${where(m.index)} link to missing heading #${anchor} in ${resolved}`);
  }

  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const code = m[1].trim();
    for (const cmd of code.matchAll(/(?:^|\s)pnpm\s+([a-z][\w:-]*\*?)/g)) {
      const name = cmd[1];
      // `pnpm db:*` names a family of scripts: at least one must exist.
      const known = name.endsWith("*")
        ? [...scripts].some((s) => s.startsWith(name.slice(0, -1)))
        : scripts.has(name) || builtins.has(name);
      if (!known) problems.push(`${where(m.index)} unknown command pnpm ${name}`);
    }
    const path = code.replace(/[.,:;]+$/, "");
    if (/\s/.test(path) || /[<>{}]/.test(path)) continue; // commands, placeholders
    if (!pathRoots.test(path) && !rootFiles.test(path)) continue;
    const concrete = path.split("*")[0].replace(/\/$/, "") || ".";
    if (!existsSync(concrete) && !gitIgnored(concrete)) problems.push(`${where(m.index)} missing path ${path}`);
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s) in the docs:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`docs check: ${files.length} files, links, paths and commands all resolve`);
