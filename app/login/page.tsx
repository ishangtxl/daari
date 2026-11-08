"use client";

/**
 * /login  — Firebase Phone Auth (primary) + Google OAuth (secondary).
 *
 * Firebase Phone Auth flow:
 *   1. User enters phone number → signInWithPhoneNumber()
 *      Firebase renders the invisible reCAPTCHA and sends OTP automatically.
 *   2. User enters the 6-digit code → confirmationResult.confirm(code)
 *   3. We exchange the Firebase ID token for our own session cookie via
 *      POST /api/auth/firebase, then redirect to "/".
 *
 * Test numbers (Firebase Console → Authentication → Sign-in method → Phone
 *   → Phone numbers for testing):
 *   Add e.g. +91 9999999999 / code 123456 to bypass SMS during development.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase-client";
import { useApp } from "@/components/app-state";
import { Icon, Shell, TabebuiaTree } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import type { Lang } from "@/lib/types";

type Stage = "intent" | "phone" | "otp";
type Intent = "seeker" | "employer";

const LANGUAGE_CHOICES: { lang: Lang; label: string }[] = [
  { lang: "kn", label: "ಕನ್ನಡ" },
  { lang: "hi", label: "हिन्दी" },
  { lang: "en", label: "English" },
];

const SPLASH_ITEMS = [
  {
    mark: "ದಾರಿ",
    sub: "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಕೌಶಲ್ಯದ ಕೆಲಸಕ್ಕೆ ನಿಮ್ಮ ದಾರಿ",
    lang: "kn" as const,
  },
  {
    mark: "दारी",
    sub: "बेंगलुरु में कुशल काम के लिए आपका रास्ता",
    lang: "hi" as const,
  },
  {
    mark: "Daari",
    sub: "Your path to skilled work in Bengaluru",
    lang: "en" as const,
  },
];

function LoginContent() {
  const { ready, t, effectiveLang, update } = useApp();
  const router = useRouter();
  const params = useSearchParams();

  const initialIntentParam = params.get("intent");
  const initialIntent: Intent =
    initialIntentParam === "post" || initialIntentParam === "employer" ? "employer" : "seeker";
  const [intent, setIntent] = useState<Intent>(initialIntent);
  const [stage, setStage] = useState<Stage>(initialIntentParam ? "phone" : "intent");

  const [splashPhase, setSplashPhase] = useState<"splash" | "popping" | "settled">(
    initialIntentParam ? "settled" : "splash",
  );
  const [splashIndex, setSplashIndex] = useState(0);
  const [langFading, setLangFading] = useState(false);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const confirmRef = useRef<ConfirmationResult | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  // Keep the verifier in a ref — never on window — so each mount gets its own instance.
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  // A key we increment to force a fresh <div> when we need to recreate the verifier.
  const [captchaKey, setCaptchaKey] = useState(0);
  const captchaContainerRef = useRef<HTMLDivElement>(null);

  // Surface OAuth errors forwarded in the redirect URL.
  useEffect(() => {
    const err = params.get("error");
    if (err) setProblem(t("loginError"));
  }, [params, t]);

  // Create a new RecaptchaVerifier whenever the captcha container remounts.
  // The container remounts when captchaKey changes (after an error reset) or on
  // initial mount. We do NOT call render() here — signInWithPhoneNumber does it.
  useEffect(() => {
    if (!ready) return;
    if (!firebaseConfigured) return;
    if (!captchaContainerRef.current) return;

    // Destroy any previous verifier so Firebase doesn't think the element is taken.
    if (verifierRef.current) {
      try { verifierRef.current.clear(); } catch { /* ignore */ }
      verifierRef.current = null;
    }

    verifierRef.current = new RecaptchaVerifier(
      firebaseAuth,
      captchaContainerRef.current,
      { size: "invisible" },
    );

    return () => {
      // Cleanup on unmount (navigation away from /login).
      if (verifierRef.current) {
        try { verifierRef.current.clear(); } catch { /* ignore */ }
        verifierRef.current = null;
      }
    };
  // captchaKey in deps so the effect re-runs with a fresh div after resetVerifier().
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, captchaKey]);

  const [replayCount, setReplayCount] = useState(0);

  // Splash animation timer: Kannada (0) -> Hindi (1) -> English (2) -> Popping -> Settled
  useEffect(() => {
    if (splashPhase === "settled") return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSplashPhase("settled");
      return;
    }

    setSplashIndex(0);

    const timer1 = setTimeout(() => {
      setSplashIndex(1);
    }, 1350);

    const timer2 = setTimeout(() => {
      setSplashIndex(2);
    }, 2700);

    const timer3 = setTimeout(() => {
      setSplashPhase("popping");
    }, 4050);

    const timer4 = setTimeout(() => {
      setSplashPhase("settled");
    }, 4950);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [replayCount]);

  function skipSplash() {
    setSplashPhase("settled");
  }

  function replaySplash() {
    setSplashPhase("splash");
    setReplayCount((c) => c + 1);
  }

  function handleLangChange(newLang: Lang) {
    if (newLang === effectiveLang || langFading) return;
    setLangFading(true);
    setTimeout(() => {
      update({ lang: newLang });
      requestAnimationFrame(() => {
        setTimeout(() => {
          setLangFading(false);
        }, 60);
      });
    }, 180);
  }

  if (!ready) return null;

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Destroy the current verifier and mount a brand-new one (fresh DOM node). */
  function resetVerifier() {
    if (verifierRef.current) {
      try { verifierRef.current.clear(); } catch { /* ignore */ }
      verifierRef.current = null;
    }
    // Increment key → React replaces the <div> with a brand-new element →
    // the useEffect above re-runs and creates a clean RecaptchaVerifier.
    setCaptchaKey((k) => k + 1);
  }

  // ── Step 1: send OTP via Firebase ──────────────────────────────────────────

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.trim().replace(/\D/g, "");
    if (digits.length < 10) {
      setProblem(t("loginError"));
      return;
    }
    // Normalise to E.164 (+91XXXXXXXXXX)
    const e164 =
      digits.startsWith("91") && digits.length === 12
        ? `+${digits}`
        : `+91${digits.slice(-10)}`;

    if (!verifierRef.current) {
      setProblem(t("loginError"));
      return;
    }

    setBusy(true);
    setProblem(null);
    setNotice(null);

    try {
      const result = await signInWithPhoneNumber(firebaseAuth, e164, verifierRef.current);
      confirmRef.current = result;
      setStage("otp");
      setNotice(t("loginOtpSent"));
      setTimeout(() => codeRef.current?.focus(), 80);
    } catch (err: unknown) {
      console.error("[login] signInWithPhoneNumber failed", err);
      // After any error the verifier is in an unknown state — replace it entirely.
      resetVerifier();
      const fbCode = (err as { code?: string }).code ?? "";
      if (fbCode === "auth/invalid-phone-number") {
        setProblem(t("loginError"));
      } else if (fbCode === "auth/too-many-requests") {
        setProblem(t("tooMany"));
      } else {
        setProblem(t("loginError"));
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2: verify OTP, exchange Firebase ID token for session cookie ───────

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmRef.current) return;
    setBusy(true);
    setProblem(null);

    try {
      const credential = await confirmRef.current.confirm(code.trim());
      const idToken = await credential.user.getIdToken();
      const { user } = await postJson<{ ok: boolean; user: { phone: string; provider: "phone" } }>("/api/auth/firebase", { idToken });
      // Update app-state immediately so the nav bar flips to "Sign out" before redirect.
      update({ user: { id: user.phone, name: null, provider: "phone" } });
      const destination = intent === "employer" ? "/jobs/post" : (params.get("redirect") || "/");
      router.replace(destination);
    } catch (err: unknown) {
      const fbCode = (err as { code?: string }).code ?? "";
      if (fbCode === "auth/invalid-verification-code") {
        setProblem(t("loginWrongOtp"));
      } else if (fbCode === "auth/code-expired") {
        setProblem(t("loginOtpExpired"));
        setStage("phone");
        setCode("");
        confirmRef.current = null;
        resetVerifier();
      } else {
        setProblem(t("loginError"));
      }
    } finally {
      setBusy(false);
    }
  }

  function resend() {
    setStage("phone");
    setCode("");
    confirmRef.current = null;
    setProblem(null);
    setNotice(null);
    resetVerifier();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (stage === "intent") {
    return (
      <div className={`daari-splash-container splash-phase-${splashPhase}`}>
        {/* Circular blue wave and pop-out to white */}
        {splashPhase === "popping" && <div className="splash-circle-pulse" />}
        {(splashPhase === "popping" || splashPhase === "settled") && (
          <div className={`splash-white-burst ${splashPhase === "settled" ? "settled" : ""}`} />
        )}

        {splashPhase === "splash" && (
          <button
            type="button"
            className="splash-skip-btn"
            onClick={skipSplash}
            aria-label="Skip intro animation"
          >
            Skip →
          </button>
        )}

        <main
          className={`intent-screen lang-smooth-transition ${langFading ? "fading" : ""}`}
          lang={effectiveLang}
        >
          <header className={`intent-header header-${splashPhase}`}>
            <div
              className="intent-brand-header"
              onClick={splashPhase === "settled" ? replaySplash : skipSplash}
              title={splashPhase === "settled" ? "Replay intro" : "Skip intro"}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (splashPhase === "settled") replaySplash();
                  else skipSplash();
                }
              }}
            >
              <span className="intent-brand-mark">
                {splashPhase === "splash"
                  ? SPLASH_ITEMS[splashIndex].mark
                  : effectiveLang === "kn"
                    ? "ದಾರಿ"
                    : effectiveLang === "hi"
                      ? "दारी"
                      : "Daari"}
              </span>
            </div>

            {splashPhase === "splash" ? (
              <p key={`sub-${splashIndex}`} className="splash-subtitle-text">
                {SPLASH_ITEMS[splashIndex].sub}
              </p>
            ) : (
              <h1 className="intent-tagline">
                {t("loginHeroTitle")}
              </h1>
            )}

            <div
              className={`small-lang-picker ${splashPhase === "settled" ? "revealed" : splashPhase === "popping" ? "revealing" : "hidden"}`}
              role="radiogroup"
              aria-label={t("chooseLanguage")}
            >
              {LANGUAGE_CHOICES.map((choice) => {
                const isSelected = effectiveLang === choice.lang;
                return (
                  <button
                    key={choice.lang}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    lang={choice.lang}
                    className={`lang-pill ${isSelected ? "lang-pill-active" : ""}`}
                    onClick={() => handleLangChange(choice.lang)}
                  >
                    <span>{choice.label}</span>
                  </button>
                );
              })}
            </div>
          </header>

          <div
            className={`intent-options-grid ${splashPhase === "settled" ? "revealed" : splashPhase === "popping" ? "revealing" : "hidden"}`}
            role="group"
            aria-label={t("intentQuestion")}
          >
            <button
              type="button"
              className="intent-option-card intent-option-seeker"
              onClick={() => {
                setIntent("seeker");
                setStage("phone");
              }}
            >
              <div className="intent-option-top">
                <span className="intent-option-icon" aria-hidden="true">
                  <Icon name="briefcase" size={26} />
                </span>
                <span className="intent-option-badge">{t("intentSeekerBadge")}</span>
              </div>
              <div className="intent-option-body">
                <h2 className="intent-option-title">{t("intentSeekerTitle")}</h2>
                <p className="intent-option-sub">{t("intentSeekerSub")}</p>
              </div>
              <div className="intent-option-action" aria-hidden="true">
                <span>{t("navLogin")}</span>
                <span className="intent-arrow">→</span>
              </div>
            </button>

            <button
              type="button"
              className="intent-option-card intent-option-employer"
              onClick={() => {
                setIntent("employer");
                setStage("phone");
              }}
            >
              <div className="intent-option-top">
                <span className="intent-option-icon intent-icon-emp" aria-hidden="true">
                  <Icon name="tool" size={26} />
                </span>
                <span className="intent-option-badge intent-badge-emp">{t("intentEmployerBadge")}</span>
              </div>
              <div className="intent-option-body">
                <h2 className="intent-option-title">{t("intentEmployerTitle")}</h2>
                <p className="intent-option-sub">{t("intentEmployerSub")}</p>
              </div>
              <div className="intent-option-action intent-action-emp" aria-hidden="true">
                <span>{t("postJobButton")}</span>
                <span className="intent-arrow">→</span>
              </div>
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <Shell>
      <div className="login-layout" lang={effectiveLang}>
        {/* Left / Hero brand panel with animated TabebuiaTree and app concept */}
        <section className="login-brand-panel" aria-label="About Daari">
          <TabebuiaTree className="login-tree" tall />
          <div className="login-brand-content">
            <div className="login-brand-header">
              <span className="login-brand-mark">
                {effectiveLang === "kn" ? "ದಾರಿ" : effectiveLang === "hi" ? "दारी" : "Daari"}
              </span>
              <span className="login-brand-sub">Daari · ದಾರಿ · दारी</span>
            </div>

            <div className="login-hero-block">
              <h1 className="login-hero-title">{t("loginHeroTitle")}</h1>
            </div>

            <div className="login-highlights" role="list">
              <div className="login-highlight-item" role="listitem">
                <span className="login-highlight-icon" aria-hidden="true">
                  <Icon name="mic" size={16} />
                </span>
                <span className="login-highlight-title">{t("loginFeature1Title")}</span>
              </div>

              <div className="login-highlight-item" role="listitem">
                <span className="login-highlight-icon" aria-hidden="true">
                  <Icon name="tool" size={16} />
                </span>
                <span className="login-highlight-title">{t("loginFeature2Title")}</span>
              </div>

              <div className="login-highlight-item" role="listitem">
                <span className="login-highlight-icon" aria-hidden="true">
                  <Icon name="shield" size={16} />
                </span>
                <span className="login-highlight-title">{t("loginFeature3Title")}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right / Login Form Card */}
        <section className="login-form-panel">
          <div className="login-card">
            <div className="intent-nav-bar">
              <button
                type="button"
                className="link-button intent-back-btn"
                onClick={() => setStage("intent")}
              >
                ← {t("loginBack")}
              </button>
              <button
                type="button"
                className="link-button intent-switch-btn"
                onClick={() => setIntent((prev) => (prev === "employer" ? "seeker" : "employer"))}
              >
                {intent === "employer" ? t("intentSwitchToSeeker") : t("intentSwitchToEmployer")}
              </button>
            </div>

            <header className="login-card-head">
              <h2>{intent === "employer" ? t("loginTitleEmployer") : t("loginTitle")}</h2>
              <p>{intent === "employer" ? t("loginSubEmployer") : t("loginSub")}</p>
            </header>

            {!firebaseConfigured && (
              <p className="error-note" role="alert">
                <Icon name="warning" />
                Firebase is not configured. Add <code>NEXT_PUBLIC_FIREBASE_API_KEY</code>,{" "}
                <code>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN</code>, and{" "}
                <code>NEXT_PUBLIC_FIREBASE_PROJECT_ID</code> to your <code>.env</code> file,
                then restart the dev server.
              </p>
            )}

            {/*
              The key prop forces React to replace this div with a brand-new DOM node
              whenever captchaKey changes, so reCAPTCHA never sees a "already rendered"
              element on retry.
            */}
            <div key={captchaKey} ref={captchaContainerRef} />

            {stage === "phone" && (
              <form className="fields" onSubmit={sendOtp} noValidate>
                <label className="field">
                  <span>{t("loginPhone")}</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder={t("loginPhonePlaceholder")}
                    value={phone}
                    disabled={busy || !firebaseConfigured}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={15}
                    required
                  />
                </label>

                {notice && <p className="all-met"><Icon name="check" />{notice}</p>}
                {problem && <p className="error-note" role="alert"><Icon name="warning" />{problem}</p>}

                <div className="row-actions">
                  <button
                    type="submit"
                    className="btn btn-primary login-submit-btn"
                    disabled={busy || !firebaseConfigured || phone.trim().replace(/\D/g, "").length < 10}
                  >
                    {busy ? <span className="spinner" /> : null}
                    {busy ? t("loginSending") : t("loginSendOtp")}
                  </button>
                </div>
              </form>
            )}

            {stage === "otp" && (
              <form className="fields" onSubmit={verifyOtp} noValidate>
                <p className="honest-note">
                  {t("loginOtpSent")} +91 {phone.trim().replace(/\D/g, "").slice(-10)}
                </p>

                <label className="field">
                  <span>{t("loginOtpLabel")}</span>
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="••••••"
                    value={code}
                    disabled={busy}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                  />
                </label>

                {notice && <p className="all-met"><Icon name="check" />{notice}</p>}
                {problem && <p className="error-note" role="alert"><Icon name="warning" />{problem}</p>}

                <div className="row-actions login-otp-actions">
                  <button
                    type="submit"
                    className="btn btn-primary login-submit-btn"
                    disabled={busy || code.length !== 6}
                  >
                    {busy ? <span className="spinner" /> : null}
                    {busy ? t("loginVerifying") : t("loginVerify")}
                  </button>
                  <button type="button" className="btn btn-quiet" disabled={busy} onClick={resend}>
                    {t("loginResend")}
                  </button>
                </div>
              </form>
            )}

            {/* ── Google OAuth ── */}
            <div className="login-divider">
              <span>{t("loginOrGoogle")}</span>
            </div>

            <div className="row-actions">
              <a href={`/api/auth/oauth/google?intent=${intent}`} className="btn btn-quiet login-google">
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M45.5 24.5c0-1.5-.1-3-.4-4.5H24v8.5h12.1c-.5 2.8-2.1 5.1-4.5 6.7v5.6h7.3c4.3-3.9 6.6-9.7 6.6-16.3z" />
                  <path fill="#34A853" d="M24 46c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.6c-2.1 1.4-4.7 2.2-7.6 2.2-5.9 0-10.9-4-12.7-9.3H3.7v5.8C7.7 41.5 15.3 46 24 46z" />
                  <path fill="#FBBC05" d="M11.3 27.5A14.3 14.3 0 0 1 11.3 20.5v-5.8H3.7A23.5 23.5 0 0 0 .5 24c0 3.8.9 7.4 2.5 10.5l8.3-6.4z" />
                  <path fill="#EA4335" d="M24 9.5c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 3 29.5.5 24 .5 15.3.5 7.7 5 3.7 12.2l8.3 6.4c1.8-5.3 6.8-9.1 12-9.1z" />
                </svg>
                {t("loginGoogle")}
              </a>
            </div>

            <p className="honest-note login-privacy">
              <Icon name="shield" size={16} />
              {t("loginPrivacy")}
            </p>
          </div>
        </section>
      </div>
    </Shell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
