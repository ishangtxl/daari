"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-state";
import { Icon, Shell } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import type { BusinessProofType, FullJob } from "@/lib/types";

const POPULAR_AREAS = [
  "Jayanagar",
  "Rajajinagar",
  "Peenya",
  "Koramangala",
  "Majestic",
  "Indiranagar",
  "Whitefield",
  "Malleshwaram",
  "Electronic City",
  "Shivajinagar",
  "Yeshwanthpur",
  "Hebbal",
];

const ROLE_OPTIONS = [
  { id: "mobile_repair", labelKey: "roleMobileRepair", icon: "tool" },
  { id: "electrician", labelKey: "roleElectrician", icon: "sparkle" },
  { id: "plumber", labelKey: "rolePlumber", icon: "tool" },
  { id: "auto_mech", labelKey: "roleMechanic", icon: "tool" },
  { id: "tailor", labelKey: "roleTailor", icon: "briefcase" },
  { id: "sales", labelKey: "roleRetail", icon: "briefcase" },
  { id: "driver", labelKey: "roleDelivery", icon: "briefcase" },
  { id: "other", labelKey: "roleOther", icon: "briefcase" },
] as const;

const COMMON_REQUIREMENTS = [
  { id: "reqTwoWheeler", labelKey: "reqTwoWheeler" },
  { id: "reqExperience", labelKey: "reqExperience" },
  { id: "reqKannada", labelKey: "reqKannada" },
  { id: "reqSoldering", labelKey: "reqSoldering" },
  { id: "reqSmartPhone", labelKey: "reqSmartPhone" },
  { id: "reqDiploma", labelKey: "reqDiploma" },
] as const;

