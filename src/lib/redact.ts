// Redaction shared by the server logger (src/server/log.ts) and the error
// monitoring scrubber (src/lib/monitoring.ts), so logs and error reports follow
// the same rules. Pure: safe in the browser, the server and plain Node.

type Fields = Record<string, unknown>;

// Credentials; the fields that hold what users write (entries, AI questions
// and answers): log ids and counts instead; and, for error monitoring, the
// trace attributes that carry headers, query strings, IP addresses or user
// details (`http.request.header.*`, `url.query`, `client.address`, `user.*`).
// A safety net, not a licence: free text under any other name is only
// scrubbed for emails.
export const SENSITIVE_KEY =
  /authorization|cookie|password|passphrase|secret|token|api[-_]?key|signature|session|card|cvv|otp|description|notes?$|question|prompt|answer|body|content|\.header\.|^(?:url|http)\.(?:query|fragment)$|ip_address|client[._](?:address|ip)|peer\.(?:ip|address)|^(?:end)?user\./i;
// A real address ends in a letters-only domain; package paths in stack traces
// (vitest@5.0.5_@types+node@24…) don't, so they stay readable.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi;
// Drizzle puts the query's parameter values (user data) in its error messages.
const QUERY_PARAMS = /(params:)[^\n]*/gi;
const URL_QUERY = /(\bhttps?:\/\/[^\s?#"']+|(?<![\w/])\/[\w/[\]().-]*)\?[^\s#"']*/g;

/** Removes credentials, emails, query strings and query parameters from a log value. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return serializeError(value, depth);
  if (depth >= 4) return "[too deep]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Fields = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  return String(value);
}

/** Text with emails, URL query strings and database query parameters removed, capped at 2,000 characters. */
export function scrubText(text: string): string {
  const scrubbed = text
    .replace(QUERY_PARAMS, "$1 [redacted]")
    .replace(EMAIL, "[email]")
    .replace(URL_QUERY, "$1?[redacted]");
  return scrubbed.length > 2000 ? `${scrubbed.slice(0, 2000)}…` : scrubbed;
}

function serializeError(err: Error, depth: number): Fields {
  const out: Fields = { name: err.name, message: scrubText(err.message) };
  if ("digest" in err && typeof err.digest === "string") out.digest = err.digest;
  if ("code" in err && (typeof err.code === "string" || typeof err.code === "number")) out.code = err.code;
  if (err.stack) out.stack = scrubText(err.stack.split("\n").slice(0, 12).join("\n"));
  if (err.cause !== undefined && depth < 3) out.cause = redact(err.cause, depth + 1);
  return out;
}
