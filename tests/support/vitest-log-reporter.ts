import { writeFileSync } from "node:fs";
import type { Reporter, SerializedError, TestModule, TestRunEndReason } from "vitest/node";

// Writes a clean copy of the results to a log file, alongside Vitest's normal
// live output in the terminal (reporters: ["default", this]). A full run
// (pnpm test) writes test-unit.log; a run of one folder writes its own, e.g.
// pnpm test:integration → test-integration.log, so it never overwrites the full run's.

const folders = new Set(
  process.argv
    .slice(2)
    .flatMap((a) => /^(?:\.\/)?tests\/(unit|db|integration|component|security)\b/.exec(a)?.[1] ?? []),
);
const LOG = `test-${folders.size === 1 ? [...folders][0] : "unit"}.log`;
const time = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);
const counts = (c: { passed: number; failed: number; skipped: number }, total: number) =>
  [c.failed && `${c.failed} failed`, c.skipped && `${c.skipped} skipped`, `${c.passed} passed`]
    .filter(Boolean)
    .join(" | ") + ` (${total})`;

export default class LogReporter implements Reporter {
  private started = 0;

  onTestRunStart() {
    this.started = Date.now();
  }

  onTestRunEnd(
    modules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason,
  ) {
    const lines = [`$ vitest ${process.argv.slice(2).join(" ")}  (${new Date().toISOString()})`, ""];
    const files = { passed: 0, failed: 0, skipped: 0 };
    const tests = { passed: 0, failed: 0, skipped: 0 };
    const failures: string[] = [];

    for (const mod of [...modules].sort((a, b) => a.relativeModuleId.localeCompare(b.relativeModuleId))) {
      const cases = [...mod.children.allTests()];
      let failedHere = 0;
      for (const test of cases) {
        const result = test.result();
        if (result.state === "failed") {
          failedHere++;
          tests.failed++;
          const errors = result.errors.map((e) => (e.stack ?? e.message).replace(/^/gm, "      ")).join("\n");
          failures.push(`  ✘ ${mod.relativeModuleId} > ${test.fullName}\n${errors}`);
        } else if (result.state === "passed") tests.passed++;
        else tests.skipped++;
      }
      const ok = failedHere === 0 && mod.ok();
      if (cases.length === 0) files.skipped++;
      else if (ok) files.passed++;
      else files.failed++;
      lines.push(
        ` ${ok ? "✓" : "✘"} ${mod.relativeModuleId} (${cases.length} test${cases.length === 1 ? "" : "s"}) ${time(mod.diagnostic().duration)}`,
      );
    }

    if (failures.length) lines.push("", "Failed tests:", ...failures);
    if (unhandledErrors.length) {
      lines.push("", "Unhandled errors:", ...unhandledErrors.map((e) => `  ${e.stack ?? e.message}`));
    }
    lines.push(
      "",
      ` Test Files  ${counts(files, modules.length)}`,
      `      Tests  ${counts(tests, tests.passed + tests.failed + tests.skipped)}`,
      `   Duration  ${time(Date.now() - this.started)}`,
      "",
      `[exit ${reason === "passed" && unhandledErrors.length === 0 ? 0 : 1}]`,
      "",
    );
    writeFileSync(LOG, lines.join("\n"));
  }
}
