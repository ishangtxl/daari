"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type StringKey } from "@/lib/i18n";
import { emptyProfile, type Lang, type MatchedJob, type Profile, type ResumeData } from "@/lib/types";

// ── Auth user type (mirrors SessionPayload sub-fields returned by /api/auth/session) ──
export type AuthUser = { id: string; name: string | null; provider: "phone" | "google" };

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
export type ApplicationStatus = "statusApplied" | "statusCalled" | "statusInterview" | "statusOffer" | "statusNoReply";
export type Application = { jobId: string; title: MatchedJob["title"]; employer: string; applyLink: string; status: ApplicationStatus; at: string };
export type PlanStep = {
  title: string;
  why: string;
  time: string;
  practice: string;
  youtube: string;
  course: { source: string; title: string; url: string } | null;
};

/** Role is permanent once chosen — seeker cannot become provider and vice versa. */
export type UserRole = "job_seeker" | "job_provider";

/** Draft job listing collected via voice or manual form — persisted so switching tabs preserves data. */
export type ProviderJobDraft = {
  businessName: string;
  roleCategory: string;
  customRoleName: string;
  locality: string;
  landmark: string;
  salaryMin: number;
  salaryMax: number;
  vacancies: number;
  requirements: string[];
  customNotes: string;
  whatsappContact: string;
  proofType: string;
  proofValue: string;
};

export type PostedListing = {
  id: string;
  title: string;
  employer: string;
  area: string;
  salaryText: string;
  status: "active" | "closed";
  postedAt: string;
};

export function emptyDraft(): ProviderJobDraft {
  return {
    businessName: "",
    roleCategory: "",
    customRoleName: "",
    locality: "",
    landmark: "",
    salaryMin: 16000,
    salaryMax: 22000,
    vacancies: 1,
    requirements: [],
    customNotes: "",
    whatsappContact: "",
    proofType: "none",
    proofValue: "",
  };
}

type Stored = {
  lang: Lang | null;
  role: UserRole | null;
  // NOTE: user is intentionally NOT persisted to localStorage — it is always
  // re-hydrated from the server session cookie on mount so it stays in sync.
  user: AuthUser | null;
  profile: Profile;
  messages: ChatMessage[];
  providerMessages: ChatMessage[];
  jobs: MatchedJob[] | null;
  roles: string[];
  jobsKey: string;
  applications: Application[];
  plan: PlanStep[] | null;
  resume: ResumeData | null;
  resumeReview: string[];
  resumeRemoved: string[];
  providerDraft: ProviderJobDraft;
  postedListings: PostedListing[];
};

const KEY = "daari.v1";
const initial = (): Stored => ({
  lang: null,
  role: null,
  user: null,
  profile: emptyProfile(),
  messages: [],
  providerMessages: [],
  jobs: null,
  roles: [],
  jobsKey: "",
  applications: [],
  plan: null,
  resume: null,
  resumeReview: [],
  resumeRemoved: [],
  providerDraft: emptyDraft(),
  postedListings: [],
});

type AppState = Stored & {
  ready: boolean;
  t: (key: StringKey, values?: Record<string, string | number>) => string;
  update: (patch: Partial<Stored> | ((current: Stored) => Partial<Stored>)) => void;
  clear: () => void;
  effectiveLang: Lang;
  signOut: () => Promise<void>;
};

const Context = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let loaded: Partial<Stored> | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      loaded = raw ? JSON.parse(raw) : null;
    } catch {
      // Blocked or corrupt storage: the app still works for this visit.
    }
    // Loading saved state in an effect keeps the first render identical to the server's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loaded) setStored({ ...initial(), ...loaded,
      // Always start with user: null — the fetch below is the source of truth.
      user: null,
      profile: { ...emptyProfile(), ...loaded.profile },
      providerDraft: { ...emptyDraft(), ...(loaded.providerDraft ?? {}), proofType: "none", proofValue: "" },
    });
    setReady(true);

    // Hydrate auth session from the HttpOnly session cookie.
    // Always runs on mount so navigating back to "/" after login picks it up.
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((body: { user: AuthUser | null }) => {
        setStored((s) => ({ ...s, user: body.user ?? null }));
      })
      .catch(() => {/* session fetch failure is non-fatal */});
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      // Exclude `user` from localStorage — it is always re-hydrated from the cookie.
      const { user: _user, ...rest } = stored;
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      // Storage may be full or blocked, and nothing on screen depends on this write.
    }
  }, [stored, ready]);

  const effectiveLang: Lang = stored.lang ?? "en";
  useEffect(() => {
    document.documentElement.lang = effectiveLang;
  }, [effectiveLang]);

  const update = useCallback<AppState["update"]>((patch) => {
    setStored((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
  }, []);

  const clear = useCallback(() => {
    setStored((current) => ({ ...initial(), lang: current.lang }));
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    setStored((current) => ({ ...current, user: null }));
  }, []);

  const value = useMemo<AppState>(
    () => ({ ...stored, ready, update, clear, signOut, effectiveLang, t: (key, values) => translate(effectiveLang, key, values) }),
    [stored, ready, update, clear, signOut, effectiveLang],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
