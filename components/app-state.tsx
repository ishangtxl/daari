"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { translate, type StringKey } from "@/lib/i18n";
import { chatMessageSchema, DOCUMENT_KINDS, statePatchSchema, type StatePatch } from "@/lib/state";
import { emptyProfile, type Lang, type MatchedJob, type Profile, type ResumeData, type Roadmap } from "@/lib/types";
import type { Application, ChatMessage, PlanStep } from "@/lib/state";

export type { Application, ApplicationStatus, ChatMessage, PlanStep } from "@/lib/state";

// ── Auth user type (mirrors SessionPayload sub-fields returned by /api/auth/session) ──
export type AuthUser = { id: string; name: string | null; provider: "phone" | "google" };

type Stored = {
  lang: Lang | null;
  user: AuthUser | null;
  profile: Profile;
  messages: ChatMessage[];
  /** The latest plan, also shown on Home. */
  roadmap: Roadmap | null;
  jobs: MatchedJob[] | null;
  roles: string[];
  jobsKey: string;
  applications: Application[];
  plan: PlanStep[] | null;
  resume: ResumeData | null;
  resumeReview: string[];
  resumeRemoved: string[];
};

/** The parts saved to the account. Messages are saved separately, one row each. */
const SYNCED = [...DOCUMENT_KINDS, "applications"] as const;
type Synced = (typeof SYNCED)[number];

// Only the language stays in the browser, for the screens before sign-in. Everything else belongs
// to the account on the server, so a shared phone never shows one person's details to another.
const LANG_KEY = "daari.lang";
// Before accounts, everything was kept here. It is moved into the account once, then removed.
const LEGACY_KEY = "daari.v1";
const SAVE_DELAY_MS = 700;
const RETRY_DELAY_MS = 5000;

const initial = (lang: Lang | null = null): Stored => ({
  lang,
  user: null,
  profile: emptyProfile(),
  messages: [],
  roadmap: null,
  jobs: null,
  roles: [],
  jobsKey: "",
  applications: [],
  plan: null,
  resume: null,
  resumeReview: [],
  resumeRemoved: [],
});

type AppState = Stored & {
  ready: boolean;
  t: (key: StringKey, values?: Record<string, string | number>) => string;
  update: (patch: Partial<Stored> | ((current: Stored) => Partial<Stored>)) => void;
  /** Deletes the account's data on the server and here. False if the server could not do it. */
  clear: () => Promise<boolean>;
  /** Forgets what Daari learned, keeping the account and its language. False if the server could not do it. */
  startOver: () => Promise<boolean>;
  effectiveLang: Lang;
  signOut: () => Promise<void>;
};

const Context = createContext<AppState | null>(null);

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Blocked storage: the app still works, it just forgets the language.
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Nothing on screen depends on this write.
  }
}

const isLang = (value: unknown): value is Lang => value === "en" || value === "hi" || value === "kn";

/** What was kept in this browser before accounts, checked part by part so one bad part is dropped alone. */
function readLegacy(): { patch: StatePatch; messages: ChatMessage[] } | null {
  const raw = readLocal(LEGACY_KEY);
  if (!raw) return null;
  try {
    const old = JSON.parse(raw) as Record<string, unknown>;
    const patch: StatePatch = {};
    for (const key of SYNCED) {
      if (old[key] === undefined) continue;
      const parsed = statePatchSchema.shape[key].safeParse(key === "profile" ? { ...emptyProfile(), ...(old.profile as object) } : old[key]);
      if (parsed.success) Object.assign(patch, { [key]: parsed.data });
    }
    const messages = (Array.isArray(old.messages) ? old.messages : []).flatMap((message) => {
      const parsed = chatMessageSchema.safeParse(message);
      return parsed.success ? [parsed.data] : [];
    });
    return { patch, messages };
  } catch {
    return null;
  }
}

type Loaded = { documents: Partial<Record<string, unknown>>; messages: ChatMessage[]; applications: Application[]; empty: boolean };

