import { createWriteStream, type WriteStream } from "node:fs";
import { relative } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from "@playwright/test/reporter";

// Writes the run to a log file (test-e2e.log) while Playwright's own "list"
// reporter stays live in the terminal. In the log, tests are numbered by their
// place in the suite (project, file, position in the file), so a number means
// the same test on every run, and they're always in number order: a test that
// finishes early waits until every lower number has been written.

type Done = { test: TestCase; result: TestResult };

const MARK: Record<TestResult["status"], string> = {
  passed: "✓",
  failed: "✘",
  timedOut: "✘",
  interrupted: "✘",
  skipped: "-",
};

// In a terminal Playwright colours its error messages; the log gets plain text.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const plain = (text: string) => text.replace(ANSI, "");

const time = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60_000).toFixed(1)}m`;

export default class OrderedList implements Reporter {
  private out: WriteStream;
  private ids = new Map<TestCase, number>();
  private done = new Map<number, Done>();
  private next = 1;
  private failures: Done[] = [];
  private root: Suite | undefined;
  private projectOf = (test: TestCase) => test.parent.project()?.name ?? "";

  constructor({ outputFile = "test-e2e.log" }: { outputFile?: string } = {}) {
    this.out = createWriteStream(outputFile); // replaces the previous run's log
  }

  private log(line = "") {
    this.out.write(`${plain(line)}\n`);
  }

  printsToStdio() {
    return false; // the terminal is the "list" reporter's
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.log(`$ playwright ${process.argv.slice(2).join(" ")}  (${new Date().toISOString()})`);
    this.root = suite;
    const tests = suite.allTests();
    tests.forEach((test, i) => this.ids.set(test, i + 1));
    const total = tests.length;
    this.log(`\nRunning ${total} tests using ${config.workers} worker${config.workers === 1 ? "" : "s"}\n`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const willRetry = result.status !== "passed" && result.status !== "skipped" && result.retry < test.retries;
    if (willRetry) return;
    const id = this.ids.get(test);
    if (id === undefined) return;
    this.done.set(id, { test, result });
    this.flush();
  }

  onStdErr(chunk: string | Buffer) {
    this.out.write(plain(chunk.toString()));
  }

  onError(error: TestError) {
    this.log(`\nError: ${error.message ?? error.value ?? "unknown error"}`);
  }

  async onEnd(result: FullResult) {
    // Anything still held (e.g. a run that was interrupted) prints now, in order.
    for (const id of [...this.done.keys()].sort((a, b) => a - b)) if (id >= this.next) this.print(id);

    this.failures.forEach((f, i) => this.printFailure(i + 1, f));

    const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
    for (const test of this.root?.allTests() ?? []) {
      const outcome = test.outcome();
      if (outcome === "expected") counts.passed++;
      else if (outcome === "unexpected") counts.failed++;
      else if (outcome === "flaky") counts.flaky++;
      else counts.skipped++;
    }
    this.log("");
    if (counts.failed) this.log(`  ${counts.failed} failed`);
    if (counts.flaky) this.log(`  ${counts.flaky} flaky`);
    if (counts.skipped) this.log(`  ${counts.skipped} skipped`);
    this.log(`  ${counts.passed} passed (${time(result.duration)})`);
    const exit = result.status === "passed" ? 0 : result.status === "interrupted" ? 130 : 1;
    this.log(`\n[exit ${exit}]`);
    await new Promise<void>((resolve) => this.out.end(resolve));
  }

  private flush() {
    while (this.done.has(this.next)) {
      this.print(this.next);
      this.next++;
    }
  }

  private print(id: number) {
    const entry = this.done.get(id);
    if (!entry) return;
    const { test, result } = entry;
    const where = `${relative(process.cwd(), test.location.file)}:${test.location.line}:${test.location.column}`;
    const took = result.status === "skipped" ? "" : ` (${time(result.duration)})`;
    this.log(
      `  ${MARK[result.status]} ${String(id).padStart(3)} [${this.projectOf(test)}] › ${where} › ${test.title}${took}`,
    );
    if (result.status !== "passed" && result.status !== "skipped") this.failures.push(entry);
  }

  private printFailure(n: number, { test, result }: Done) {
    const where = `${relative(process.cwd(), test.location.file)}:${test.location.line}:${test.location.column}`;
    this.log(`\n  ${n}) [${this.projectOf(test)}] › ${where} › ${test.title}\n`);
    if (result.status === "timedOut") this.log(`    Test timeout of ${test.timeout}ms exceeded.\n`);
    for (const error of result.errors) {
      const text = [
        error.message ?? String(error.value ?? ""),
        error.snippet,
        error.location && `at ${error.location.file}:${error.location.line}:${error.location.column}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      this.log(text.replace(/^/gm, "    "));
    }
    for (const a of result.attachments) {
      if (a.path) this.log(`\n    attachment: ${a.name} (${a.contentType}) ${relative(process.cwd(), a.path)}`);
    }
  }
}
