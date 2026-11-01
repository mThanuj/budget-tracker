// The local workflow checks: branch names (also enforced in CI on pull
// requests) and the git hooks that pnpm install sets up.
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidBranchName } from "../../scripts/check-branch-name.mjs";
import { migrationTarget } from "../../scripts/vercel-build.mjs";

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

  it("allow pushing to staging, and only that exact name (D-037)", () => {
    expect(isValidBranchName("staging")).toBe(true);
    for (const name of ["staging2", "Staging", "staging/x", "my-staging"])
      expect(isValidBranchName(name), name).toBe(false);
    expect(isValidBranchName("feat/staging-branch")).toBe(true); // an ordinary branch name
  });
});

describe("migrations on Vercel deploys (scripts/vercel-build.mjs)", () => {
  it("run for production, and for the staging branch's previews only", () => {
    expect(migrationTarget({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toBe("production");
    expect(migrationTarget({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" })).toBe("staging");
  });

  it("never for other previews (they have no database settings) or local builds", () => {
    for (const env of [
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/csv-import" },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dependabot/npm_and_yarn/next-16.4.3" },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging2" },
      { VERCEL_ENV: "development", VERCEL_GIT_COMMIT_REF: "staging" },
      { VERCEL_GIT_COMMIT_REF: "staging" },
      {},
    ])
      expect(migrationTarget(env), JSON.stringify(env)).toBeNull();
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
