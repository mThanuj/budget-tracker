// Runs a command, streams its output to the terminal AND writes a clean
// (color-free) copy to a log file, then exits with the command's real code.
// Usage: node scripts/run-logged.mjs <logfile> <command...>
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

const [logFile, ...cmd] = process.argv.slice(2);
if (!logFile || cmd.length === 0) {
  console.error("usage: run-logged <logfile> <command...>");
  process.exit(2);
}

const log = createWriteStream(logFile); // truncates any previous run
log.write(`$ ${cmd.join(" ")}  (${new Date().toISOString()})\n`);

// FORCE_COLOR=0 keeps ANSI escapes out of the log so it's easy to read back.
const child = spawn(cmd.join(" "), { shell: true, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
const pipe = (from, to) => from.on("data", (d) => { to.write(d); log.write(d); });
pipe(child.stdout, process.stdout);
pipe(child.stderr, process.stderr);
child.on("close", (code) => log.end(`\n[exit ${code ?? 0}]\n`, () => process.exit(code ?? 0)));
