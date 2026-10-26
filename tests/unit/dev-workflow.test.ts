// The local workflow checks: branch names (also enforced in CI on pull
// requests) and the git hooks that pnpm install sets up.
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidBranchName } from "../../scripts/check-branch-name.mjs";

describe("branch names", () => {
  it("are <type>/<short-description>, lowercase with hyphens", () => {
    for (const name of ["feat/csv-import", "fix/budget-rollover", "docs/protected-main", "deps/next-16.4.3"])
      expect(isValidBranchName(name), name).toBe(true);
    for (const name of ["main", "MyBranch", "feature/x", "fix/Budget", "fix/", "fix/two--hyphens", "fix/a_b"])
      expect(isValidBranchName(name), name).toBe(false);
  });

  it("leave Dependabot's own branches alone", () => {
    expect(isValidBranchName("dependabot/npm_and_yarn/next-16.4.3")).toBe(true);
  });
});

describe("git hooks", () => {
  it("are executable and installed by pnpm install", () => {
    for (const hook of ["pre-commit", "pre-push", "post-merge"])
      expect(statSync(new URL(`../../.githooks/${hook}`, import.meta.url)).mode & 0o111, hook).not.toBe(0);
    const { scripts } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(scripts.prepare).toContain("git config core.hooksPath .githooks");
  });
});
