"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { emptyDraft, useApp, type PostedListing } from "@/components/app-state";
import { FeaturedPetals } from "@/components/featured-petals";
import { Icon, Shell } from "@/components/ui";
import { postJson, ApiError } from "@/lib/client/api";
import type { FullJob, ListingApplicants } from "@/lib/types";

/** What only the server knows about a listing: featured placement and who applied. */
type ServerInfo = { featured: boolean; featuredRequested: boolean; applicants: number; newApplicants: number };

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

/** A posted listing, built the same way as the draft preview so both tabs look alike. */
function ListingCard({
  listing,
  info,
  onClose,
  onRemove,
  onRequestFeatured,
}: {
  listing: PostedListing;
  info?: ServerInfo;
  onClose: () => void;
  onRemove: () => void;
  onRequestFeatured: () => void;
}) {
  const { t } = useApp();
  const isActive = listing.status === "active";
  const featured = isActive && Boolean(info?.featured);
  return (
    <div className={["draft-preview-card", !isActive && "is-closed", featured && "is-featured"].filter(Boolean).join(" ")}>
      {featured && <FeaturedPetals />}
      <div className="draft-preview-header">
        <span className="badge-direct">{t("directShopBadge")}</span>
        <span className={`listing-status-badge ${isActive ? "badge-active" : "badge-closed"}`}>
          {isActive ? t("providerActiveListings") : t("providerListingClosed")}
        </span>
        {featured && <span className="badge-featured">{t("featuredBadge")}</span>}
        <span className="listing-card-date">{new Date(listing.postedAt).toLocaleDateString()}</span>
      </div>
      <h2 className="draft-preview-title">{listing.title}</h2>
      <p className="draft-preview-employer">{listing.employer}</p>
      <div className="draft-preview-details">
        <span className="draft-detail"><Icon name="pin" size={16} />{listing.area}</span>
        <span className="draft-detail"><Icon name="rupee" size={16} />{listing.salaryText}</span>
        {info && (
          <Link href="/provider/applicants" className="draft-detail draft-detail-link">
            <Icon name="users" size={16} />
            {t("applicantsCount", { n: info.applicants })}
            {info.newApplicants > 0 && <span className="filter-badge">{info.newApplicants}</span>}
          </Link>
        )}
      </div>
      <div className="listing-preview-actions">
        {isActive && !featured && !info?.featuredRequested && (
          <button type="button" className="btn btn-quiet" onClick={onRequestFeatured}>
            <Icon name="star" size={16} />
            {t("providerRequestFeatured")}
          </button>
        )}
        {isActive && !featured && info?.featuredRequested && (
          <span className="draft-detail"><Icon name="check" size={16} />{t("providerFeaturedRequested")}</span>
        )}
        {featured && <span className="draft-detail"><Icon name="star" size={16} />{t("providerFeaturedLive")}</span>}
        {isActive ? (
          <button type="button" className="btn listing-close-btn" onClick={onClose}>
            <Icon name="close" size={16} />
            {t("providerCloseListing")}
          </button>
        ) : (
          <button type="button" className="btn listing-remove-btn" onClick={onRemove} aria-label="Remove listing">
            <Icon name="close" size={16} />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export default function ProviderListings() {
  const { ready, t, effectiveLang, providerDraft, postedListings, update, user } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [tab, setTab] = useState<"draft" | "listings">("draft");
  const [info, setInfo] = useState<Record<string, ServerInfo>>({});

  const loadInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/provider/applicants", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { listings: ListingApplicants[] };
      // A listing the server no longer has (or has closed) cannot be live, whatever this account last saved.
      const liveOnServer = new Set(data.listings.filter((l) => l.listing.status === "active").map((l) => l.listing.id));
      update((current) =>
        current.postedListings.some((l) => l.status === "active" && !liveOnServer.has(l.id))
          ? { postedListings: current.postedListings.map((l) => (l.status === "active" && !liveOnServer.has(l.id) ? { ...l, status: "closed" } : l)) }
          : {},
      );
      setInfo(
        Object.fromEntries(
          data.listings.map(({ listing, applicants }) => [
            listing.id,
            {
              featured: listing.featured,
              featuredRequested: listing.featuredRequested,
              applicants: applicants.length,
              newApplicants: applicants.filter((a) => a.status === "new").length,
            },
          ]),
        ),
      );
    } catch {
      // The cards still work without the extras.
    }
  }, [update]);

  useEffect(() => {
    if (ready && tab === "listings") void loadInfo();
  }, [ready, tab, postedListings.length, loadInfo]);

  if (!ready) return <Shell><span /></Shell>;

  const canPost = isMandatoryFilled(providerDraft);
  const missing = missingLabels(providerDraft);
  const active = postedListings.filter((l) => l.status === "active");
  const closed = postedListings.filter((l) => l.status === "closed");
  // The draft is already live when an active listing has the same shop, role and locality.
  const draftRole = providerDraft.roleCategory.trim() || providerDraft.customRoleName.trim();
  const liveMatch = active.find(
    (l) =>
      norm(l.employer) === norm(providerDraft.businessName) &&
      norm(l.roleCategory) === norm(draftRole) &&
      norm(l.area) === norm(providerDraft.locality),
  );

  function handlePostNew() {
    update({ providerDraft: emptyDraft(), providerMessages: [] });
    setProblem(null);
    setValidationErrors([]);
    router.push("/provider/talk");
  }

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
        roleCategory: job.metadata?.roleCategory,
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

  async function handleClose(id: string) {
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });
      if (!res.ok) {
        setProblem(t("genericError"));
        return;
      }
    } catch {
      setProblem(t("genericError"));
      return;
    }
    update((current) => ({
      postedListings: current.postedListings.map((l) => l.id === id ? { ...l, status: "closed" } : l),
    }));
  }

  async function handleRequestFeatured(id: string) {
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_featured" }),
      });
      if (!res.ok) {
        // 404 means the server has no such listing; reloading marks it closed here so it stops showing as live.
        if (res.status === 404) await loadInfo();
        else setProblem(t("genericError"));
        return;
      }
      await loadInfo();
    } catch {
      setProblem(t("genericError"));
    }
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
                {liveMatch ? (
                  <div className="provider-live-banner">
                    <span className="listing-status-badge badge-active">
                      <Icon name="check" size={16} />
                      {t("providerListingPosted")}
                    </span>
                    <button type="button" className="btn btn-primary provider-post-btn" onClick={handlePostNew}>
                      <Icon name="mic" size={20} />
                      {t("providerPostNewJob")}
                    </button>
                  </div>
                ) : canPost ? (
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
                        <ListingCard
                          key={l.id}
                          listing={l}
                          info={info[l.id]}
                          onClose={() => handleClose(l.id)}
                          onRemove={() => handleRemove(l.id)}
                          onRequestFeatured={() => handleRequestFeatured(l.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {closed.length > 0 && (
                  <section className="listings-section">
                    <h2 className="listings-section-title">{t("providerClosedListings")}</h2>
                    <div className="listings-grid">
                      {closed.map((l) => (
                        <ListingCard
                          key={l.id}
                          listing={l}
                          info={info[l.id]}
                          onClose={() => handleClose(l.id)}
                          onRemove={() => handleRemove(l.id)}
                          onRequestFeatured={() => handleRequestFeatured(l.id)}
                        />
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
