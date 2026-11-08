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
import { Icon, Shell } from "@/components/ui";
import { postJson } from "@/lib/client/api";

type Stage = "phone" | "otp";

// useSearchParams needs a Suspense boundary, or the page cannot be built ahead of time.
export function LoginScreen({ google }: { google: boolean }) {
  return (
    <Suspense>
      <LoginForm google={google} />
    </Suspense>
  );
}

function LoginForm({ google }: { google: boolean }) {
  const { ready, t, effectiveLang, update } = useApp();
  const router = useRouter();
  const params = useSearchParams();

  const [stage, setStage] = useState<Stage>("phone");
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
      router.replace("/");
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

  return (
    <Shell>
      <div className="page" lang={effectiveLang}>
        <header className="page-head">
          <h1>{t("loginTitle")}</h1>
          <p>{t("loginSub")}</p>
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
                className="btn btn-primary"
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

            <div className="row-actions">
              <button
                type="submit"
                className="btn btn-primary"
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

        {/* ── Google OAuth, shown only once Google accepts this site's address (GOOGLE_SIGNIN=on) ── */}
        {google ? (
          <>
            <div className="login-divider">
              <span>{t("loginOrGoogle")}</span>
            </div>

            <div className="row-actions">
              <a href="/api/auth/oauth/google" className="btn btn-quiet login-google">
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M45.5 24.5c0-1.5-.1-3-.4-4.5H24v8.5h12.1c-.5 2.8-2.1 5.1-4.5 6.7v5.6h7.3c4.3-3.9 6.6-9.7 6.6-16.3z" />
                  <path fill="#34A853" d="M24 46c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.6c-2.1 1.4-4.7 2.2-7.6 2.2-5.9 0-10.9-4-12.7-9.3H3.7v5.8C7.7 41.5 15.3 46 24 46z" />
                  <path fill="#FBBC05" d="M11.3 27.5A14.3 14.3 0 0 1 11.3 20.5v-5.8H3.7A23.5 23.5 0 0 0 .5 24c0 3.8.9 7.4 2.5 10.5l8.3-6.4z" />
                  <path fill="#EA4335" d="M24 9.5c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 3 29.5.5 24 .5 15.3.5 7.7 5 3.7 12.2l8.3 6.4c1.8-5.3 6.8-9.1 12-9.1z" />
                </svg>
                {t("loginGoogle")}
              </a>
            </div>
          </>
        ) : null}

        <p className="honest-note login-privacy">
          <Icon name="shield" size={16} />
          {t("loginPrivacy")}
        </p>
      </div>
    </Shell>
  );
}
