export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

// Runs in <head> before first paint so the page never flashes the wrong theme.
// Must stay self-contained: it's inlined as a string. Only the storage read is
// guarded: where storage is blocked (e.g. private browsing) it throws, and the
// device's own light/dark setting must still apply.
export const themeInitScript = `(function(){var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(_){/* storage blocked: follow the device setting */}var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"})()`;
