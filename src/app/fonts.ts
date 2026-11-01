import localFont from "next/font/local";

// The app's three fonts, served from our own domain and preloaded, with
// fallbacks sized to match so text doesn't jump when they arrive (D-036).
// Only the latin files: no subset of these fonts has ₹, so it's always drawn
// by the fallback, and the other subsets would only be downloaded for it.
// The files come from the Fontsource packages, which Dependabot keeps current.

export const onest = localFont({
  src: "../../node_modules/@fontsource-variable/onest/files/onest-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-onest",
  adjustFontFallback: "Arial",
});

export const youngSerif = localFont({
  src: "../../node_modules/@fontsource/young-serif/files/young-serif-latin-400-normal.woff2",
  weight: "400",
  variable: "--font-young-serif",
  adjustFontFallback: "Times New Roman",
});

// Amounts. A monospace font has no metric-matched fallback, so none is generated.
export const splineSansMono = localFont({
  src: "../../node_modules/@fontsource-variable/spline-sans-mono/files/spline-sans-mono-latin-wght-normal.woff2",
  weight: "300 700",
  variable: "--font-spline-mono",
  adjustFontFallback: false,
});
