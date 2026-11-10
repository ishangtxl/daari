"use client";

import type { Lang } from "@/lib/types";
import { useApp } from "./app-state";
import { Street } from "./art";

const LANGUAGE_CHOICES: { lang: Lang; label: string }[] = [
  { lang: "kn", label: "ಕನ್ನಡ" },
  { lang: "hi", label: "हिन्दी" },
  { lang: "en", label: "English" },
];

/**
 * The very first screen, before sign-in: pick a language by its own script, so nobody has to read
 * English to get in. Everything after it, sign-in included, is in the language picked.
 */
export function ChooseLanguage() {
  const { update } = useApp();
  return (
    <main className="welcome">
      <Street className="welcome-street" />
      <div className="welcome-body">
        <h1 className="brand-mark">ದಾರಿ</h1>
        <p className="welcome-line">
          <span lang="kn">ಕೆಲಸಕ್ಕೆ ದಾರಿ</span>
          <span lang="hi">काम की राह</span>
          <span lang="en">Your way to work</span>
        </p>
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
