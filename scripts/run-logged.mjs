// Runs a command, streams its output to the terminal AND writes a clean copy
// to a log file, then exits with the command's real code (a plain `| tee`
// would hide failures). Usage: node scripts/run-logged.mjs <logfile> <command...>
//
// Colour codes are stripped from the log rather than switched off with
// NO_COLOR: Playwright forces FORCE_COLOR=1 in its workers, and Node warns
// whenever both are set.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

const [logFile, ...cmd] = process.argv.slice(2);
if (!logFile || cmd.length === 0) {
  console.error("usage: run-logged <logfile> <command...>");
  process.exit(2);
}

const log = createWriteStream(logFile); // truncates any previous run
log.write(`$ ${cmd.join(" ")}  (${new Date().toISOString()})\n`);

// CSI (colours, cursor moves) and OSC (links, titles) escape sequences.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// A sequence cut off at the end of a chunk is held back until the next one.
const PARTIAL = /\x1b(?:\[[0-9;?]*[ -/]*|\][^\x07\x1b]*)?$/;

function logWriter() {
  let carry = "";
  return {
    write(chunk) {
      let text = carry + chunk.toString("utf8");
      const cut = text.match(PARTIAL);
      carry = cut ? cut[0] : "";
      if (cut) text = text.slice(0, -cut[0].length);
      log.write(text.replace(ANSI, ""));
    },
    flush() {
      if (carry) log.write(carry.replace(ANSI, ""));
      carry = "";
    },
  };
}

const child = spawn(cmd.join(" "), { shell: true, env: process.env });
const out = logWriter();
const err = logWriter();
child.stdout.on("data", (d) => { process.stdout.write(d); out.write(d); });
child.stderr.on("data", (d) => { process.stderr.write(d); err.write(d); });
child.on("close", (code) => {
  out.flush();
  err.flush();
  log.end(`\n[exit ${code ?? 0}]\n`, () => process.exit(code ?? 0));
});
