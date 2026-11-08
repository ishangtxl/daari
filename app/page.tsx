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

export default function Home() {
  const { ready, lang, t, profile, jobs } = useApp();
  const router = useRouter();
  if (!ready) return <main className="welcome" />;
  if (!lang) return <ChooseLanguage />;

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
        <Link href="/jobs/post" className="home-link">
          <Icon name="tool" size={28} />
          <span>{t("homePostJob")}</span>
        </Link>
      </section>
    </Shell>
  );
}
