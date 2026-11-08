"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp, type PostedListing } from "@/components/app-state";
import { Icon, Shell } from "@/components/ui";
import { postJson, ApiError } from "@/lib/client/api";
import type { FullJob } from "@/lib/types";

const MANDATORY_FIELDS = ["businessName", "roleCategory", "locality", "whatsappContact"] as const;

function isMandatoryFilled(draft: ReturnType<typeof useApp>["providerDraft"]): boolean {
  return Boolean(
    draft.businessName.trim() &&
    (draft.roleCategory.trim() || draft.customRoleName.trim()) &&
    draft.locality.trim() &&
    draft.salaryMin > 0 &&
    draft.whatsappContact.trim(),
  );
}

function missingLabels(draft: ReturnType<typeof useApp>["providerDraft"]): string[] {
  const m: string[] = [];
  if (!draft.businessName.trim()) m.push("Shop name");
  if (!draft.roleCategory.trim() && !draft.customRoleName.trim()) m.push("Role");
  if (!draft.locality.trim()) m.push("Locality");
  if (!draft.salaryMin) m.push("Salary");
  if (!draft.whatsappContact.trim()) m.push("WhatsApp");
  return m;
}

function ListingCard({ listing, onClose, onRemove }: { listing: PostedListing; onClose: () => void; onRemove: () => void }) {
  const { t } = useApp();
  const isActive = listing.status === "active";
  return (
    <div className={`listing-card ${isActive ? "listing-active" : "listing-closed"}`}>
      <div className="listing-card-header">
        <div className="listing-card-meta">
          <span className={`listing-status-badge ${isActive ? "badge-active" : "badge-closed"}`}>
            {isActive ? t("providerActiveListings") : t("providerListingClosed")}
          </span>
          <span className="listing-card-date">{new Date(listing.postedAt).toLocaleDateString()}</span>
        </div>
        <div className="listing-card-actions">
          {isActive && (
            <button type="button" className="btn listing-close-btn" onClick={onClose}>
              <Icon name="close" size={16} />
              {t("providerCloseListing")}
            </button>
          )}
          {!isActive && (
            <button type="button" className="btn listing-remove-btn" onClick={onRemove} aria-label="Remove listing">
              <Icon name="close" size={16} />
              Remove
            </button>
          )}
        </div>
      </div>
      <h3 className="listing-card-title">{listing.title}</h3>
      <p className="listing-card-employer">{listing.employer}</p>
      <div className="listing-card-details">
        <span><Icon name="pin" size={16} />{listing.area}</span>
        <span><Icon name="rupee" size={16} />{listing.salaryText}</span>
      </div>
    </div>
  );
}

