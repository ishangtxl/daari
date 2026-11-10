"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-state";
import { RoadMap } from "@/components/road-map";
import { ErrorNote, Icon, Loading, Shell, TabebuiaTree } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { unlockAudio } from "@/lib/client/audio";
import { roadText, transcriptOf } from "@/lib/client/road";
import type { StringKey } from "@/lib/i18n";
import type { Goal, Lang, Roadmap } from "@/lib/types";

const LANGUAGE_CHOICES: { lang: Lang; label: string; hint: string }[] = [
  { lang: "kn", label: "ಕನ್ನಡ", hint: "Kannada" },
  { lang: "hi", label: "हिन्दी", hint: "Hindi" },
  { lang: "en", label: "English", hint: "English" },
];

const GOAL_ROWS: { goal: Goal; icon: string; label: StringKey; hint: StringKey }[] = [
  { goal: "job", icon: "briefcase", label: "goalJob", hint: "goalJobHint" },
  { goal: "learn", icon: "book", label: "goalLearn", hint: "goalLearnHint" },
  { goal: "resume", icon: "person", label: "goalResume", hint: "goalResumeHint" },
  { goal: "unsure", icon: "compass", label: "goalUnsure", hint: "goalUnsureHint" },
];

function ChooseLanguage() {
  const { update } = useApp();
  return (
    <main className="welcome">
      <TabebuiaTree className="welcome-tree" tall />
      <div className="welcome-body">
        <h1 className="brand-mark">ದಾರಿ</h1>
        <p className="welcome-line">Daari · दारी</p>
        <div className="language-list">
          {LANGUAGE_CHOICES.map((choice) => (
            <button key={choice.lang} type="button" lang={choice.lang} className="language-choice" onClick={() => update({ lang: choice.lang })}>
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

function ChooseRole() {
  const { t, update } = useApp();
  return (
    <main className="welcome role-choice-screen">
      <TabebuiaTree className="welcome-tree" tall />
      <div className="welcome-body">
        <h1 className="brand-mark">ದಾರಿ</h1>
        <p className="role-choice-title">{t("roleChoiceTitle")}</p>
        <div className="role-choice-list">
          <button
            type="button"
            className="role-choice-card role-choice-seeker"
            onClick={() => update({ role: "job_seeker" })}
          >
            <span className="role-choice-icon"><Icon name="briefcase" size={28} /></span>
            <span className="role-choice-text">
              <strong>{t("roleChoiceSeeker")}</strong>
              <span>{t("roleChoiceSeekerSub")}</span>
            </span>
            <span className="role-choice-arrow"><Icon name="back" size={20} /></span>
          </button>
          <button
            type="button"
            className="role-choice-card role-choice-provider"
            onClick={() => update({ role: "job_provider" })}
          >
            <span className="role-choice-icon role-icon-provider"><Icon name="tool" size={28} /></span>
            <span className="role-choice-text">
              <strong>{t("roleChoiceProvider")}</strong>
              <span>{t("roleChoiceProviderSub")}</span>
            </span>
            <span className="role-choice-arrow"><Icon name="back" size={20} /></span>
          </button>
        </div>
      </div>
    </main>
  );
}

function ProviderHome() {
  const { t, providerDraft } = useApp();
  const hasDraft = Boolean(providerDraft.businessName || providerDraft.roleCategory || providerDraft.locality);
  return (
    <Shell>
      <section className="hero hero-provider">
        <TabebuiaTree className="hero-tree" tall />
        <div className="hero-copy">
          <h1>{hasDraft ? t("providerDraftSavedHint") : t("intentEmployerTitle")}</h1>
          {!hasDraft && <p>{t("intentEmployerSub")}</p>}
        </div>
      </section>
      <section className="home-links">
        <Link href="/provider/talk" className="home-link">
          <Icon name="mic" size={28} />
          <span>{t("navProviderTalk")}</span>
        </Link>
        <Link href="/provider/listings" className="home-link">
          <Icon name="list" size={28} />
          <span>{t("navMyListings")}</span>
        </Link>
        <Link href="/provider/applicants" className="home-link">
          <Icon name="users" size={28} />
          <span>{t("navApplicants")}</span>
        </Link>
      </section>
    </Shell>
  );
}

export default function Home() {
  const { ready, lang, role, t, effectiveLang, profile, messages, roadmap, update } = useApp();
  const router = useRouter();
  const [remaking, setRemaking] = useState(false);
  const [remakeFailed, setRemakeFailed] = useState(false);
  if (!ready) return <main className="welcome" />;
  if (!lang) return <ChooseLanguage />;
  if (!role) return <ChooseRole />;
  if (role === "job_provider") return <ProviderHome />;

  const returning = Boolean(profile.words || messages.length);
  const title = returning ? t("homeBackTitle") : t("homeTitle");
  const sub = returning ? t("homeBackSub") : t("homeSub");

  const remake = async () => {
    setRemaking(true);
    setRemakeFailed(false);
    try {
      const { roadmap: fresh } = await postJson<{ roadmap: Roadmap }>("/api/roadmap", { lang: effectiveLang, profile, transcript: transcriptOf(messages) });
      update((current) => ({
        roadmap: fresh,
        messages: [...current.messages, { id: crypto.randomUUID(), role: "assistant", content: roadText(fresh), roadmap: fresh }],
      }));
    } catch {
      setRemakeFailed(true);
    } finally {
      setRemaking(false);
    }
  };

  return (
    <Shell>
      <section className="hero" data-compact={returning ? "" : undefined}>
        <TabebuiaTree className="hero-tree" tall />
        <div className="hero-copy">
          <h1>{title}</h1>
          <p>{sub}</p>
          <div className="hero-actions">
            <button
              type="button"
              className="hero-mic"
              onClick={() => {
                unlockAudio();
                router.push("/talk?listen=1");
              }}
            >
              <span className="mic" data-static><Icon name="mic" size={38} /></span>
              <span>{returning ? t("keepTalking") : t("tapToTalk")}</span>
            </button>
            <Link href="/talk?type=1" className="hero-type">
              <Icon name="keyboard" size={20} />
              {t("typeInstead")}
            </Link>
          </div>
        </div>
      </section>

      {roadmap && (
        <section className="home-road">
          <RoadMap roadmap={roadmap} id="home-road" onTalk={() => router.push("/talk?type=1")} />
          {remaking ? (
            <Loading text={t("roadMaking")} />
          ) : (
            <button type="button" className="btn btn-quiet home-remake" onClick={remake}>{t("roadAgain")}</button>
          )}
          {remakeFailed && <ErrorNote text={t("roadFailed")} onRetry={remake} />}
        </section>
      )}

      {!roadmap && (
        <section className="home-start" aria-labelledby="start-where">
          <h2 id="start-where">{t("startWhere")}</h2>
          <ul className="goal-list">
            {GOAL_ROWS.map((row) => (
              <li key={row.goal}>
                <Link href={`/talk?goal=${row.goal}`} className="goal-row">
                  <Icon name={row.icon} size={28} />
                  <span>
                    <strong>{t(row.label)}</strong>
                    <span className="goal-hint">{t(row.hint)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-links">
        <Link href="/check" className="home-link">
          <Icon name="shield" size={28} />
          <span>{t("homeCheck")}</span>
        </Link>
      </section>
    </Shell>
  );
}
