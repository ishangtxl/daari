"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp, type ApplicationStatus } from "@/components/app-state";
import { CopyButton, ErrorNote, Icon, Loading, PayText, ReadAloud, RouteLine, Shell, TabebuiaTree } from "@/components/ui";
import { errorKey, postJson } from "@/lib/client/api";
import { ROLES } from "@/lib/roles";
import type { MatchedJob } from "@/lib/types";

const isRisky = (job: MatchedJob) => job.signals.asks_payment >= 0.7 || job.signals.asks_sensitive >= 0.7;

function OpenJobs() {
  const { t, effectiveLang, profile, jobs, jobsKey, update } = useApp();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const key = profile.words;

  const load = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await postJson<{ jobs: MatchedJob[]; roles: string[] }>("/api/match", { profile });
      update({ jobs: result.jobs, roles: result.roles, jobsKey: key, plan: null });
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }, [key, profile, t, update]);

  const hasProfile = profile.words.trim().length > 0;
  useEffect(() => {
    // Matches depend on what the person has said, so they are only fetched again when that changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasProfile && (jobs === null || jobsKey !== key)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile, key]);

  if (!hasProfile) {
    return (
      <div className="empty">
        <TabebuiaTree className="empty-tree" />
        <h2>{t("noProfileTitle")}</h2>
        <p>{t("noProfileBody")}</p>
        <Link href="/talk" className="btn btn-primary"><Icon name="mic" />{t("startTalking")}</Link>
      </div>
    );
  }
  if (busy) return <Loading text={t("checkingJobs")} />;
  if (problem) return <ErrorNote text={problem} onRetry={load} />;
  if (!jobs?.length) return <p className="empty-text">{t("noJobs")}</p>;

  return (
    <>
      <ul className="job-list">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link href={`/jobs/${job.id}`} className="job-row">
              <div className="job-row-head">
                <h3>{job.title[effectiveLang]}</h3>
                <PayText className="job-pay" text={job.salaryText} />
              </div>
              <p className="job-where">{job.employer}, {job.area}</p>
              <RouteLine stops={job.stops} />
              <p className="job-meets">{t("meets", { met: job.met, total: job.stops.length })}</p>
              {isRisky(job) && <p className="job-warning"><Icon name="warning" size={18} />{t("warnListing")}</p>}
            </Link>
          </li>
        ))}
      </ul>
      <section className="portals">
        <h2>{t("alsoCheck")}</h2>
        <a href="https://www.ncs.gov.in" target="_blank" rel="noreferrer"><Icon name="external" size={18} />{t("portalNcs")}</a>
        <a href="https://www.apprenticeshipindia.gov.in" target="_blank" rel="noreferrer"><Icon name="external" size={18} />{t("portalNaps")}</a>
        <a href="https://sevasindhu.karnataka.gov.in" target="_blank" rel="noreferrer"><Icon name="external" size={18} />{t("portalSeva")}</a>
      </section>
    </>
  );
}

type Place = { name: string; address: string; phone: string | null; website: string | null; mapsUrl: string | null; rating: number | null };
type Outreach = {
  places: Place[] | null;
  mapsUrl: string;
  draft: { message_en: string; message_local: string; call_script: string; tips: string[] };
};

