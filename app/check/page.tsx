"use client";

import { useState } from "react";
import { useApp } from "@/components/app-state";
import { ErrorNote, Icon, Loading, ReadAloud, Shell, TabebuiaTree } from "@/components/ui";
import { VoiceInput } from "@/components/voice";
import { errorKey, postJson } from "@/lib/client/api";
import type { StringKey } from "@/lib/i18n";

const SIGNAL_LABELS: Record<string, StringKey> = {
  asks_payment: "signalPayment",
  asks_sensitive: "signalSensitive",
  unrealistic: "signalUnrealistic",
  pressure: "signalPressure",
  no_interview: "signalNoInterview",
};

type Result = { warnings: string[]; advice: string | null };

export default function Check() {
  const { ready, t, effectiveLang } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(message: string) {
    setBusy(true);
    setProblem(null);
    setResult(null);
    try {
      setResult(await postJson<Result>("/api/scam", { lang: effectiveLang, text: message }));
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Shell><span /></Shell>;
  const warned = Boolean(result?.warnings.length);
  const spoken = result
    ? warned
      ? [t("warnFound"), ...result.warnings.map((signal) => t(SIGNAL_LABELS[signal])), result.advice ?? t("neverPay")].join(". ")
      : `${t("noWarn")}. ${t("noWarnBody")}`
    : "";
  return (
    <Shell>
      <div className="page">
        <header className="page-head">
          <h1>{t("checkTitle")}</h1>
          <p>{t("checkSub")}</p>
        </header>
        <textarea
          className="message-box"
          rows={6}
          maxLength={6000}
          value={text}
          placeholder={t("checkPlaceholder")}
          aria-label={t("checkPlaceholder")}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="row-actions">
          <button type="button" className="btn btn-primary" disabled={busy || text.trim().length < 5} onClick={() => run(text)}>
            <Icon name="shield" />
            {t("checkButton")}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => { setText(t("exampleMessage")); setResult(null); }}>
            {t("tryExample")}
          </button>
        </div>
        <VoiceInput size="small" label={t("readOut")} onText={(heard) => { setText(heard); run(heard); }} />
        {busy && <Loading text={t("checking")} />}
        {problem && <ErrorNote text={problem} onRetry={() => run(text)} />}
        {result && (
          <section className={`verdict ${warned ? "verdict-warn" : "verdict-clear"}`} aria-live="polite">
            <div className="verdict-head">
              <Icon name={warned ? "warning" : "check"} size={30} />
              <h2>{warned ? t("warnFound") : t("noWarn")}</h2>
            </div>
            {warned ? (
              <>
                <ul className="signal-list">
                  {result.warnings.map((signal) => <li key={signal}>{t(SIGNAL_LABELS[signal])}</li>)}
                </ul>
                <p>{result.advice ?? t("neverPay")}</p>
              </>
            ) : (
              <p>{t("noWarnBody")}</p>
            )}
            <ReadAloud id="verdict" text={spoken} />
          </section>
        )}
        {!result && !busy && !problem && <TabebuiaTree className="empty-tree" />}
      </div>
    </Shell>
  );
}
