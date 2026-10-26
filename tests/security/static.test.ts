// Rules about the source code itself, checked on every file so a new one can't
// quietly break them. Each rule names the threat it guards against.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../..", import.meta.url).pathname;
const files: string[] = [];
(function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f)) files.push(relative(ROOT, p));
  }
})(join(ROOT, "src"));
const source = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** The code without comments (a comment may mention eval() or redirect() harmlessly). */
const code = (f: string) =>
  source(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
const directive = (f: string) =>
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["'](use client|use server)["']/.exec(source(f))?.[1];
const imports = (f: string) =>
  [...source(f).matchAll(/^\s*import\s+(?!type\b)[^"']*?["']([^"']+)["']/gm)].map((m) => m[1]);

describe("server actions", () => {
  it("are all files in src/server/actions, so the access-control sweep covers every one", () => {
    // An inline "use server" inside a component would create an endpoint the sweep never sees.
    const withDirective = files.filter((f) => /["']use server["']/.test(code(f)));
    expect(withDirective.filter((f) => !f.startsWith("src/server/actions/") || directive(f) !== "use server")).toEqual(
      [],
    );
  });
});

describe("client code", () => {
  const clientFiles = files.filter((f) => directive(f) === "use client");

  it("never imports server-only code, the database or secrets", () => {
    // Server actions are the one server import a client may make (they become RPC stubs).
    const forbidden =
      /^(@\/server\/(?!actions\/)|@\/env$|server-only$|pg$|drizzle-orm|node:|better-auth$|@ai-sdk\/|ai$)/;
    const bad = clientFiles.flatMap((f) =>
      imports(f)
        .filter((i) => forbidden.test(i))
        .map((i) => `${f} imports ${i}`),
    );
    expect(clientFiles.length).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  });

  it("reads no environment settings except public ones", () => {
    // Only NEXT_PUBLIC_ values are inlined into the browser bundle; anything else is a mistake.
    const bad = clientFiles.flatMap((f) =>
      [...code(f).matchAll(/process\.env\.(\w+)/g)]
        .map((m) => m[1])
        .filter((k) => !/^NEXT_PUBLIC_|^NODE_ENV$/.test(k))
        .map((k) => `${f}: ${k}`),
    );
    expect(bad).toEqual([]);
  });

  it("uses only the public settings meant to be public", () => {
    // The app name, Sentry's DSN (public by design: it only lets a browser send
    // events) and the environment name Vercel sets. Anything else would be a leak.
    const names = new Set(files.flatMap((f) => [...source(f).matchAll(/\bNEXT_PUBLIC_\w+/g)].map((m) => m[0])));
    expect([...names].sort()).toEqual(["NEXT_PUBLIC_APP_NAME", "NEXT_PUBLIC_SENTRY_DSN", "NEXT_PUBLIC_VERCEL_ENV"]);
  });
});

describe("pages", () => {
  const pages = files.filter((f) => f.startsWith("src/app/") && f.endsWith("/page.tsx"));
  const routeOf = (f: string) =>
    `/${f
      .replace(/^src\/app\/|\/?page\.tsx$/g, "")
      .replace(/\([^)]+\)\/?/g, "")
      .replace(/\/$/, "")}`;
  const proxyPublic = [
    ...(/PUBLIC_PATHS = new Set\(\[([^\]]*)\]/.exec(source("src/proxy.ts"))?.[1] ?? "").matchAll(/"([^"]+)"/g),
  ].map((m) => m[1]);

  it("each check the session on the server, except the public ones the proxy lets through", () => {
    // The proxy's cookie check is only optimistic; the page itself must call requireUser().
    const open = pages
      .filter((f) => !/\brequire(User|Admin)\(/.test(code(f)))
      .map(routeOf)
      .sort();
    expect(open).toEqual([...proxyPublic].sort());
  });
});

describe("redirects and navigation", () => {
  it("only ever go to a fixed path on this site (no open redirects)", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const m of code(f).matchAll(/\b(redirect|router\.(?:push|replace))\(\s*([^,)]+)/g)) {
        const target = m[2].trim();
        const fixed = /^["'`]\//.test(target) || /^`\$\{pathname\}/.test(target) || /^new URL\(["']\//.test(target);
        if (!fixed) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("HTML and code injection", () => {
  it("renders raw HTML in one place only: the static theme script", () => {
    const raw = files.filter((f) =>
      /dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML/.test(code(f)),
    );
    expect(raw).toEqual(["src/app/layout.tsx"]);
    expect(source("src/app/layout.tsx")).toMatch(/dangerouslySetInnerHTML=\{\{ __html: themeInitScript \}\}/);
  });

  it("never evaluates strings as code", () => {
    expect(files.filter((f) => /\beval\(|new Function\(/.test(code(f)))).toEqual([]);
  });

  it("builds raw SQL only in the two reviewed places, from fixed text", () => {
    // Drizzle parameterises everything else; sql.raw() would not.
    expect(files.filter((f) => code(f).includes("sql.raw(")).sort()).toEqual([
      "src/server/services/recurring.ts",
      "src/server/services/wallets.ts",
    ]);
  });
});