function Nearby() {
  const { t, effectiveLang, profile, roles } = useApp();
  const [roleId, setRoleId] = useState(roles[0] ?? "mobile_repair");
  const [area, setArea] = useState(profile.area);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Outreach | null>(null);

  async function run() {
    setBusy(true);
    setProblem(null);
    try {
      setResult(await postJson<Outreach>("/api/outreach", { lang: effectiveLang, roleId, area, profile }));
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  const whatsappFor = (phone: string | null, text: string) =>
    `https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(text)}`;

  return (
    <div className="nearby">
      <p className="honest-note">{t("nearbyHonest")}</p>
      <label className="field">
        <span>{t("workType")}</span>
        <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
          {ROLES.filter((role) => role.placesQuery).map((role) => <option key={role.id} value={role.id}>{role[effectiveLang]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t("yourArea")}</span>
        <input value={area} placeholder="Jayanagar" onChange={(event) => setArea(event.target.value)} />
      </label>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>{t("findPlaces")}</button>
      {busy && <Loading text={t("nearbyLoading")} stops={3} />}
      {problem && <ErrorNote text={problem} onRetry={run} />}
      {result && (
        <>
          {result.places?.length ? (
            <ul className="place-list">
              {result.places.map((place, index) => (
                <li key={index}>
                  <h3>{place.name}</h3>
                  <p>{place.address}</p>
                  <div className="row-actions">
                    {place.phone && <a className="btn btn-quiet" href={`tel:${place.phone}`}><Icon name="phone" size={20} />{t("call")}</a>}
                    {place.phone && <a className="btn btn-quiet" href={whatsappFor(place.phone, result.draft.message_en)} target="_blank" rel="noreferrer">{t("shareWhatsapp")}</a>}
                    {place.mapsUrl && <a className="btn btn-quiet" href={place.mapsUrl} target="_blank" rel="noreferrer"><Icon name="external" size={20} />Maps</a>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <a className="btn btn-primary" href={result.mapsUrl} target="_blank" rel="noreferrer"><Icon name="external" />{t("openMaps")}</a>
          )}
          <section className="kit-block">
            <h3>{t("messageForEmployer")}</h3>
            <p>{result.draft.message_en}</p>
            <p className="kit-meaning"><strong>{t("messageMeaning")}:</strong> {result.draft.message_local}</p>
            <div className="row-actions">
              <CopyButton text={result.draft.message_en} />
              <a className="btn btn-quiet" href={whatsappFor(null, result.draft.message_en)} target="_blank" rel="noreferrer">{t("shareWhatsapp")}</a>
              <ReadAloud id="outreach-message" text={result.draft.message_local} />
            </div>
          </section>
          <section className="kit-block">
            <h3>{t("callScript")}</h3>
            <p>{result.draft.call_script}</p>
            <ReadAloud id="outreach-call" text={result.draft.call_script} />
          </section>
          {result.draft.tips.length > 0 && (
            <section className="kit-block">
              <h3>{t("tipsTitle")}</h3>
              <ul>{result.draft.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const STATUSES: ApplicationStatus[] = ["statusApplied", "statusCalled", "statusInterview", "statusOffer", "statusNoReply"];

function Applications() {
  const { t, effectiveLang, applications, update } = useApp();
  if (!applications.length) return <p className="empty-text">{t("appliedEmpty")}</p>;
  return (
    <ul className="application-list">
      {applications.map((item) => (
        <li key={item.jobId}>
          <Link href={`/jobs/${item.jobId}`}><h3>{item.title[effectiveLang]}</h3></Link>
          <p>{item.employer}</p>
          <select
            aria-label={item.title[effectiveLang]}
            value={item.status}
            onChange={(event) => {
              const status = event.target.value as ApplicationStatus;
              update((current) => ({ applications: current.applications.map((entry) => (entry.jobId === item.jobId ? { ...entry, status } : entry)) }));
            }}
          >
            {STATUSES.map((status) => <option key={status} value={status}>{t(status)}</option>)}
          </select>
        </li>
      ))}
    </ul>
  );
}

type Tab = "open" | "nearby" | "applied";

export default function Jobs() {
  const { ready, t } = useApp();
  const [tab, setTab] = useState<Tab>("open");
  if (!ready) return <Shell><span /></Shell>;
  const tabs: { id: Tab; label: string }[] = [
    { id: "open", label: t("tabOpen") },
    { id: "nearby", label: t("tabNearby") },
    { id: "applied", label: t("tabApplied") },
  ];
  return (
    <Shell>
      <div className="page">
        <header className="page-head"><h1>{t("jobsTitle")}</h1></header>
        <div className="tabs" role="tablist">
          {tabs.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>
          ))}
        </div>
        {tab === "open" && <OpenJobs />}
        {tab === "nearby" && <Nearby />}
        {tab === "applied" && <Applications />}
      </div>
    </Shell>
  );
}
