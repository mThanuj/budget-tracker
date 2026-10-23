"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type ThemePreference } from "./theme-script";

const CHANGE_EVENT = "themechange";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") return darkQuery().matches ? "dark" : "light";
  return pref;
}

function apply(pref: ThemePreference) {
  const resolved = resolve(pref);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function subscribe(onChange: () => void) {
  const mq = darkQuery();
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    mq.removeEventListener("change", onChange);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    () => resolve(readPreference()),
    () => undefined,
  );

  // Follow the OS setting live while the preference is "system".
  useEffect(() => {
    apply(theme);
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode): still apply for this page view.
    }
    apply(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { theme, resolvedTheme, setTheme };
}
