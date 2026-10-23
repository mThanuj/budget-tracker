import type { Metadata, Viewport } from "next";
import "@fontsource-variable/onest/wght.css";
import "@fontsource/young-serif/400.css";
import "@fontsource-variable/spline-sans-mono/wght.css";
import "./globals.css";
import { themeInitScript } from "@/components/theme/theme-script";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description:
    "Track your spending, set budgets and ask questions about your money in plain words.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#111514" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
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
