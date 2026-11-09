"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-state";
import { Icon, Shell, TabebuiaTree } from "@/components/ui";
import { unlockAudio } from "@/lib/client/audio";
import type { Lang } from "@/lib/types";

const LANGUAGE_CHOICES: { lang: Lang; label: string; hint: string }[] = [
  { lang: "kn", label: "ಕನ್ನಡ", hint: "Kannada" },
  { lang: "hi", label: "हिन्दी", hint: "Hindi" },
  { lang: "en", label: "English", hint: "English" },
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
  const { ready, lang, role, t, profile, jobs } = useApp();
  const router = useRouter();
  if (!ready) return <main className="welcome" />;
  if (!lang) return <ChooseLanguage />;
  if (!role) return <ChooseRole />;
  if (role === "job_provider") return <ProviderHome />;

  const hasJobs = Boolean(jobs?.length);
  return (
    <Shell>
      <section className="hero">
        <TabebuiaTree className="hero-tree" tall />
        <div className="hero-copy">
          <h1>{profile.words ? t("tagline") : t("homeTitle")}</h1>
          {!profile.words && <p>{t("homeSub")}</p>}
          <button
            type="button"
            className="hero-mic"
            onClick={() => {
              unlockAudio();
              router.push("/talk?listen=1");
            }}
          >
            <span className="mic" data-static><Icon name="mic" size={38} /></span>
            <span>{t("tapToTalk")}</span>
          </button>
        </div>
      </section>
      <section className="home-links">
        <Link href="/jobs" className="home-link">
          <Icon name="briefcase" size={28} />
          <span>{hasJobs ? t("homeJobsReady") : t("homeJobs")}</span>
        </Link>
        <Link href="/check" className="home-link">
          <Icon name="shield" size={28} />
          <span>{t("homeCheck")}</span>
        </Link>
        <Link href="/me" className="home-link">
          <Icon name="person" size={28} />
          <span>{t("homeResume")}</span>
        </Link>
      </section>
    </Shell>
  );
}
