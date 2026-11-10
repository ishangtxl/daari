"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp, type PlanStep } from "@/components/app-state";
import { DirectApply, type PostingView } from "@/components/direct-apply";
import { PlanSteps } from "@/components/plan-steps";
import { CopyButton, ErrorNote, Icon, Loading, PayText, ReadAloud, Shell } from "@/components/ui";
import { VoiceInput } from "@/components/voice";
import { ApiError, errorKey, getJson, postJson } from "@/lib/client/api";
import { isPostingId } from "@/lib/postings";
import type { MatchedJob, Profile, StopStatus } from "@/lib/types";

type Kit = {
  message_en: string;
  message_local: string;
  call_script: string;
  documents: string[];
  questions: { question: string; tip: string }[];
};

function Practice({ question }: { question: string }) {
  const { t, effectiveLang, profile } = useApp();
  const [feedback, setFeedback] = useState<{ good: string; better: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="practice">
      <VoiceInput
        size="small"
        label={t("practiceAnswer")}
        onText={async (answer) => {
          setBusy(true);
          setProblem(null);
          try {
            const result = await postJson<{ feedback: { good: string; better: string } }>("/api/interview-feedback", { lang: effectiveLang, question, answer, profile });
            setFeedback(result.feedback);
          } catch (error) {
            setProblem(t(errorKey(error)));
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <Loading text={t("thinking")} />}
      {problem && <ErrorNote text={problem} />}
      {feedback && (
        <dl className="feedback">
          <div><dt>{t("whatWasGood")}</dt><dd>{feedback.good}</dd></div>
          <div><dt>{t("whatToImprove")}</dt><dd>{feedback.better}</dd></div>
        </dl>
      )}
    </div>
  );
}

/** A posting opened from a link, not from the person's matches: its stops come from their own answers. */
function asMatched(job: PostingView["job"], confirmed: Profile["confirmed"]): MatchedJob {
  const stops = job.requirements.map((req) => ({ id: req.id, status: (confirmed[req.en] === true ? "met" : confirmed[req.en] === false ? "gap" : "unsure") as StopStatus }));
  return { ...job, stops, fit: 0.5, met: stops.filter((stop) => stop.status === "met").length };
}

function ApplyKit({ job }: { job: MatchedJob }) {
  const { t, effectiveLang, profile, applications, update } = useApp();
  const [kit, setKit] = useState<Kit | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const applied = applications.some((item) => item.jobId === job.id);

  async function load() {
    setBusy(true);
    setProblem(null);
    try {
      const result = await postJson<{ kit: Kit }>("/api/apply-kit", { lang: effectiveLang, jobId: job.id, profile });
      setKit(result.kit);
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  const applyButtons = (
    <div className="row-actions">
      {job.applyLink && <a className={`btn ${kit ? "btn-primary" : "btn-quiet"}`} href={job.applyLink} target="_blank" rel="noreferrer"><Icon name="external" />{t("openApply")}</a>}
      <button
        type="button"
        className="btn btn-quiet"
        disabled={applied}
        onClick={() =>
          update((current) => ({
            applications: [
              { jobId: job.id, title: job.title, employer: job.employer, applyLink: job.applyLink, status: "statusApplied", at: new Date().toISOString() },
              ...current.applications,
            ],
          }))
        }
      >
        {applied && <Icon name="check" size={20} />}
        {applied ? t("statusApplied") : t("markApplied")}
      </button>
    </div>
  );

  return (
    <section className="apply">
      <h2>{job.direct ? t("prepareTitle") : t("applyTitle")}</h2>
      <p className="honest-note">{job.direct ? t("prepareHonest") : t("applyHonest")}</p>
      {!kit && !busy && <button type="button" className="btn btn-primary" onClick={load}>{t("makeKit")}</button>}
      {busy && <Loading text={t("kitLoading")} />}
      {problem && <ErrorNote text={problem} onRetry={load} />}
      {kit && (
        <>
          <section className="kit-block">
            <h3>{t("messageForEmployer")}</h3>
            <p>{kit.message_en}</p>
            <p className="kit-meaning"><strong>{t("messageMeaning")}:</strong> {kit.message_local}</p>
            <div className="row-actions">
              <CopyButton text={kit.message_en} />
              <a className="btn btn-quiet" href={`https://wa.me/?text=${encodeURIComponent(kit.message_en)}`} target="_blank" rel="noreferrer">{t("shareWhatsapp")}</a>
              <ReadAloud id="kit-message" text={kit.message_local} />
            </div>
          </section>
          <section className="kit-block">
            <h3>{t("callScript")}</h3>
            <p>{kit.call_script}</p>
            <ReadAloud id="kit-call" text={kit.call_script} />
          </section>
          {kit.documents.length > 0 && (
            <section className="kit-block">
              <h3>{t("carry")}</h3>
              <ul>{kit.documents.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </section>
          )}
          {!job.direct && applyButtons}
          {kit.questions.length > 0 && (
            <section className="kit-block">
              <h3>{t("interviewTitle")}</h3>
              <ol className="question-list">
                {kit.questions.map((item, index) => (
                  <li key={index}>
                    <p className="question">{item.question}</p>
                    <p className="question-tip"><strong>{t("tip")}:</strong> {item.tip}</p>
                    <ReadAloud id={`question-${index}`} text={item.question} />
                    <Practice question={item.question} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
      {!kit && !job.direct && applyButtons}
    </section>
  );
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { ready, t, effectiveLang, jobs, profile, update } = useApp();
  const [steps, setSteps] = useState<PlanStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A job posted on Daari is always read fresh, so a closed job or an employer's answer shows at once.
  const direct = isPostingId(id);
  const [view, setView] = useState<PostingView | "gone" | "failed" | null>(null);
  useEffect(() => {
    if (!direct) return;
    let active = true;
    getJson<PostingView>(`/api/postings/${id}`)
      .then((result) => { if (active) setView(result); })
      .catch((error) => { if (active) setView(error instanceof ApiError && error.code === "not_found" ? "gone" : "failed"); });
    return () => { active = false; };
  }, [direct, id]);

  if (!ready) return <Shell><span /></Shell>;
  const back = <Link href="/jobs" className="back-link"><Icon name="back" size={20} />{t("backToJobs")}</Link>;
  if (direct && view === null) return <Shell><div className="page">{back}<Loading text={t("loadingJob")} /></div></Shell>;
  if (view === "gone") return <Shell><div className="page">{back}<p className="empty-text">{t("postingGone")}</p></div></Shell>;
  const posting = view && typeof view === "object" ? view : null;
  const listed = jobs?.find((item) => item.id === id);
  // Listed matches carry Jev's checks; the posting itself carries what is true now.
  const job = posting ? { ...(listed ?? asMatched(posting.job, profile.confirmed)), ...posting.job } : listed;
  if (!job) return <Shell><div className="page">{back}<p className="empty-text">{view === "failed" ? t("genericError") : t("noProfileBody")}</p></div></Shell>;

  const statusOf = (reqId: string): StopStatus => job.stops.find((stop) => stop.id === reqId)?.status ?? "unsure";
  const order: Record<StopStatus, number> = { met: 0, unsure: 1, gap: 2 };
  const requirements = [...job.requirements].sort((a, b) => order[statusOf(a.id)] - order[statusOf(b.id)]);
  const gaps = job.requirements.filter((req) => statusOf(req.id) !== "met");
  const warnings = [
    job.signals.asks_payment >= 0.7 && t("signalPayment"),
    job.signals.asks_sensitive >= 0.7 && t("signalSensitive"),
  ].filter(Boolean) as string[];

  function answer(requirement: string, value: boolean) {
    // The answer applies everywhere the same requirement appears, across all matched jobs.
    update((current) => ({
      profile: { ...current.profile, confirmed: { ...current.profile.confirmed, [requirement]: value } },
      plan: null,
      jobs:
        current.jobs?.map((item) => {
          const stops = item.stops.map((stop) => {
            const req = item.requirements.find((entry) => entry.id === stop.id);
            return req?.en === requirement ? { ...stop, status: (value ? "met" : "gap") as StopStatus } : stop;
          });
          return { ...item, stops, met: stops.filter((stop) => stop.status === "met").length };
        }) ?? null,
    }));
  }

  async function loadPlan() {
    setBusy(true);
    setProblem(null);
    try {
      const result = await postJson<{ steps: PlanStep[] }>("/api/plan", { lang: effectiveLang, gaps: gaps.map((req) => req.en), work: job!.title.en });
      setSteps(result.steps);
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  const spoken = `${job.title[effectiveLang]}. ${job.summary[effectiveLang]}. ${job.salaryText ?? ""}`;
  return (
    <Shell>
      <div className="page job-page">
        {back}
        <header className="job-head">
          <h1>{job.title[effectiveLang]}</h1>
          {job.direct && <p className="direct-badge"><Icon name="check" size={16} />{t("directBadge")}</p>}
          <p className="job-where">{job.employer}, {job.area}</p>
          <PayText className="job-pay job-pay-large" text={job.salaryText} />
          <p>{job.summary[effectiveLang]}</p>
          {job.timings && <p className="job-timings"><strong>{t("timingsLabel")}:</strong> {job.timings[effectiveLang]}</p>}
          <ReadAloud id={`job-${job.id}`} text={spoken} />
        </header>

        {warnings.length > 0 && (
          <section className="verdict verdict-warn">
            <div className="verdict-head"><Icon name="warning" size={28} /><h2>{t("warnListing")}</h2></div>
            <ul className="signal-list">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            <p>{t("neverPay")}</p>
          </section>
        )}
        {/* High pay alone fires on real delivery jobs, so this is a prompt to check and not a red warning. */}
        {job.signals.unrealistic >= 0.7 && !warnings.length && <p className="honest-note">{t("signalUnrealistic")}. {t("neverPay")}</p>}
        {job.genderRestriction && <p className="honest-note">{t("genderOnly", { gender: t(job.genderRestriction) })}</p>}

        {/* A job posted on Daari can be applied for right here, so that comes before everything else. */}
        {posting && <DirectApply view={posting} stops={job.stops} onChange={setView} />}

        <section className="way">
          <h2>{t("routeTitle")}</h2>
          <p className="job-meets">{job.stops.length ? t("meets", { met: job.met, total: job.stops.length }) : t("noRequirements")}</p>
          <ol className="way-line">
            {requirements.map((req) => {
              const status = statusOf(req.id);
              return (
                <li key={req.id} className={`way-stop is-${status}`}>
                  <span className="way-dot" aria-hidden="true" />
                  <div>
                    <p className="way-text">{req[effectiveLang]}</p>
                    <p className="way-status">{status === "met" ? t("stopMet") : status === "gap" ? t("stopGap") : t("stopUnsure")}</p>
                    {status !== "met" && (
                      <div className="yes-no">
                        {status === "unsure" && <button type="button" className="btn btn-quiet" onClick={() => answer(req.en, true)}>{t("yes")}</button>}
                        {status === "unsure" && <button type="button" className="btn btn-quiet" onClick={() => answer(req.en, false)}>{t("no")}</button>}
                        {status === "gap" && <button type="button" className="link-button" onClick={() => answer(req.en, true)}>{t("iHaveThis")}</button>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
            <li className="way-stop way-end">
              <span className="way-dot" aria-hidden="true" />
              <div><p className="way-text">{job.title[effectiveLang]}</p></div>
            </li>
          </ol>
          {gaps.length > 0 ? (
            !steps && !busy && <button type="button" className={job.direct ? "btn btn-quiet" : "btn btn-primary"} onClick={loadPlan}>{t("closeGaps")}</button>
          ) : (
            <p className="all-met"><Icon name="check" />{t("noGaps")}</p>
          )}
          {busy && <Loading text={t("planLoading")} />}
          {problem && <ErrorNote text={problem} onRetry={loadPlan} />}
          {steps && (
            <>
              <h2>{t("planTitle")}</h2>
              <PlanSteps steps={steps} idPrefix={`plan-${job.id}`} />
            </>
          )}
        </section>

        {view === "failed" && <ErrorNote text={t("genericError")} />}
        <ApplyKit job={job} />
        <p className="source-note">{t("postedOn", { source: job.publisher })}</p>
      </div>
    </Shell>
  );
}