export default function PostJobPage() {
  const { ready, user, t, effectiveLang } = useApp();
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [roleCategory, setRoleCategory] = useState<string>("mobile_repair");
  const [locality, setLocality] = useState("Jayanagar");
  const [landmark, setLandmark] = useState("");
  const [salaryMin, setSalaryMin] = useState(16000);
  const [salaryMax, setSalaryMax] = useState(22000);
  const [vacancies, setVacancies] = useState(1);
  const [selectedReqs, setSelectedReqs] = useState<string[]>(["reqKannada"]);
  const [customNotes, setCustomNotes] = useState("");
  const [proofType, setProofType] = useState<BusinessProofType>("merchant_upi");
  const [proofValue, setProofValue] = useState("");
  const [whatsappContact, setWhatsappContact] = useState(user?.id ?? "");

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [createdJob, setCreatedJob] = useState<FullJob | null>(null);

  if (!ready) return null;

  // If user is not authenticated, show sign in prompt with role set to employer
  if (!user) {
    return (
      <Shell>
        <div className="post-job-auth-prompt" lang={effectiveLang}>
          <div className="auth-prompt-card">
            <span className="auth-prompt-icon" aria-hidden="true">
              <Icon name="tool" size={40} />
            </span>
            <h2>{t("loginTitleEmployer")}</h2>
            <p>{t("loginSubEmployer")}</p>
            <Link href="/login?intent=post" className="btn btn-primary auth-prompt-btn">
              <Icon name="person" size={20} />
              <span>{t("navLogin")}</span>
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  function toggleReq(id: string) {
    setSelectedReqs((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      setProblem(t("shopNameLabel"));
      return;
    }
    if (!locality.trim()) {
      setProblem(t("localityLabel"));
      return;
    }

    setBusy(true);
    setProblem(null);

    const translatedReqs = selectedReqs.map((key) => t(key as any));

    try {
      const res = await postJson<{ ok: boolean; job: FullJob; error?: string }>("/api/jobs", {
        businessName: businessName.trim(),
        roleCategory: t(ROLE_OPTIONS.find((r) => r.id === roleCategory)?.labelKey ?? "roleOther"),
        locality: locality.trim(),
        landmark: landmark.trim(),
        salaryMin,
        salaryMax,
        selectedRequirements: translatedReqs,
        customNotes: customNotes.trim(),
        whatsappContact: whatsappContact.trim() || user?.id,
        verification: {
          proofType,
          proofValue: proofValue.trim(),
        },
      });

      if (!res.ok) {
        setProblem(res.error || t("genericError"));
        return;
      }

      setCreatedJob(res.job);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("422") || msg.toLowerCase().includes("prohibit") || msg.toLowerCase().includes("scam")) {
        setProblem(t("scamBlockedNotice"));
      } else {
        setProblem(t("genericError"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="post-job-container" lang={effectiveLang}>
        {createdJob ? (
          <div className="post-job-success-card">
            <div className="success-icon-badge" aria-hidden="true">
              <Icon name="check" size={36} />
            </div>
            <h2>{t("publishSuccess")}</h2>
            <p className="success-sub">
              {createdJob.title[effectiveLang] || createdJob.title.en} · {createdJob.employer} ({createdJob.area})
            </p>

            <div className="success-preview-box">
              <div className="job-tag-row">
                <span className="badge-direct">{t("directShopBadge")}</span>
                {createdJob.metadata?.verification?.isVerified && (
                  <span className="badge-verified">
                    {proofType === "merchant_upi" ? t("verifyMerchantBadge") : t("verifyBadge")}
                  </span>
                )}
              </div>
              <h3 className="preview-job-title">{createdJob.title[effectiveLang] || createdJob.title.en}</h3>
              <p className="preview-job-salary">{createdJob.salaryText} / {t("perMonth")}</p>
              <p className="preview-job-summary">{createdJob.summary[effectiveLang] || createdJob.summary.en}</p>
            </div>

            <div className="row-actions success-actions">
              <Link href="/jobs" className="btn btn-primary">
                <Icon name="briefcase" size={20} />
                <span>{t("publishViewJob")}</span>
              </Link>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setCreatedJob(null);
                  setBusinessName("");
                  setLandmark("");
                  setCustomNotes("");
                }}
              >
                {t("postJobButton")}
              </button>
            </div>
          </div>
        ) : (
          <div className="post-job-form-layout">
            <header className="post-job-header">
              <div className="post-job-header-text">
                <h1>{t("postJobTitle")}</h1>
                <p>{t("postJobSubtitle")}</p>
              </div>
            </header>

            <form className="post-job-form" onSubmit={handleSubmit} noValidate>
              {problem && (
                <div className="error-note" role="alert">
                  <Icon name="warning" />
                  <p>{problem}</p>
                </div>
              )}

              {/* 1. Business & Shop Information */}
              <fieldset className="post-section">
                <legend className="post-legend">
                  <span className="post-step-num">1</span>
                  <span>{t("shopNameLabel")}</span>
                </legend>

                <div className="field-group">
                  <label className="field">
                    <span>{t("shopNameLabel")} *</span>
                    <input
                      type="text"
                      placeholder={t("shopNamePlaceholder")}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                    />
                  </label>

                  <label className="field">
                    <span>{t("landmarkLabel")}</span>
                    <input
                      type="text"
                      placeholder={t("landmarkPlaceholder")}
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                    />
                  </label>
                </div>

                <div className="locality-selector">
                  <span className="control-label">{t("localityLabel")} *</span>
                  <div className="chip-row">
                    {POPULAR_AREAS.map((area) => (
                      <button
                        key={area}
                        type="button"
                        className="chip"
                        aria-pressed={locality === area}
                        onClick={() => setLocality(area)}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="custom-locality-input"
                    placeholder={t("localityPlaceholder")}
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                  />
                </div>
              </fieldset>

              {/* 2. Role & Category */}
              <fieldset className="post-section">
                <legend className="post-legend">
                  <span className="post-step-num">2</span>
                  <span>{t("roleCategoryLabel")}</span>
                </legend>

                <div className="role-chip-grid">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="role-select-chip"
                      aria-pressed={roleCategory === opt.id}
                      onClick={() => setRoleCategory(opt.id)}
                    >
                      <span className="role-chip-icon" aria-hidden="true">
                        <Icon name={opt.icon} size={20} />
                      </span>
                      <span>{t(opt.labelKey)}</span>
                    </button>
                  ))}
                </div>

                <div className="field-group inline-fields">
                  <label className="field">
                    <span>{t("vacanciesLabel")}</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={vacancies}
                      onChange={(e) => setVacancies(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                </div>
              </fieldset>

              {/* 3. Salary & Pay */}
              <fieldset className="post-section">
                <legend className="post-legend">
                  <span className="post-step-num">3</span>
                  <span>{t("salaryRangeLabel")}</span>
                </legend>

                <div className="salary-inputs-row">
                  <label className="field">
                    <span>{t("salaryMinLabel")}</span>
                    <input
                      type="number"
                      step={1000}
                      min={8000}
                      value={salaryMin}
                      onChange={(e) => setSalaryMin(Number(e.target.value) || 0)}
                    />
                  </label>

                  <span className="salary-dash">—</span>

                  <label className="field">
                    <span>{t("salaryMaxLabel")}</span>
                    <input
                      type="number"
                      step={1000}
                      min={salaryMin}
                      value={salaryMax}
                      onChange={(e) => setSalaryMax(Number(e.target.value) || salaryMin)}
                    />
                  </label>
                </div>

                <div className="salary-presets">
                  {[
                    [15000, 20000],
                    [18000, 25000],
                    [22000, 30000],
                  ].map(([min, max]) => (
                    <button
                      key={`${min}-${max}`}
                      type="button"
                      className="chip"
                      onClick={() => {
                        setSalaryMin(min);
                        setSalaryMax(max);
                      }}
                    >
                      ₹{min.toLocaleString("en-IN")} - ₹{max.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* 4. Requirements & Skills */}
              <fieldset className="post-section">
                <legend className="post-legend">
                  <span className="post-step-num">4</span>
                  <span>{t("requirementsLabel")}</span>
                </legend>

                <div className="chip-row">
                  {COMMON_REQUIREMENTS.map((req) => {
                    const active = selectedReqs.includes(req.id);
                    return (
                      <button
                        key={req.id}
                        type="button"
                        className="chip"
                        aria-pressed={active}
                        onClick={() => toggleReq(req.id)}
                      >
                        {active ? <Icon name="check" size={16} /> : null}
                        <span>{t(req.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="field" style={{ marginTop: "12px" }}>
                  <span>{t("customReqPlaceholder")}</span>
                  <textarea
                    rows={3}
                    placeholder={t("customReqPlaceholder")}
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                  />
                </label>
              </fieldset>

              {/* 5. Business Legitimacy Verification */}
              <fieldset className="post-section verification-section">
                <legend className="post-legend">
                  <span className="post-step-num">5</span>
                  <span>{t("verificationTypeLabel")}</span>
                </legend>

                <div className="verification-options">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="proofType"
                      checked={proofType === "merchant_upi"}
                      onChange={() => setProofType("merchant_upi")}
                    />
                    <span>{t("verifyMerchantUpi")}</span>
                  </label>

                  <label className="radio-option">
                    <input
                      type="radio"
                      name="proofType"
                      checked={proofType === "gstin"}
                      onChange={() => setProofType("gstin")}
                    />
                    <span>{t("verifyGstin")}</span>
                  </label>

                  <label className="radio-option">
                    <input
                      type="radio"
                      name="proofType"
                      checked={proofType === "udyam"}
                      onChange={() => setProofType("udyam")}
                    />
                    <span>{t("verifyUdyam")}</span>
                  </label>

                  <label className="radio-option">
                    <input
                      type="radio"
                      name="proofType"
                      checked={proofType === "storefront"}
                      onChange={() => setProofType("storefront")}
                    />
                    <span>{t("verifyLocal")}</span>
                  </label>
                </div>

                {proofType !== "storefront" && proofType !== "none" && (
                  <label className="field" style={{ marginTop: "12px" }}>
                    <span>{t("verifyValueLabel")}</span>
                    <input
                      type="text"
                      placeholder={
                        proofType === "merchant_upi"
                          ? "e.g. yourshop@paytm"
                          : proofType === "gstin"
                          ? "29AAAAA0000A1Z5"
                          : "UDYAM-KR-03-XXXXXXX"
                      }
                      value={proofValue}
                      onChange={(e) => setProofValue(e.target.value)}
                    />
                  </label>
                )}
              </fieldset>

              {/* 6. WhatsApp Contact */}
              <fieldset className="post-section">
                <legend className="post-legend">
                  <span className="post-step-num">6</span>
                  <span>{t("whatsappLabel")}</span>
                </legend>

                <label className="field">
                  <span>{t("whatsappLabel")} *</span>
                  <input
                    type="tel"
                    placeholder="10 digit mobile number"
                    value={whatsappContact}
                    onChange={(e) => setWhatsappContact(e.target.value)}
                    required
                  />
                </label>
                <p className="honest-note">
                  <Icon name="speaker" size={16} />
                  {t("whatsappHint")}
                </p>
              </fieldset>

              <div className="post-form-submit-row">
                <button
                  type="submit"
                  className="btn btn-primary post-publish-btn"
                  disabled={busy || !businessName.trim()}
                >
                  {busy ? <span className="spinner" /> : <Icon name="check" size={20} />}
                  <span>{busy ? t("publishing") : t("publishJobBtn")}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Shell>
  );
}
