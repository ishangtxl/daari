import type { Lang } from "../types";

const DAY_MS = 86_400_000;

/** "12 Nov", in the reader's language. */
export const shortDate = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(`${lang}-IN`, { day: "numeric", month: "short" }).format(new Date(iso));

/** Whole days until a date, never below zero. */
export const daysUntil = (iso: string, now = Date.now()) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY_MS));
