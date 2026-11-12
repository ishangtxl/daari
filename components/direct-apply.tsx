"use client";

import Link from "next/link";
import { useState } from "react";
import { errorKey, postJson, sendJson } from "@/lib/client/api";
import { shortDate } from "@/lib/client/dates";
import type { StringKey } from "@/lib/i18n";
import { applicantCardSchema, REPORT_REASONS, type MyApplication, type PostingState, type ReportReason } from "@/lib/postings";
import type { Job, StopStatus } from "@/lib/types";
import { useApp } from "./app-state";
import { ErrorNote, Icon, Sheet } from "./ui";

export type PostingView = { job: Omit<Job, "description">; state: PostingState; own: boolean; application: MyApplication | null };

const REASON_TEXT: Record<ReportReason, StringKey> = { asks_money: "reportAsksMoney", fake: "reportFake", rude: "reportRude", other: "reportOther" };

/** What the person sees about their application, in words rather than a status code. */
export function applicationText(application: MyApplication): StringKey {
  if (application.status === "hired") return "appHired";
  if (application.status === "shortlisted") return "appShortlisted";
  if (application.status === "rejected") return "appRejected";
  if (application.postingState !== "open") return "jobClosedNow";
  return application.seen ? "appSeen" : "appWaiting";
}

function ApplyForm({ view, stops, onSent }: { view: PostingView; stops: { id: string; status: StopStatus }[]; onSent: (application: MyApplication) => void }) {
  const { t, effectiveLang, profile, user, update } = useApp();
  const { job } = view;
  const signedInPhone = user?.provider === "phone" ? user.id.replace(/^\+91/, "") : "";
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone || signedInPhone);
  const [note, setNote] = useState("");
  // Start from what the person already told Daari or Daari is sure of. A requirement Daari only
  // thinks they lack stays unanswered: guessing "no" for them would sell them short.
  const [answers, setAnswers] = useState<Record<string, boolean>>(() => {
    const start: Record<string, boolean> = {};
    for (const req of job.requirements) {
      const confirmed = profile.confirmed[req.en];
      const status = stops.find((stop) => stop.id === req.id)?.status;
      if (typeof confirmed === "boolean") start[req.id] = confirmed;
      else if (status === "met") start[req.id] = true;
    }
    return start;
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const card = {
    name, phone, note, lang: effectiveLang, answers,
    area: profile.area, education: profile.education, skills: profile.skills.slice(0, 20), experience: profile.experience.slice(0, 8), languages: profile.languages,
  };
  const parsed = applicantCardSchema.safeParse(card);
  const unanswered = job.requirements.filter((req) => typeof answers[req.id] !== "boolean");
  const shared = [
    profile.area && [t("yourArea"), profile.area],
    profile.education && [t("factStudied"), profile.education],
    profile.experience.length > 0 && [t("factWork"), profile.experience.map((item) => [item.role, item.place].filter(Boolean).join(", ")).join("; ")],
    profile.skills.length > 0 && [t("factSkills"), profile.skills.join(", ")],
    profile.languages.length > 0 && [t("factSpeaks"), profile.languages.join(", ")],
  ].filter(Boolean) as [string, string][];

  async function send() {
    setTried(true);
    if (!parsed.success || unanswered.length) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await postJson<{ application: MyApplication }>(`/api/postings/${job.id}/apply`, parsed.data);
      update((current) => ({
        profile: {
          ...current.profile,
          name: current.profile.name || name.trim(),
          phone: current.profile.phone || parsed.data.phone,
          // Their answers count everywhere the same requirement appears, as on any job page.
          confirmed: { ...current.profile.confirmed, ...Object.fromEntries(job.requirements.map((req) => [req.en, answers[req.id]])) },
        },
        applications: [
          { jobId: job.id, title: job.title, employer: job.employer, applyLink: "", status: "statusApplied", at: new Date().toISOString() },
          ...current.applications.filter((item) => item.jobId !== job.id),
        ],
      }));
      onSent(result.application);
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  const nameMissing = tried && !name.trim();
  const phoneWrong = tried && !applicantCardSchema.shape.phone.safeParse(phone).success;
  return (
    <div className="apply-form">
      <p className="muted">{t("applySheetSub", { business: job.employer })}</p>
      <label className="field">
        <span>{t("yourName")}</span>
        <input value={name} autoComplete="name" aria-invalid={nameMissing || undefined} onChange={(event) => setName(event.target.value)} />
        {nameMissing && <small className="field-problem">{t("fillThisIn")}</small>}
      </label>
      <label className="field">
        <span>{t("yourPhone")}</span>
        <input type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} aria-invalid={phoneWrong || undefined} onChange={(event) => setPhone(event.target.value)} />
        {phoneWrong ? <small className="field-problem">{t("needPhone")}</small> : <small className="field-hint">{t("phoneHint")}</small>}
      </label>

      {job.requirements.length > 0 && (
        <fieldset className="field answer-fields">
          <legend>{t("answerEach")}</legend>
          <ul>
            {job.requirements.map((req) => (
              <li key={req.id} data-missing={(tried && typeof answers[req.id] !== "boolean") || undefined}>
                <p>{req[effectiveLang]}</p>
                <div className="yes-no">
                  {[true, false].map((value) => (
                    <button key={String(value)} type="button" className="chip" aria-pressed={answers[req.id] === value} onClick={() => setAnswers((current) => ({ ...current, [req.id]: value }))}>
                      {answers[req.id] === value && <Icon name="check" size={18} />}
                      <span>{value ? t("yes") : t("no")}</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {tried && unanswered.length > 0 && <small className="field-problem">{t("answerAllFirst")}</small>}
        </fieldset>
      )}

      <label className="field">
        <span>{t("noteLabel")}</span>
        <textarea rows={2} value={note} maxLength={600} placeholder={t("notePlaceholder")} onChange={(event) => setNote(event.target.value)} />
      </label>

      <section className="shared-preview">
        <h3>{t("whatTheySee")}</h3>
        {shared.length ? (
          <dl className="facts">{shared.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        ) : (
          <p className="muted">{t("sharedNothing")} <Link href="/talk">{t("startTalking")}</Link></p>
        )}
      </section>

      {problem && <ErrorNote text={problem} />}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={send}>
        {busy && <span className="spinner" />}
        {t("sendApplication", { business: job.employer })}
      </button>
    </div>
  );
}

function Report({ jobId }: { jobId: string }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function send() {
    if (!reason) return;
    setProblem(null);
    try {
      await postJson(`/api/postings/${jobId}/report`, { reason });
      setDone(true);
    } catch (error) {
      setProblem(t(errorKey(error)));
    }
  }
  return (
    <>
      <button type="button" className="link-button report-link" onClick={() => setOpen(true)}><Icon name="flag" size={18} />{t("reportPosting")}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("reportTitle")} closeLabel={t("close")}>
        {done ? (
          <p className="all-met"><Icon name="check" />{t("reportThanks")}</p>
        ) : (
          <>
            <div className="chip-row report-reasons" role="group" aria-label={t("reportTitle")}>
              {REPORT_REASONS.map((item) => (
                <button key={item} type="button" className="chip" aria-pressed={reason === item} onClick={() => setReason(item)}>
                  {reason === item && <Icon name="check" size={18} />}
                  <span>{t(REASON_TEXT[item])}</span>
                </button>
              ))}
            </div>
            {problem && <ErrorNote text={problem} />}
            <div className="sheet-actions">
              <button type="button" className="btn btn-primary" disabled={!reason} onClick={send}>{t("reportSend")}</button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

/**
 * Applying to a job posted on Daari. The person sees exactly what goes to the employer before it
 * goes, can take it back later, and hears back here when the employer answers.
 */
export function DirectApply({ view, stops, onChange }: { view: PostingView; stops: { id: string; status: StopStatus }[]; onChange: (view: PostingView) => void }) {
  const { t, effectiveLang, update } = useApp();
  const [sheet, setSheet] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { job, application } = view;

  async function withdraw() {
    setProblem(null);
    try {
      await sendJson("DELETE", `/api/postings/${job.id}/apply`);
      update((current) => ({ applications: current.applications.filter((item) => item.jobId !== job.id) }));
      onChange({ ...view, application: null });
    } catch (error) {
      setProblem(t(errorKey(error)));
    }
  }

  if (view.own) {
    return (
      <section className="apply direct-apply">
        <p className="honest-note">{t("ownPosting")}</p>
        <Link href={`/employer/${job.id}`} className="btn btn-quiet">{t("viewMyPosting")}</Link>
      </section>
    );
  }

  return (
    <section className="apply direct-apply">
      <h2>{t("applyDirectTitle")}</h2>
      {application ? (
        <div className={`verdict ${application.status === "rejected" ? "verdict-quiet" : "verdict-clear"}`} role="status">
          <div className="verdict-head"><Icon name={application.status === "rejected" ? "compass" : "check"} size={26} /><h3>{t("sentTo", { business: job.employer, date: shortDate(application.at, effectiveLang) })}</h3></div>
          <p>{t(applicationText(application))}</p>
          {application.status === "rejected" && <Link href="/jobs" className="link-button">{t("backToJobs")}</Link>}
          {application.status !== "hired" && <button type="button" className="link-button danger" onClick={withdraw}>{t("withdraw")}</button>}
        </div>
      ) : view.state === "open" ? (
        <>
          <p>{t("directNote", { business: job.employer })}</p>
          <button type="button" className="btn btn-primary" onClick={() => setSheet(true)}>{t("applyNow")}</button>
        </>
      ) : (
        <p className="honest-note">{t("jobClosedNow")}</p>
      )}
      {problem && <ErrorNote text={problem} />}
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t("applySheetTitle")} closeLabel={t("close")}>
        {sheet && (
          <ApplyForm
            view={view}
            stops={stops}
            onSent={(sent) => {
              setSheet(false);
              onChange({ ...view, application: sent });
            }}
          />
        )}
      </Sheet>
      <Report jobId={job.id} />
    </section>
  );
}
