"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, type ApplicationStatus } from "@/components/app-state";
import { Chip, ChipGroup, Sheet } from "@/components/job-controls";
import { CopyButton, ErrorNote, Icon, Loading, PayText, ReadAloud, RouteLine, Shell, TabebuiaTree } from "@/components/ui";
import { FeaturedPetals } from "@/components/featured-petals";
import { errorKey, postJson } from "@/lib/client/api";
import { ROLES } from "@/lib/roles";
import { isRisky, sortJobs, type JobSort } from "@/lib/rank";
import { isFeaturedJob, type MatchedJob } from "@/lib/types";

type DistanceFilter = "all" | "5" | "10" | "20";
type SalaryFilter = "all" | "5000" | "10000" | "20000";

const DISTANCES: DistanceFilter[] = ["all", "5", "10", "20"];
const DISTANCE_LABEL = { all: "anyDistance", "5": "within5", "10": "within10", "20": "within20" } as const;
const SALARIES: SalaryFilter[] = ["all", "5000", "10000", "20000"];
const SALARY_LABEL = { all: "anySalary", "5000": "salary5000Plus", "10000": "salary10000Plus", "20000": "salary20000Plus" } as const;

function OpenJobs() {
  const { t, effectiveLang, profile, jobs, jobsKey, update } = useApp();
  // Pulled out so the featured group and the regular group render identical rows.
  const renderJob = (job: MatchedJob) => {
    const featured = !isRisky(job) && isFeaturedJob(job);
    return (
      <li key={job.id} className={featured ? "job-featured" : undefined}>
        {featured && <FeaturedPetals />}
        <Link href={`/jobs/${job.id}`} className="job-row">
          <div className="job-row-head">
            <div>
              {(featured || job.publisher === "Daari Direct" || job.metadata) && (
                <div className="job-tag-row" style={{ marginBottom: "4px" }}>
                  {featured && <span className="badge-featured"><Icon name="star" size={14} />{t("featuredBadge")}</span>}
                  <span className="badge-direct">{t("directShopBadge")}</span>
                  {job.metadata?.verification?.isVerified && <span className="badge-verified">{t("verifyBadge")}</span>}
                </div>
              )}
              <h3>{job.title[effectiveLang]}</h3>
            </div>
            <PayText className="job-pay" text={job.salaryText} />
          </div>
          <p className="job-where">
            {job.employer}, {job.area}
            {distanceByJobId?.[job.id] != null && <> · {t("distanceAway", { distance: distanceByJobId[job.id]!.toFixed(1) })}</>}
          </p>
          <RouteLine stops={job.stops} />
          <p className="job-meets">{t("meets", { met: job.met, total: job.stops.length })}</p>
          {isRisky(job) && <p className="job-warning"><Icon name="warning" size={18} />{t("warnListing")}</p>}
        </Link>
      </li>
    );
  };
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [location, setLocation] = useState(profile.area);
  useEffect(() => { setLocation(profile.area); }, [profile.area]);
  const [distanceEnabled, setDistanceEnabled] = useState(false);
  const [distanceByJobId, setDistanceByJobId] = useState<Record<string, number | null> | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const distanceRequestRef = useRef(false);
  const [distanceProblem, setDistanceProblem] = useState<string | null>(null);
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>("all");
  const [salaryFilter, setSalaryFilter] = useState<SalaryFilter>("all");
  const [sortBy, setSortBy] = useState<JobSort>("recommended");
  const [sheetOpen, setSheetOpen] = useState(false);
  const key = `${profile.words}\u0000${profile.area.trim().toLocaleLowerCase("en-IN")}`;

  const load = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await postJson<{ jobs: MatchedJob[]; roles: string[]; distanceEnabled?: boolean }>("/api/match", { profile });
      const hasRoutesApi = Boolean(result.distanceEnabled);
      setDistanceEnabled(hasRoutesApi);
      setDistanceByJobId(null);
      setDistanceProblem(null);
      setDistanceFilter("all");
      setSortBy("recommended");
      update({ jobs: result.jobs, roles: result.roles, jobsKey: key, plan: null });
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }, [key, profile, t, update]);

  const loadDistances = useCallback(async () => {
    if (distanceRequestRef.current || !jobs?.length || !profile.area.trim()) return;
    distanceRequestRef.current = true;
    setDistanceLoading(true);
    setDistanceProblem(null);
    try {
      const result = await postJson<{ distances: Record<string, number | null> }>("/api/job-distances", {
        area: profile.area,
        jobs: jobs.map(({ id, area }) => ({ id, area })),
      });
      setDistanceByJobId(result.distances);
    } catch (error) {
      setDistanceProblem(t(errorKey(error)));
      setDistanceFilter("all");
      setSortBy((current) => current === "distance" ? "recommended" : current);
    } finally {
      distanceRequestRef.current = false;
      setDistanceLoading(false);
    }
  }, [jobs, profile.area, t]);

  const hasProfile = profile.words.trim().length > 0;

  useEffect(() => {
    let active = true;
    fetch("/api/job-distances", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check road-distance availability");
        return response.json() as Promise<{ available?: boolean }>;
      })
      .then((result) => {
        if (active) setDistanceEnabled(Boolean(result.available));
      })
      .catch(() => {
        if (active) setDistanceEnabled(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Matches depend on what the person has said and the area they live in.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasProfile && profile.area.trim() && (jobs === null || jobsKey !== key)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile, key]);

  useEffect(() => {
    const needsDistance = distanceFilter !== "all" || sortBy === "distance";
    if (needsDistance && distanceEnabled && jobs?.length && jobsKey === key && distanceByJobId === null && !distanceLoading) {
      void loadDistances();
    }
  }, [distanceFilter, sortBy, distanceEnabled, jobs, jobsKey, key, distanceByJobId, distanceLoading, loadDistances]);

  const waitingForDistance = distanceEnabled && (distanceFilter !== "all" || sortBy === "distance") && distanceByJobId === null && !distanceProblem;

  const { filteredJobs, noPayHidden } = useMemo(() => {
    if (!jobs) return { filteredJobs: [], noPayHidden: 0 };
    let noPay = 0;
    const filtered = jobs.filter((job) => {
      if (distanceFilter !== "all") {
        const distanceKm = distanceByJobId?.[job.id];
        if (distanceKm == null || distanceKm > Number(distanceFilter)) return false;
      }
      if (salaryFilter !== "all") {
        // A job that does not show its pay cannot meet a minimum, so it is hidden, and we say so.
        if (job.salaryMin == null) {
          noPay += 1;
          return false;
        }
        if (job.salaryMin <= Number(salaryFilter)) return false;
      }
      return true;
    });
    return { filteredJobs: sortJobs(filtered, sortBy, distanceByJobId), noPayHidden: noPay };
  }, [jobs, distanceByJobId, distanceFilter, salaryFilter, sortBy]);

  const locationForm = (
    <form
      className="job-location-form"
      onSubmit={(event) => {
        event.preventDefault();
        const area = location.trim();
        if (!area || area.toLocaleLowerCase("en-IN") === profile.area.trim().toLocaleLowerCase("en-IN")) return;
        update({ profile: { ...profile, area }, jobs: null, jobsKey: "", plan: null });
      }}
    >
      <label className="field">
        <span>{t("jobLocation")}</span>
        <input value={location} placeholder={t("locationPlaceholder")} onChange={(event) => setLocation(event.target.value)} />
      </label>
      <button type="submit" className="btn btn-quiet" disabled={!location.trim() || location.trim().toLocaleLowerCase("en-IN") === profile.area.trim().toLocaleLowerCase("en-IN") || busy}>
        {profile.area ? t("updateArea") : t("saveLocation")}
      </button>
    </form>
  );

  const activeCount = (distanceFilter !== "all" ? 1 : 0) + (salaryFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setDistanceFilter("all");
    setSalaryFilter("all");
    setSortBy("recommended");
  };

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

  if (!profile.area.trim()) {
    return (
      <section className="job-location-intro">
        <h2>{t("jobLocationTitle")}</h2>
        <p>{t("jobLocationBody")}</p>
        {locationForm}
      </section>
    );
  }
  if (problem) return <ErrorNote text={problem} onRetry={load} />;
  if (busy || jobs === null || jobsKey !== key) return <Loading text={t("checkingJobs")} />;
  if (!jobs.length) return <p className="empty-text">{t("noJobs")}</p>;

  return (
    <>
      <div className="job-post-banner">
        <div className="job-post-banner-copy">
          <h3>{t("postJobBannerTitle")}</h3>
          <p>{t("postJobBannerSub")}</p>
        </div>
        <Link href="/jobs/post" className="btn btn-primary job-post-banner-btn">
          <Icon name="tool" size={18} />
          <span>{t("postJobButton")}</span>
        </Link>
      </div>

      {locationForm}
      <section className="job-controls" aria-label={t("jobFilters")}>
        <ChipGroup label={t("sortBy")}>
          <Chip selected={sortBy === "recommended"} icon="star" onClick={() => setSortBy("recommended")}>{t("chipBest")}</Chip>
          {distanceEnabled && <Chip selected={sortBy === "distance"} icon="pin" onClick={() => setSortBy("distance")}>{t("chipNear")}</Chip>}
          <Chip selected={sortBy === "qualification"} icon="tool" onClick={() => setSortBy("qualification")}>{t("eligibilitySort")}</Chip>
          <Chip selected={sortBy === "salary"} icon="rupee" onClick={() => setSortBy("salary")}>{t("chipPay")}</Chip>
          <Chip selected={sortBy === "featured"} icon="star" onClick={() => setSortBy("featured")}>{t("chipFeatured")}</Chip>
        </ChipGroup>
        <button type="button" className="btn btn-quiet filter-button" onClick={() => setSheetOpen(true)}>
          <Icon name="filter" size={22} />
          <span>{t("filterButton")}</span>
          {activeCount > 0 && <span className="filter-badge" aria-label={String(activeCount)}>{activeCount}</span>}
        </button>
      </section>
      {(sortBy === "recommended" || sortBy === "qualification") && (
        <p className="sort-explanation">
          {sortBy === "recommended" ? t("sortBestHint") : t("sortRequirementsHint")}
        </p>
      )}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("filterSheetTitle")} closeLabel={t("close")}>
        {distanceEnabled && (
          <ChipGroup label={t("howFar")}>
            {DISTANCES.map((value) => <Chip key={value} selected={distanceFilter === value} onClick={() => setDistanceFilter(value)}>{t(DISTANCE_LABEL[value])}</Chip>)}
          </ChipGroup>
        )}
        <ChipGroup label={t("monthlyPay")}>
          {SALARIES.map((value) => <Chip key={value} selected={salaryFilter === value} onClick={() => setSalaryFilter(value)}>{t(SALARY_LABEL[value])}</Chip>)}
        </ChipGroup>
        {salaryFilter !== "all" && noPayHidden > 0 && <p className="honest-note">{t("noPayHidden", { count: noPayHidden })}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={() => setSheetOpen(false)}>
            {waitingForDistance || distanceLoading ? t("showJobsLoading") : t("showJobsButton", { count: filteredJobs.length })}
          </button>
          {activeCount > 0 && <button type="button" className="link-button" onClick={() => { setDistanceFilter("all"); setSalaryFilter("all"); }}>{t("clearFilters")}</button>}
        </div>
      </Sheet>
      {activeCount > 0 && (
        <div className="active-filters">
          {distanceFilter !== "all" && (
            <button type="button" className="chip chip-remove" aria-label={t("removeFilter", { name: t(DISTANCE_LABEL[distanceFilter]) })} onClick={() => setDistanceFilter("all")}>
              <span>{t(DISTANCE_LABEL[distanceFilter])}</span><Icon name="close" size={18} />
            </button>
          )}
          {salaryFilter !== "all" && (
            <button type="button" className="chip chip-remove" aria-label={t("removeFilter", { name: t(SALARY_LABEL[salaryFilter]) })} onClick={() => setSalaryFilter("all")}>
              <span>{t(SALARY_LABEL[salaryFilter])}</span><Icon name="close" size={18} />
            </button>
          )}
          <button type="button" className="link-button" onClick={clearFilters}>{t("clearFilters")}</button>
        </div>
      )}
      {distanceProblem && <ErrorNote text={distanceProblem} onRetry={loadDistances} />}
      {waitingForDistance || distanceLoading ? <Loading text={t("calculatingDistances")} stops={3} /> : filteredJobs.length ? (

        <>
          <p className="job-results-count">{t("showingJobs", { count: filteredJobs.length })}</p>
          {distanceByJobId !== null && <p className="distance-attribution">{t("distanceAttribution")} · <span translate="no">Google Maps · Powered by Google, ©2026 Google</span></p>}
          <ul className="job-list">{filteredJobs.map(renderJob)}</ul>
        </>
      ) : (
        <div className="empty-filter-results">
          <p>{t("filteredNoJobs")}</p>
          {distanceByJobId !== null && <p className="distance-attribution">{t("distanceAttribution")} · <span translate="no">Google Maps · Powered by Google, ©2026 Google</span></p>}
          <button type="button" className="btn btn-quiet" onClick={clearFilters}>{t("clearFilters")}</button>
        </div>
      )}
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
  useEffect(() => { setArea(profile.area); }, [profile.area]);
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
