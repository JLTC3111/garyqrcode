import type { Locale } from "./i18n";

export type Theme = "light" | "dark";
export type Preferences = { locale: Locale; theme: Theme };
export const PREFERENCES_KEY = "gary-customer-preferences-v1";

export function resolvePreferences(search: string, saved: string | null, browserLanguage: string, systemDark: boolean): Preferences {
  let stored: Partial<Preferences> = {};
  try { const value: unknown = JSON.parse(saved || "null"); if (value && typeof value === "object") stored = value as Partial<Preferences>; } catch { /* Ignore unavailable or malformed preferences. */ }
  const query = new URLSearchParams(search);
  const language = query.get("lang");
  const theme = query.get("theme");
  return {
    locale: language === "vi" || language === "en" ? language : stored.locale === "vi" || stored.locale === "en" ? stored.locale : browserLanguage.toLowerCase().startsWith("vi") ? "vi" : "en",
    theme: theme === "dark" || theme === "light" ? theme : stored.theme === "dark" || stored.theme === "light" ? stored.theme : systemDark ? "dark" : "light",
  };
}

// Apply the saved theme before rendering to avoid a bright flash in dark mode.
export const themeBootstrap = `(() => { try { const p = new URLSearchParams(location.search); let s = {}; try { s = JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_KEY)}) || '{}') || {}; } catch {} const q = p.get('theme'); const t = q === 'dark' || q === 'light' ? q : s.theme === 'dark' || s.theme === 'light' ? s.theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; document.documentElement.dataset.theme = t; } catch {} })();`;
