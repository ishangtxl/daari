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
import { Icon, LanguageSwitcher, Shell, TabebuiaTree } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import type { Lang } from "@/lib/types";

type Stage = "intent" | "phone" | "otp";
type Intent = "seeker" | "employer";

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
  const otpTokenRef = useRef<string | null>(null);
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

  // Create a new RecaptchaVerifier whenever the captcha container remounts or stage changes.
  useEffect(() => {
    if (!ready) return;
    if (!firebaseConfigured) return;
    if (!captchaContainerRef.current) return;

    // Destroy any previous verifier so Firebase doesn't think the element is taken.
    if (verifierRef.current) {
      try { verifierRef.current.clear(); } catch { /* ignore */ }
      verifierRef.current = null;
    }

    try {
      verifierRef.current = new RecaptchaVerifier(
        firebaseAuth,
        captchaContainerRef.current,
        { size: "invisible" },
      );
    } catch (err) {
      console.error("[login] Failed to create RecaptchaVerifier", err);
    }

    return () => {
      // Cleanup on unmount.
      if (verifierRef.current) {
        try { verifierRef.current.clear(); } catch { /* ignore */ }
        verifierRef.current = null;
      }
    };
  }, [ready, captchaKey, stage]);

  const [replayCount, setReplayCount] = useState(0);

  // Splash animation timer: Kannada (0) -> Hindi (1) -> English (2) -> Settled (fast & snappy)
  useEffect(() => {
    if (splashPhase === "settled") return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSplashPhase("settled");
      return;
    }

    setSplashIndex(0);

    const timer1 = setTimeout(() => {
      setSplashIndex(1);
    }, 800);

    const timer2 = setTimeout(() => {
      setSplashIndex(2);
    }, 1600);

    const timer3 = setTimeout(() => {
      setSplashPhase("settled");
    }, 2400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [replayCount]);

  function skipSplash() {
    setSplashPhase("settled");
  }

  function replaySplash() {
    setSplashPhase("splash");
    setReplayCount((c) => c + 1);
  }

  // Smooth cross-fade when language changes
  const prevLangRef = useRef(effectiveLang);
  useEffect(() => {
    if (prevLangRef.current !== effectiveLang) {
      setLangFading(true);
      const timer = setTimeout(() => setLangFading(false), 240);
      prevLangRef.current = effectiveLang;
      return () => clearTimeout(timer);
    }
  }, [effectiveLang]);

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

  // ── Step 1: send OTP via Firebase (with dev fallback for local testing) ────

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

    // Ensure RecaptchaVerifier is initialized if container is available
    if (!verifierRef.current && captchaContainerRef.current && firebaseConfigured) {
      try {
        verifierRef.current = new RecaptchaVerifier(
          firebaseAuth,
          captchaContainerRef.current,
          { size: "invisible" },
        );
      } catch (err) {
        console.error("[login] Failed to initialize RecaptchaVerifier on demand", err);
      }
    }

    setBusy(true);
    setProblem(null);
    setNotice(null);

    // Try Firebase Phone Auth first
    if (firebaseConfigured && verifierRef.current) {
      try {
        const result = await signInWithPhoneNumber(firebaseAuth, e164, verifierRef.current);
        confirmRef.current = result;
        otpTokenRef.current = null;
        setStage("otp");
        setNotice(t("loginOtpSent"));
        setTimeout(() => codeRef.current?.focus(), 80);
        setBusy(false);
        return;
      } catch (err: unknown) {
        console.error("[login] Firebase signInWithPhoneNumber failed", err);
        resetVerifier();

        // In non-production, fall back to local dev OTP so testing with numbers like 8888888888 works immediately!
        if (process.env.NODE_ENV !== "production") {
          try {
            console.warn(`[login] Attempting local dev OTP fallback for ${digits.slice(-10)}`);
            const devRes = await postJson<{ otpToken: string; expiresIn: number; devOtp?: string }>(
              "/api/auth/otp/send",
              { phone: digits.slice(-10) },
            );
            otpTokenRef.current = devRes.otpToken;
            confirmRef.current = null;
            setStage("otp");
            if (devRes.devOtp) {
              setCode(devRes.devOtp);
              setNotice(`${t("loginOtpSent")} (Code: ${devRes.devOtp})`);
            } else {
              setNotice(t("loginOtpSent"));
            }
            setTimeout(() => codeRef.current?.focus(), 80);
            setBusy(false);
            return;
          } catch (devErr) {
            console.error("[login] Dev OTP fallback also failed", devErr);
          }
        }

        const fbCode = (err as { code?: string }).code ?? "";
        const fbMsg = (err as { message?: string }).message ?? "";
        if (fbCode === "auth/invalid-phone-number") {
          setProblem("Invalid mobile number. Please enter a valid 10-digit number.");
        } else if (fbCode === "auth/too-many-requests") {
          setProblem(t("tooMany"));
        } else if (fbCode === "auth/quota-exceeded") {
          setProblem("SMS quota exceeded. Add this phone number under Firebase Authentication → Sign-in method → Phone numbers for testing.");
        } else if (fbCode === "auth/billing-not-enabled") {
          setProblem("SMS delivery requires Firebase Blaze plan or adding this number to Firebase 'Phone numbers for testing'.");
        } else if (fbCode === "auth/operation-not-allowed") {
          setProblem("Phone authentication is not enabled in Firebase Console. Please enable Phone provider in Authentication settings.");
        } else if (fbCode === "auth/app-not-authorized") {
          setProblem("Domain not authorized in Firebase Console. Add localhost to Authorized Domains in Firebase Authentication.");
        } else {
          setProblem(fbMsg || t("loginError"));
        }
        setBusy(false);
        return;
      }
    }

    // If Firebase is not configured but in development mode, use local dev OTP directly
    if (process.env.NODE_ENV !== "production") {
      try {
        const devRes = await postJson<{ otpToken: string; expiresIn: number; devOtp?: string }>(
          "/api/auth/otp/send",
          { phone: digits.slice(-10) },
        );
        otpTokenRef.current = devRes.otpToken;
        confirmRef.current = null;
        setStage("otp");
        if (devRes.devOtp) {
          setCode(devRes.devOtp);
          setNotice(`${t("loginOtpSent")} (Code: ${devRes.devOtp})`);
        } else {
          setNotice(t("loginOtpSent"));
        }
        setTimeout(() => codeRef.current?.focus(), 80);
      } catch (err) {
        console.error("[login] Dev OTP failed", err);
        setProblem(t("loginError"));
      } finally {
        setBusy(false);
      }
      return;
    }

    setProblem(t("loginError"));
    setBusy(false);
  }

  // ── Step 2: verify OTP, exchange for session cookie ─────────────────────────

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmRef.current && !otpTokenRef.current) return;
    setBusy(true);
    setProblem(null);

    try {
      let userPhone: string;
      if (confirmRef.current) {
        const credential = await confirmRef.current.confirm(code.trim());
        const idToken = await credential.user.getIdToken();
        const { user } = await postJson<{ ok: boolean; user: { phone: string; provider: "phone" } }>(
          "/api/auth/firebase",
          { idToken },
        );
        userPhone = user.phone;
      } else if (otpTokenRef.current) {
        const { user } = await postJson<{ ok: boolean; user: { phone: string; provider: "phone" } }>(
          "/api/auth/otp/verify",
          {
            otpToken: otpTokenRef.current,
            code: code.trim(),
          },
        );
        userPhone = user.phone;
      } else {
        throw new Error("No active verification session");
      }

      // Update app-state immediately so the nav bar flips to "Sign out" before redirect.
      update({ user: { id: userPhone, name: null, provider: "phone" } });
      const destination = intent === "employer" ? "/jobs/post" : (params.get("redirect") || "/");
      router.replace(destination);
    } catch (err: unknown) {
      console.error("[login] OTP verification failed", err);
      const fbCode = (err as { code?: string }).code ?? "";
      if (fbCode === "auth/invalid-verification-code") {
        setProblem(t("loginWrongOtp"));
      } else if (fbCode === "auth/code-expired") {
        setProblem(t("loginOtpExpired"));
        setStage("phone");
        setCode("");
        confirmRef.current = null;
        otpTokenRef.current = null;
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
    otpTokenRef.current = null;
    setProblem(null);
    setNotice(null);
    resetVerifier();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (stage === "intent") {
    return (
      <div
        className={`intent-viewport ${splashPhase === "splash" ? "splash-active" : "splash-settled"}`}
        lang={effectiveLang}
      >
        {/* Animated Tabebuia Tree */}
        <TabebuiaTree className="intent-tree" tall />

        {/* Top bar with Language Switcher and Skip button */}
        <div className="intent-topbar">
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
          <LanguageSwitcher />
        </div>

        {/* Main Content Area */}
        <main
          className={`intent-main lang-smooth-transition ${langFading ? "fading" : ""}`}
        >
          {splashPhase === "splash" ? (
            <div className="splash-center-block">
              <span className="splash-brand-mark" key={`mark-${splashIndex}`}>
                {SPLASH_ITEMS[splashIndex].mark}
              </span>
              <p className="splash-sub-text" key={`sub-${splashIndex}`}>
                {SPLASH_ITEMS[splashIndex].sub}
              </p>
            </div>
          ) : (
            <div className="intent-content-block" key={`settled-${replayCount}`}>
              <header className="intent-brand-header">
                <div
                  className="login-brand-header"
                  role="button"
                  tabIndex={0}
                  onClick={replaySplash}
                  title="Replay intro animation"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") replaySplash();
                  }}
                >
                  <span className="login-brand-mark">
                    {effectiveLang === "kn" ? "ದಾರಿ" : effectiveLang === "hi" ? "दारी" : "Daari"}
                  </span>
                  <span className="login-brand-sub">Daari · ದಾರಿ · दारी</span>
                </div>

                <h1 className="login-hero-title">
                  {t("loginHeroTitle")}
                </h1>
              </header>

              {/* Two Direct Bangalore Action Buttons (Clean, Solid White, Tactile) */}
              <div
                className="intent-choices-grid"
                role="group"
                aria-label={t("intentQuestion")}
              >
                <button
                  type="button"
                  className="intent-choice-btn intent-choice-seeker"
                  onClick={() => {
                    setIntent("seeker");
                    setStage("phone");
                  }}
                >
                  <div className="intent-choice-icon" aria-hidden="true">
                    <Icon name="briefcase" size={26} />
                  </div>
                  <div className="intent-choice-text">
                    <span className="intent-choice-title">{t("intentSeekerTitle")}</span>
                    <span className="intent-choice-sub">{t("intentSeekerSub")}</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="intent-choice-btn intent-choice-employer"
                  onClick={() => {
                    setIntent("employer");
                    setStage("phone");
                  }}
                >
                  <div className="intent-choice-icon" aria-hidden="true">
                    <Icon name="tool" size={26} />
                  </div>
                  <div className="intent-choice-text">
                    <span className="intent-choice-title">{t("intentEmployerTitle")}</span>
                    <span className="intent-choice-sub">{t("intentEmployerSub")}</span>
                  </div>
                </button>
              </div>
            </div>
          )}
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
