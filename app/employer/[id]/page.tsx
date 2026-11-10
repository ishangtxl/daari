"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import { StateLine } from "@/components/hiring";
import { ErrorNote, Icon, LANG_LABEL, Loading, PayText, Shell } from "@/components/ui";
import { errorKey, getJson, sendJson } from "@/lib/client/api";
import { shortDate } from "@/lib/client/dates";
import { translate, type StringKey } from "@/lib/i18n";
import { payText, type Applicant, type ApplicantStatus, type PostingSummary } from "@/lib/postings";
import { LANGS, type Lang } from "@/lib/types";

type Posting = PostingSummary & { people: Applicant[] };

const STATUS_TEXT: Record<ApplicantStatus, StringKey> = { new: "ownerNew", shortlisted: "ownerShortlisted", rejected: "ownerRejected", hired: "ownerHired" };
const ACTIONS: { status: ApplicantStatus; label: StringKey }[] = [
  { status: "shortlisted", label: "markShortlisted" },
  { status: "rejected", label: "markRejected" },
  { status: "hired", label: "markHired" },
];

function Person({ posting, person, onStatus }: { posting: Posting; person: Applicant; onStatus: (status: ApplicantStatus) => void }) {
  const { t, effectiveLang } = useApp();
  const { card } = person;
  const answered = posting.body.requirements.filter((req) => typeof card.answers[req.id] === "boolean");
  const yes = answered.filter((req) => card.answers[req.id]).length;
  // The message goes to the applicant, so it is written in the language they use Daari in.
  const hello = translate(card.lang, "whatsappHello", { name: card.name, business: posting.body.form.business, title: posting.body.title[card.lang] });
  const facts: [StringKey, string][] = [
    ["factStudied", card.education],
    ["factWork", card.experience.map((item) => [item.role, item.place, item.years && `${item.years} ${t("years")}`].filter(Boolean).join(", ")).join("; ")],
    ["factSkills", card.skills.join(", ")],
    ["factSpeaks", card.languages.join(", ")],
  ];
  return (
    <li className="applicant" data-status={person.status}>
      <div className="applicant-head">
        <h3>{card.name}</h3>
        <span className="status-pill" data-status={person.status}>{t(STATUS_TEXT[person.status])}</span>
      </div>
      <p className="job-where">{[card.area, t("appliedOn", { date: shortDate(person.at, effectiveLang) })].filter(Boolean).join(" · ")}</p>
      {answered.length > 0 && (
        <>
          <p className="applicant-fit">{yes === answered.length ? t("saysYesAll", { total: answered.length }) : t("saysYes", { met: yes, total: answered.length })}</p>
          <ul className="answer-list">
            {answered.map((req) => (
              <li key={req.id} data-yes={card.answers[req.id] || undefined}>
                <Icon name={card.answers[req.id] ? "check" : "close"} size={18} />
                <span>{req[effectiveLang]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {card.note && <blockquote className="applicant-note"><span>{t("noteFrom")}</span>{card.note}</blockquote>}
      {facts.some(([, value]) => value) && (
        <dl className="facts">
          {facts.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
      <div className="row-actions">
        <a className="btn btn-primary" href={`tel:+91${card.phone}`}><Icon name="phone" size={20} />{t("callApplicant", { phone: card.phone })}</a>
        <a className="btn btn-quiet" href={`https://wa.me/91${card.phone}?text=${encodeURIComponent(hello)}`} target="_blank" rel="noreferrer">{t("shareWhatsapp")}</a>
      </div>
      <div className="status-actions" role="group" aria-label={t("decision")}>
        {ACTIONS.map((action) => (
          <button
            key={action.status}
            type="button"
            className="chip"
            aria-pressed={person.status === action.status}
            onClick={() => onStatus(person.status === action.status ? "new" : action.status)}
          >
            {person.status === action.status && <Icon name="check" size={18} />}
            <span>{t(action.label)}</span>
          </button>
        ))}
      </div>
    </li>
  );
}

function PostingView() {
  const { id } = useParams<{ id: string }>();
  const justPosted = useSearchParams().get("posted") === "1";
  const { t, effectiveLang } = useApp();
  const [posting, setPosting] = useState<Posting | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setPosting((await getJson<{ posting: Posting }>(`/api/employer/postings/${id}`)).posting);
    } catch (error) {
      setProblem(t(errorKey(error)));
    }
  }, [id, t]);
  useEffect(() => { void load(); }, [load]);

  async function setOpen(open: boolean) {
    setBusy(true);
    try {
      await sendJson("PATCH", `/api/employer/postings/${id}`, { open });
      await load();
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(applicationId: string, status: ApplicantStatus) {
    // Shown at once; put back if the server did not take it.
    const before = posting;
    setPosting((current) => current && { ...current, people: current.people.map((person) => (person.id === applicationId ? { ...person, status } : person)) });
    try {
      await sendJson("PATCH", `/api/employer/postings/${id}/applicants/${applicationId}`, { status });
    } catch (error) {
      setPosting(before);
      setProblem(t(errorKey(error)));
    }
  }

  const back = <Link href="/employer" className="back-link"><Icon name="back" size={20} />{t("backToPostings")}</Link>;
  if (problem && !posting) return <div className="page">{back}<ErrorNote text={problem} onRetry={load} /></div>;
  if (!posting) return <div className="page">{back}<Loading text={t("loadingPostings")} /></div>;

  const { body } = posting;
  const link = typeof window === "undefined" ? `/jobs/${id}` : `${window.location.origin}/jobs/${id}`;
  const share = translate(body.form.lang, "shareText", { title: body.title[body.form.lang], business: body.form.business, area: body.form.area, link });
  const open = posting.state === "open";
  const others = LANGS.filter((lang) => lang !== effectiveLang);

  return (
    <div className="page job-page">
      {back}
      {justPosted && open && <p className="all-met posted-note"><Icon name="check" />{t("postedNote")}</p>}
      <header className="job-head">
        <p className="posting-meta"><StateLine posting={posting} /></p>
        <h1>{body.title[effectiveLang]}</h1>
        <p className="job-where">{body.form.business}, {body.form.area}</p>
        <PayText className="job-pay job-pay-large" text={payText(body.form)} />
      </header>

      <div className="row-actions">
        {open && <a className="btn btn-primary" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer"><Icon name="share" size={20} />{t("sharePosting")}</a>}
        {open && <Link className="btn btn-quiet" href={`/jobs/${id}`}>{t("seeAsSeeker")}</Link>}
      </div>
      {posting.state === "hidden" && <p className="error-note"><Icon name="warning" />{t("hiddenNote")}</p>}
      {posting.state === "closed" && <p className="honest-note">{t("closedNote")}</p>}
      {problem && <ErrorNote text={problem} />}

      {/* Who applied matters most once people do, so it comes before the posting's own details. */}
      <section className="applicants">
        <h2>{t("applicantsTitle")}</h2>
        {posting.people.length === 0 ? (
          <p className="empty-text">{open ? t("applicantsEmpty") : t("noApplicantsYet")}</p>
        ) : (
          <ul className="applicant-list">
            {posting.people.map((person) => <Person key={person.id} posting={posting} person={person} onStatus={(status) => setStatus(person.id, status)} />)}
          </ul>
        )}
      </section>

      <section className="posting-details">
        <h2>{t("thePosting")}</h2>
        <p>{body.summary[effectiveLang]}</p>
        {body.timings && <p className="job-timings"><strong>{t("timingsLabel")}:</strong> {body.timings[effectiveLang]}</p>}
        {body.requirements.length > 0 && (
          <>
            <h3>{t("fieldRequirements")}</h3>
            <ul>{body.requirements.map((req) => <li key={req.id}>{req[effectiveLang]}</li>)}</ul>
          </>
        )}
        <div className="seen-as">
          <p>{t("seenAs")}</p>
          <ul>
            {others.map((lang: Lang) => <li key={lang}><span className="seen-lang">{LANG_LABEL[lang]}</span><span lang={lang}>{body.title[lang]}</span></li>)}
          </ul>
        </div>
        {posting.state !== "hidden" && <Link className="btn btn-quiet" href={`/employer/${id}/edit`}>{t("editPosting")}</Link>}
      </section>

      {posting.state !== "hidden" && (
        <div className="row-actions posting-close">
          {open ? (
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setOpen(false)}>{t("closePosting")}</button>
          ) : (
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setOpen(true)}>{posting.state === "expired" ? t("renewPosting") : t("reopenPosting")}</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PostingPage() {
  const { ready } = useApp();
  if (!ready) return <Shell><span /></Shell>;
  // useSearchParams needs a Suspense boundary, or the page cannot be built ahead of time.
  return <Shell><Suspense><PostingView /></Suspense></Shell>;
}
