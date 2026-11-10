"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import { Icon, Shell } from "@/components/ui";
import type { StringKey } from "@/lib/i18n";
import { APPLICANT_STATUSES, type Applicant, type ApplicantStatus, type ListingApplicants } from "@/lib/types";

const STATUS_LABEL: Record<ApplicantStatus, StringKey> = {
  new: "applicantStatusNew",
  shortlisted: "applicantStatusShortlisted",
  rejected: "applicantStatusRejected",
  hired: "applicantStatusHired",
};

function ApplicantCard({ applicant, onStatus }: { applicant: Applicant; onStatus: (status: ApplicantStatus) => void }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const topSkills = applicant.skills.slice(0, 3);
  return (
    <div className={`applicant-card is-${applicant.status}`}>
      <div className="applicant-head">
        <h3 className="applicant-name">{applicant.name || t("applicantNoName")}</h3>
        <span className={`applicant-chip chip-${applicant.status}`}>{t(STATUS_LABEL[applicant.status])}</span>
      </div>
      <div className="draft-preview-details">
        {applicant.area && <span className="draft-detail"><Icon name="pin" size={16} />{applicant.area}</span>}
        <span className="draft-detail">{t("applicantAppliedOn", { date: new Date(applicant.appliedAt).toLocaleDateString() })}</span>
      </div>
      {topSkills.length > 0 && (
        <div className="draft-reqs">
          {topSkills.map((skill) => <span key={skill} className="chip applicant-skill">{skill}</span>)}
        </div>
      )}

      {open && (
        <dl className="applicant-profile">
          {applicant.skills.length > 3 && <div><dt>{t("applicantSkills")}</dt><dd>{applicant.skills.join(", ")}</dd></div>}
          {applicant.experience.length > 0 && (
            <div>
              <dt>{t("applicantExperience")}</dt>
              <dd>{applicant.experience.map((item) => (item.years ? `${item.role} (${item.years})` : item.role)).join(", ")}</dd>
            </div>
          )}
          {applicant.languages.length > 0 && <div><dt>{t("applicantLanguages")}</dt><dd>{applicant.languages.join(", ")}</dd></div>}
          {applicant.education && <div><dt>{t("applicantEducation")}</dt><dd>{applicant.education}</dd></div>}
        </dl>
      )}

      {applicant.phone ? (
        <div className="row-actions">
          <a className="btn btn-quiet" href={`tel:${applicant.phone}`}><Icon name="phone" size={18} />{applicant.phone}</a>
          <a
            className="btn btn-quiet"
            href={`https://wa.me/${applicant.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("shareWhatsapp")}
          </a>
        </div>
      ) : (
        <p className="applicant-locked">{t("applicantPhoneLocked")}</p>
      )}

      <div className="applicant-actions">
        <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("applicantHideProfile") : t("applicantViewProfile")}
        </button>
        <div className="applicant-status-picker" role="group" aria-label={t("applicantChangeStatus")}>
          {APPLICANT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className="chip applicant-status-btn"
              aria-pressed={applicant.status === status}
              onClick={() => applicant.status !== status && onStatus(status)}
            >
              {t(STATUS_LABEL[status])}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProviderApplicants() {
  const { ready, t } = useApp();
  const [groups, setGroups] = useState<ListingApplicants[] | null>(null);
  const [problem, setProblem] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/provider/applicants", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setGroups(((await res.json()) as { listings: ListingApplicants[] }).listings);
      setProblem(false);
    } catch {
      setProblem(true);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function changeStatus(applicant: Applicant, status: ApplicantStatus) {
    const res = await fetch(`/api/provider/applicants/${applicant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!res?.ok) {
      setProblem(true);
      return;
    }
    // Reload rather than patch locally, so the phone number appears or disappears exactly as the server decides.
    await load();
  }

  if (!ready) return <Shell><span /></Shell>;

  const withApplicants = (groups ?? []).filter((group) => group.applicants.length > 0);

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <h1>{t("providerApplicantsTitle")}</h1>
        </div>
        {problem && (
          <div className="error-note" role="alert">
            <Icon name="warning" />
            <p>{t("genericError")}</p>
            <button type="button" className="btn btn-quiet" onClick={() => void load()}>{t("tryAgain")}</button>
          </div>
        )}
        {groups && withApplicants.length === 0 && !problem && (
          <div className="empty">
            <Icon name="users" size={48} />
            <p className="empty-text">{t("providerApplicantsEmpty")}</p>
          </div>
        )}
        {withApplicants.map(({ listing, applicants }) => (
          <section key={listing.id} className="listings-section applicants-section">
            <h2 className="listings-section-title">
              {listing.title.en} · {listing.employer} · {t("applicantsCount", { n: applicants.length })}
            </h2>
            <div className="listings-grid">
              {applicants.map((applicant) => (
                <ApplicantCard key={applicant.id} applicant={applicant} onStatus={(status) => void changeStatus(applicant, status)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Shell>
  );
}
