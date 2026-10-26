// Branch names: <type>/<short-description>, lowercase, words joined by hyphens
// (dots allowed for versions), e.g. feat/csv-import, deps/next-16.4.3.
// Dependabot's own branches are exempt. Run by the pre-push hook and by CI on
// pull requests:
//   node scripts/check-branch-name.mjs [name]   (default: the current branch)
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const BRANCH_TYPES = ["feat", "fix", "docs", "chore", "refactor", "test", "perf", "ci", "deps"];
const PATTERN = new RegExp(`^(${BRANCH_TYPES.join("|")})/[a-z0-9]+([.-][a-z0-9]+)*$`);

export const isValidBranchName = (name) => name.startsWith("dependabot/") || PATTERN.test(name);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const name = process.argv[2] || execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  if (!isValidBranchName(name)) {
    console.error(
      name === "main"
        ? "main is protected: work on a branch and open a pull request."
        : `Branch "${name}" doesn't follow <type>/<short-description>, e.g. fix/budget-rollover.\n` +
            `Types: ${BRANCH_TYPES.join(", ")}. Rename it with: git branch -m <new-name>`,
    );
    process.exit(1);
  }
}