export function AppProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored>(initial);
  const [ready, setReady] = useState(false);
  // Signed in, but the account could not be loaded. Shown as its own screen, never as an empty account.
  const [loadFailed, setLoadFailed] = useState(false);

  // What the server is known to hold, so a save sends only what changed since.
  const savedRef = useRef<Partial<Record<Synced, unknown>>>({});
  const savedMessagesRef = useRef<Set<string>>(new Set());
  const latestRef = useRef(stored);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);
  const againRef = useRef(false);
  // Saving starts only once the account has loaded. Saving after a failed load would write this
  // blank screen over everything the account really holds.
  const canSaveRef = useRef(false);
  latestRef.current = stored;

  /** Sends what changed. One save runs at a time; changes made meanwhile go in the next one. */
  const flush = useCallback(async (keepalive = false): Promise<void> => {
    if (savingRef.current) {
      againRef.current = true;
      return savingRef.current;
    }
    const current = latestRef.current;
    if (!current.user || !canSaveRef.current) return;
    const patch: Record<string, unknown> = {};
    for (const key of SYNCED) if (current[key] !== savedRef.current[key]) patch[key] = current[key];
    const fresh = current.messages.filter((message) => !savedMessagesRef.current.has(message.id));
    if (!Object.keys(patch).length && !fresh.length) return;

    const run = async () => {
      try {
        if (Object.keys(patch).length) {
          const res = await fetch("/api/state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch), keepalive });
          if (!res.ok) throw new Error(`save ${res.status}`);
          Object.assign(savedRef.current, patch);
        }
        if (fresh.length) {
          const res = await fetch("/api/state/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: fresh }), keepalive });
          if (!res.ok) throw new Error(`messages ${res.status}`);
          for (const message of fresh) savedMessagesRef.current.add(message.id);
        }
      } catch {
        // Offline or the server is busy: keep the changes and try again shortly.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void flush(), RETRY_DELAY_MS);
      }
    };
    savingRef.current = run().finally(() => {
      savingRef.current = null;
      if (againRef.current) {
        againRef.current = false;
        void flush();
      }
    });
    return savingRef.current;
  }, []);

  // Load the signed-in account. Session and data are fetched together to keep the first screen quick.
  useEffect(() => {
    const localLang = readLocal(LANG_KEY);
    const lang = isLang(localLang) ? localLang : null;
    let cancelled = false;
    (async () => {
      const loadState = async (): Promise<Loaded | null> => {
        // A dropped connection or a restarting server gets two more tries before giving up.
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch("/api/state", { cache: "no-store" }).catch(() => null);
          if (res?.ok) return (await res.json()) as Loaded;
          if (res?.status === 401) return null;
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
        return null;
      };
      const [sessionRes, loaded] = await Promise.all([fetch("/api/auth/session").catch(() => null), loadState()]);
      const session = (await sessionRes?.json().catch(() => null)) as { user: AuthUser | null } | null;
      const user = session?.user ?? null;
      if (cancelled) return;

      let next: Stored = { ...initial(lang), user };
      let imported = false;
      if (user && loaded) {
        if (loaded.empty) {
          const legacy = readLegacy();
          if (legacy) {
            // A first sign-in on a phone that was used before accounts: bring that work along. The
            // browser copy is removed straight away, so it can only ever go to this one account,
            // never to whoever signs in next on a shared phone.
            writeLocal(LEGACY_KEY, null);
            next = { ...next, ...(legacy.patch as Partial<Stored>), lang: legacy.patch.lang ?? lang, messages: legacy.messages };
            imported = true;
          }
        } else {
          const documents: Partial<Stored> = {};
          for (const kind of DOCUMENT_KINDS) {
            if (loaded.documents[kind] !== undefined) Object.assign(documents, { [kind]: loaded.documents[kind] });
          }
          next = { ...next, ...documents, lang: (documents.lang as Lang | null | undefined) ?? lang, messages: loaded.messages, applications: loaded.applications };
        }
        if (!imported) {
          // What loaded is what the server holds, and a part it has nothing for is the same as its
          // default, so neither needs saving back. Only real changes are written from here on.
          for (const key of SYNCED) savedRef.current[key] = next[key];
          // A language picked before signing in becomes the account's first saved setting.
          if (loaded.documents.lang === undefined && next.lang) delete savedRef.current.lang;
          savedMessagesRef.current = new Set(next.messages.map((message) => message.id));
        }
      }
      canSaveRef.current = Boolean(user && loaded);
      if (user && !loaded) {
        setLoadFailed(true);
        return;
      }
      // Loading in an effect keeps the first render identical to the server's.
      setStored(next);
      setReady(true);
      // Imported work exists only in memory now, so save it at once rather than after the usual pause.
      if (imported) {
        latestRef.current = next;
        void flush();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flush]);

  // Save shortly after changes settle, so a burst of updates becomes one request.
  useEffect(() => {
    if (!ready) return;
    writeLocal(LANG_KEY, stored.lang);
    if (!stored.user) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [stored, ready, flush]);

  // Closing the tab or switching apps sends anything still waiting.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  const effectiveLang: Lang = stored.lang ?? "en";
  useEffect(() => {
    document.documentElement.lang = effectiveLang;
  }, [effectiveLang]);

  const update = useCallback<AppState["update"]>((patch) => {
    setStored((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
  }, []);

  // Both end the same way here: a blank account in the same language. Only what the server keeps differs.
  const forget = useCallback(async (request: { url: string; method: string }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await savingRef.current;
    const res = await fetch(request.url, { method: request.method }).catch(() => null);
    if (!res?.ok) return false;
    const fresh = { ...initial(latestRef.current.lang), user: latestRef.current.user };
    // The server now holds at most the language, so the next save writes only what is set again, starting with it.
    savedRef.current = Object.fromEntries(SYNCED.map((key) => [key, fresh[key]]));
    delete savedRef.current.lang;
    savedMessagesRef.current = new Set();
    writeLocal(LEGACY_KEY, null);
    setStored(fresh);
    return true;
  }, []);
  const clear = useCallback(() => forget({ url: "/api/state", method: "DELETE" }), [forget]);
  const startOver = useCallback(() => forget({ url: "/api/state/reset", method: "POST" }), [forget]);

  const signOut = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await flush();
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    savedRef.current = {};
    savedMessagesRef.current = new Set();
    canSaveRef.current = false;
    writeLocal(LEGACY_KEY, null);
    // Nothing of this account stays on screen for whoever signs in next.
    setStored((current) => initial(current.lang));
  }, [flush]);

  const value = useMemo<AppState>(
    () => ({ ...stored, ready, update, clear, startOver, signOut, effectiveLang, t: (key, values) => translate(effectiveLang, key, values) }),
    [stored, ready, update, clear, startOver, signOut, effectiveLang],
  );
  if (loadFailed) {
    return (
      <main className="load-failed" role="alert">
        <p>{translate(effectiveLang, "loadFailed")}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{translate(effectiveLang, "tryAgain")}</button>
      </main>
    );
  }
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
