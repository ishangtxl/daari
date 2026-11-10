"use client";

import { daysUntil } from "@/lib/client/dates";
import type { StringKey } from "@/lib/i18n";
import type { PostingState, PostingSummary } from "@/lib/postings";
import { useApp } from "./app-state";

const STATE_TEXT: Record<Exclude<PostingState, "open">, StringKey> = { closed: "stateClosed", expired: "stateExpired", hidden: "stateHidden" };

/** Whether a posting is up, and for how long. */
export function StateLine({ posting }: { posting: Pick<PostingSummary, "state" | "expiresAt"> }) {
  const { t } = useApp();
  if (posting.state === "open") return <span className="state state-open">{t("stateOpen", { days: daysUntil(posting.expiresAt) })}</span>;
  return <span className={`state state-${posting.state}`}>{t(STATE_TEXT[posting.state])}</span>;
}

