"use client";

/**
 * /login: Google sign-in. The button goes to /api/auth/oauth/google, and the callback sets the
 * session cookie and returns to `next`.
 */

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-state";
import { Icon, Shell } from "@/components/ui";
import { ChooseLanguage } from "@/components/welcome";
import { safeNext } from "@/lib/postings";

// useSearchParams needs a Suspense boundary, or the page cannot be built ahead of time.
export function LoginScreen({ google }: { google: boolean }) {
  return (
    <Suspense>
      <LoginForm google={google} />
    </Suspense>
  );
}

function LoginForm({ google }: { google: boolean }) {
  const { ready, lang, t, effectiveLang } = useApp();
  const params = useSearchParams();

  // Someone hiring signs in the same way, then goes straight to their postings.
  const asked = safeNext(params.get("next"));
  const [hiring, setHiring] = useState(asked.startsWith("/employer"));
  const next = hiring && !asked.startsWith("/employer") ? "/employer" : asked;

  if (!ready) return null;
  // Someone new picks their language first, so signing in is already in it.
  if (!lang) return <ChooseLanguage />;

  // The OAuth callback sends people back here with ?error= when Google sign-in fails.
  const failed = Boolean(params.get("error"));

  return (
    <Shell>
      <div className="page" lang={effectiveLang}>
        <header className="page-head">
          {hiring && <p className="login-mode"><Icon name="shop" size={20} />{t("loginHiringMode")}</p>}
          <h1>{hiring ? t("loginHiringTitle") : t("loginTitle")}</h1>
          <p>{t("loginSub")}</p>
        </header>

        {failed && <p className="error-note" role="alert"><Icon name="warning" />{t("loginError")}</p>}

        {google ? (
          <div className="row-actions">
            <a href={`/api/auth/oauth/google?next=${encodeURIComponent(next)}`} className="btn btn-primary login-google">
              <span className="login-google-mark">
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M45.5 24.5c0-1.5-.1-3-.4-4.5H24v8.5h12.1c-.5 2.8-2.1 5.1-4.5 6.7v5.6h7.3c4.3-3.9 6.6-9.7 6.6-16.3z" />
                  <path fill="#34A853" d="M24 46c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.6c-2.1 1.4-4.7 2.2-7.6 2.2-5.9 0-10.9-4-12.7-9.3H3.7v5.8C7.7 41.5 15.3 46 24 46z" />
                  <path fill="#FBBC05" d="M11.3 27.5A14.3 14.3 0 0 1 11.3 20.5v-5.8H3.7A23.5 23.5 0 0 0 .5 24c0 3.8.9 7.4 2.5 10.5l8.3-6.4z" />
                  <path fill="#EA4335" d="M24 9.5c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 3 29.5.5 24 .5 15.3.5 7.7 5 3.7 12.2l8.3 6.4c1.8-5.3 6.8-9.1 12-9.1z" />
                </svg>
              </span>
              {t("loginGoogle")}
            </a>
          </div>
        ) : (
          <p className="error-note" role="alert">
            <Icon name="warning" />
            Sign-in is not set up on this server. Set <code>GOOGLE_SIGNIN=on</code> with the Google keys in <code>.env</code>, then restart.
          </p>
        )}

        {hiring ? (
          <button type="button" className="link-button" onClick={() => setHiring(false)}>{t("loginNotHiring")}</button>
        ) : (
          <section className="login-hiring">
            <h2>{t("loginHiringAsk")}</h2>
            <p>{t("loginHiringBody")}</p>
            <button type="button" className="btn btn-quiet" onClick={() => setHiring(true)}>
              <Icon name="shop" size={20} />
              {t("loginHiringButton")}
            </button>
          </section>
        )}

        <p className="honest-note login-privacy">
          <Icon name="shield" size={16} />
          {t("loginPrivacy")}
        </p>
      </div>
    </Shell>
  );
}
