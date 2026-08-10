/**
 * The language registry.
 *
 * A choice the player made is remembered; otherwise the browser's own
 * preference order decides, falling back to English. The stored value is
 * validated on read, because a string in local storage is input like any other.
 */

import { DE } from "./de.ts";
import { ES } from "./es.ts";
import { FR } from "./fr.ts";
import { JA } from "./ja.ts";
import { RU } from "./ru.ts";
import { EN } from "./strings.ts";
import { ZH } from "./zh.ts";
import type { Strings } from "./strings.ts";

export type LanguageCode = "en" | "ru" | "de" | "es" | "fr" | "ja" | "zh";

export const LANGUAGES: ReadonlyMap<LanguageCode, Strings> = new Map([
  ["en", EN],
  ["ru", RU],
  ["de", DE],
  ["es", ES],
  ["fr", FR],
  ["ja", JA],
  ["zh", ZH],
]);

const STORAGE_KEY = "kabucast.language";
const DEFAULT_LANGUAGE: LanguageCode = "en";

function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.has(value as LanguageCode);
}

export function stringsFor(code: LanguageCode): Strings {
  return LANGUAGES.get(code) ?? EN;
}

/** The stored choice, then the browser's preference order, then English. */
export function detectLanguage(): LanguageCode {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (stored !== null && isLanguageCode(stored)) {
    return stored;
  }

  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0] ?? "";
    if (isLanguageCode(base)) {
      return base;
    }
  }
  return DEFAULT_LANGUAGE;
}

export function rememberLanguage(code: LanguageCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private browsing can refuse storage; the choice then lasts the session.
  }
}