export default function ProviderListings() {
  const { ready, t, effectiveLang, providerDraft, postedListings, update, user } = useApp();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [tab, setTab] = useState<"draft" | "listings">("draft");

  if (!ready) return <Shell><span /></Shell>;

  const canPost = isMandatoryFilled(providerDraft);
  const missing = missingLabels(providerDraft);
  const active = postedListings.filter((l) => l.status === "active");
  const closed = postedListings.filter((l) => l.status === "closed");

  async function handlePost() {
    if (!canPost || busy) return;
    setBusy(true);
    setProblem(null);
    setValidationErrors([]);
    try {
      const res = await postJson<{ ok: boolean; job: FullJob; error?: string; signals?: string[] }>("/api/jobs", {
        businessName: providerDraft.businessName.trim(),
        roleCategory: providerDraft.roleCategory.trim() || providerDraft.customRoleName.trim(),
        locality: providerDraft.locality.trim(),
        landmark: providerDraft.landmark.trim(),
        salaryMin: providerDraft.salaryMin,
        salaryMax: providerDraft.salaryMax,
        selectedRequirements: providerDraft.requirements,
        customNotes: providerDraft.customNotes.trim(),
        whatsappContact: providerDraft.whatsappContact.trim() || user?.id,
        verification: {
          proofType: "none",
          proofValue: "",
        },
      });
      if (!res.ok) {
        setProblem(res.error || t("genericError"));
        if (res.signals?.length) setValidationErrors(res.signals);
        return;
      }
      const job = res.job;
      const newListing: PostedListing = {
        id: job.id,
        title: job.title[effectiveLang] || job.title.en,
        employer: job.employer,
        area: job.area,
        salaryText: job.salaryText ?? `₹${providerDraft.salaryMin.toLocaleString("en-IN")}–₹${providerDraft.salaryMax.toLocaleString("en-IN")}`,
        status: "active",
        postedAt: new Date().toISOString(),
      };
      update((current) => ({ postedListings: [newListing, ...current.postedListings] }));
      setTab("listings");
    } catch (err) {
      // postJson throws ApiError for non-2xx; err.code holds the server's error message.
      if (err instanceof ApiError) {
        if (err.code.toLowerCase().includes("scam") || err.code.toLowerCase().includes("prohibit") || err.code.toLowerCase().includes("fee") || err.code.toLowerCase().includes("deposit")) {
          setProblem(t("scamBlockedNotice"));
        } else {
          setProblem(err.code || t("genericError"));
        }
        if (err.signals?.length) setValidationErrors(err.signals);
      } else {
        setProblem(t("genericError"));
      }
    } finally {
      setBusy(false);
    }
  }

  function handleClose(id: string) {
    update((current) => ({
      postedListings: current.postedListings.map((l) => l.id === id ? { ...l, status: "closed" } : l),
    }));
  }

  function handleRemove(id: string) {
    update((current) => ({
      postedListings: current.postedListings.filter((l) => l.id !== id),
    }));
  }

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <h1>{t("providerMyListingsTitle")}</h1>
        </div>

        <div className="tabs">
          <button type="button" aria-selected={tab === "draft"} onClick={() => setTab("draft")}>
            {t("providerDraftListings")}
            {!canPost && providerDraft.businessName && (
              <span className="tab-dot tab-dot-warn" aria-label="incomplete" />
            )}
          </button>
          <button type="button" aria-selected={tab === "listings"} onClick={() => setTab("listings")}>
            {t("providerMyListingsTitle")}
            {active.length > 0 && <span className="filter-badge" style={{ marginLeft: 6 }}>{active.length}</span>}
          </button>
        </div>

        {/* Draft / preview tab */}
        {tab === "draft" && (
          <div className="provider-draft-tab">
            {problem && (
                  <div className="error-note" role="alert">
                    <Icon name="warning" />
                    <p>{problem}</p>
                    {validationErrors.length > 0 && (
                      <ul className="signal-list" style={{ marginTop: 6 }}>
                        {validationErrors.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                  </div>
                )}

            {!providerDraft.businessName && !providerDraft.locality && !providerDraft.roleCategory ? (
              <div className="empty">
                <p className="empty-text">{t("providerMyListingsEmpty")}</p>
                <Link href="/provider/talk" className="btn btn-primary">
                  <Icon name="mic" size={18} />
                  {t("navProviderTalk")}
                </Link>
              </div>
            ) : (
              <>
                {/* Full listing preview card */}
                <div className="draft-preview-card">
                  <div className="draft-preview-header">
                    <span className="badge-direct">{t("directShopBadge")}</span>
                  </div>
                  <h2 className="draft-preview-title">
                    {providerDraft.roleCategory || providerDraft.customRoleName || "—"}
                  </h2>
                  <p className="draft-preview-employer">{providerDraft.businessName || "—"}</p>
                  <div className="draft-preview-details">
                    {providerDraft.locality && (
                      <span className="draft-detail">
                        <Icon name="pin" size={16} />
                        {providerDraft.locality}
                        {providerDraft.landmark ? `, ${providerDraft.landmark}` : ""}
                      </span>
                    )}
                    {providerDraft.salaryMin > 0 && (
                      <span className="draft-detail">
                        <Icon name="rupee" size={16} />
                        {t("providerSalaryRange", { min: providerDraft.salaryMin.toLocaleString("en-IN"), max: providerDraft.salaryMax.toLocaleString("en-IN") })}
                      </span>
                    )}
                    {providerDraft.vacancies > 1 && (
                      <span className="draft-detail">
                        <Icon name="person" size={16} />
                        {t("providerVacancies", { n: providerDraft.vacancies })}
                      </span>
                    )}
                    {providerDraft.whatsappContact && (
                      <span className="draft-detail">
                        <Icon name="phone" size={16} />
                        {providerDraft.whatsappContact}
                      </span>
                    )}
                  </div>
                  {providerDraft.requirements.length > 0 && (
                    <div className="draft-reqs">
                      {providerDraft.requirements.map((r, i) => (
                        <span key={i} className="chip" style={{ minHeight: 36, fontSize: 14, padding: "4px 12px" }}>{r}</span>
                      ))}
                    </div>
                  )}
                  {providerDraft.customNotes && (
                    <p className="draft-notes">{providerDraft.customNotes}</p>
                  )}
                </div>

                {/* Post action */}
                {canPost ? (
                  <button
                    type="button"
                    className="btn btn-primary provider-post-btn"
                    disabled={busy}
                    onClick={handlePost}
                  >
                    {busy ? <span className="spinner" /> : <Icon name="check" size={20} />}
                    {busy ? t("publishing") : t("providerPostListing")}
                  </button>
                ) : (
                  <div className="provider-missing-banner">
                    <Icon name="warning" size={18} />
                    <span>{t("providerMissingFields", { fields: missing.join(", ") })}</span>
                    <Link href="/provider/talk" className="btn btn-quiet">
                      <Icon name="mic" size={16} />
                      {t("navProviderTalk")}
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* My listings tab */}
        {tab === "listings" && (
          <div className="provider-listings-tab">
            {postedListings.length === 0 ? (
              <div className="empty">
                <p className="empty-text">{t("providerMyListingsEmpty")}</p>
                <Link href="/provider/talk" className="btn btn-primary">
                  <Icon name="mic" size={18} />
                  {t("navProviderTalk")}
                </Link>
              </div>
            ) : (
              <>
                {active.length > 0 && (
                  <section className="listings-section">
                    <h2 className="listings-section-title">{t("providerActiveListings")}</h2>
                    <div className="listings-grid">
                      {active.map((l) => (
                        <ListingCard key={l.id} listing={l} onClose={() => handleClose(l.id)} onRemove={() => handleRemove(l.id)} />
                      ))}
                    </div>
                  </section>
                )}
                {closed.length > 0 && (
                  <section className="listings-section">
                    <h2 className="listings-section-title">{t("providerClosedListings")}</h2>
                    <div className="listings-grid">
                      {closed.map((l) => (
                        <ListingCard key={l.id} listing={l} onClose={() => handleClose(l.id)} onRemove={() => handleRemove(l.id)} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
