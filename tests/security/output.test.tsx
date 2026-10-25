// AI text is attacker-influenced: a model can be steered by what people type
// (descriptions, notes, questions) into answering with markup or links. The
// chat answer and the insights report must show it as plain text, never as
// HTML, links or scripts.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimpleMarkdown } from "@/components/ask/simple-markdown";
import { ReportView } from "@/components/insights/report-view";

const PAYLOADS = [
  `<img src=x onerror="alert(1)">`,
  `<script>alert(document.cookie)</script>`,
  `[Verify your account](javascript:alert(1))`,
  `<a href="https://evil.example">Claim your refund</a>`,
  `**<iframe src="https://evil.example"></iframe>**`,
  `- <svg onload=alert(1)>`,
];
// Real elements only: escaped text ("&lt;img …") never matches.
const tagsIn = (html: string) => new Set([...html.matchAll(/<([a-z0-9]+)[\s>]/g)].map((m) => m[1]));
const dangerousAttrs = (html: string) =>
  [...html.matchAll(/<[a-z0-9]+([^>]*)>/g)]
    .flatMap((m) => [...m[1].matchAll(/\s([a-z:-]+)=/gi)].map((a) => a[1]))
    .filter((a) => /^(href|src|srcdoc|on\w+|formaction|xlink:href)$/i.test(a));

describe("chat answers (SimpleMarkdown)", () => {
  it("render only paragraphs, lists and bold, with any markup shown as text", () => {
    const html = renderToStaticMarkup(<SimpleMarkdown text={PAYLOADS.join("\n")} />);
    expect([...tagsIn(html)].filter((t) => !["div", "p", "strong", "ul", "ol", "li"].includes(t))).toEqual([]);
    expect(dangerousAttrs(html)).toEqual([]);
    expect(html).toContain("&lt;script&gt;alert(document.cookie)&lt;/script&gt;");
    expect(html).toContain("[Verify your account](javascript:alert(1))"); // a markdown link stays words
  });
});

describe("the insights report (ReportView)", () => {
  it("shows every field as text", () => {
    const html = renderToStaticMarkup(
      <ReportView
        report={{
          headline: PAYLOADS[0],
          items: PAYLOADS.slice(1).map((p, i) => ({
            kind: (["good", "watch", "tip"] as const)[i % 3],
            title: p,
            detail: p,
          })),
        }}
      />,
    );
    // Only the component's own elements (and its icons' SVG) appear.
    const own = ["div", "p", "ul", "li", "span", "svg", "path", "circle", "line", "polyline", "rect"];
    expect([...tagsIn(html)].filter((t) => !own.includes(t))).toEqual([]);
    expect(dangerousAttrs(html)).toEqual([]);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
