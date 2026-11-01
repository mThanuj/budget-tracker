import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { themeInitScript } from "@/components/theme/theme-script";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/config/app";
import { siteUrl } from "@/config/site";
import { onest, splineSansMono, youngSerif } from "./fonts";

export async function generateMetadata(): Promise<Metadata> {
  await connection(); // the site's address is a setting: read it per request, not at build time
  return {
    // Full addresses for link previews (D-036).
    metadataBase: siteUrl(),
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: "Track your spending, set budgets and ask questions about your money in plain words.",
    // Added to an iPhone's home screen, it opens like an app (the manifest does this elsewhere, D-031).
    appleWebApp: { title: APP_NAME, capable: true },
    // Link previews take the title and description above, and the image from opengraph-image.tsx.
    openGraph: { siteName: APP_NAME, type: "website", locale: "en_IN" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#111514" },
  ],
};

// Every page renders per request, so Next can put that request's CSP nonce on
// its scripts (D-027). That means no static shells, so their check is off.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${onest.variable} ${youngSerif.variable} ${splineSansMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
