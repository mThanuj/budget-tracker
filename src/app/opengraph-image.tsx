import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BrandIcon } from "@/components/app/brand-icon";
import { APP_NAME } from "@/config/app";

// The picture shown when someone shares a link to the site (WhatsApp, Slack, X
// and others): the app icon, the name and the landing page's headline. Built at
// build time like the icons; crawlers fetch it without a cookie (PUBLIC_ASSET
// in src/proxy.ts, D-036).
export const alt = `${APP_NAME}: know where your money goes.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Young Serif, as in the site's headings. The image renderer can't read woff2, hence the woff.
const heading = readFile(
  join(process.cwd(), "node_modules/@fontsource/young-serif/files/young-serif-latin-400-normal.woff"),
);

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 96,
        background: "#f6f7f4", // --background (light), src/app/globals.css
        color: "#18211e", // --foreground
        fontFamily: "Young Serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div style={{ display: "flex", width: 144, height: 144, borderRadius: 32, overflow: "hidden" }}>
          <BrandIcon size={144} />
        </div>
        <div style={{ fontSize: 96 }}>{APP_NAME}</div>
      </div>
      <div style={{ marginTop: 56, fontSize: 56, color: "#0f6e66" /* --primary */ }}>Know where your money goes.</div>
    </div>,
    { ...size, fonts: [{ name: "Young Serif", data: await heading, weight: 400, style: "normal" }] },
  );
}
