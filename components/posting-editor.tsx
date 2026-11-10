"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, errorKey, postJson, sendJson } from "@/lib/client/api";
import { MAX_REQUIREMENTS, OTHER_WORK, postingFormSchema, type PostingForm, type PostingSignal } from "@/lib/postings";
import { ROLES } from "@/lib/roles";
import type { StringKey } from "@/lib/i18n";
import { useApp } from "./app-state";
import { ErrorNote, Icon, Loading } from "./ui";
import { VoiceInput } from "./voice";

/** The form as typed: pay stays text until it is sent, so a half-typed number is never lost. */
type FormState = Omit<PostingForm, "lang" | "payMin" | "payMax"> & { payMin: string; payMax: string };

type Draft = {
  draft: { title: string; business: string; area: string; summary: string; timings: string; pay_min: number | null; pay_max: number | null; pay_period: "month" | "day"; requirements: string[] };
  roleId: string;
  blocked: PostingSignal[];
  cautions: PostingSignal[];
};

const blank = (): FormState => ({
  roleId: "", workType: "", title: "", business: "", area: "", summary: "", timings: "", payMin: "", payMax: "", payPeriod: "month", requirements: [""],
});

const fromForm = (form: PostingForm): FormState => ({
  ...form,
  workType: form.workType ?? "",
  payMin: form.payMin === null ? "" : String(form.payMin),
  payMax: form.payMax === null ? "" : String(form.payMax),
  requirements: form.requirements.length ? form.requirements : [""],
});

const number = (value: string) => (value.trim() ? Number(value.replace(/\D/g, "")) : null);

export const BLOCK_TEXT: Record<PostingSignal, StringKey> = {
  asks_payment: "blockedPayment",
  asks_sensitive: "blockedSensitive",
  discriminates: "blockedDiscriminates",
  unrealistic: "cautionUnrealistic",
};

/**
 * Posting a job in two steps: say what the job is in your own words, then check the posting Daari
 * writes from them. Editing a posting starts at the second step.
 */
export function PostingEditor({ initial, postingId }: { initial?: PostingForm; postingId?: string }) {
  const { t, effectiveLang } = useApp();
  const router = useRouter();
  const [stage, setStage] = useState<"describe" | "review">(initial ? "review" : "describe");
  const [words, setWords] = useState("");
  const [form, setForm] = useState<FormState>(initial ? fromForm(initial) : blank());
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<PostingSignal[]>([]);
  // A description that asked for money is described again, not tidied up: the model may quietly
  // drop the fee from its draft, and the employer would still mean to charge it.
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [cautions, setCautions] = useState<PostingSignal[]>([]);
  const [tried, setTried] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const requirements = form.requirements.map((item) => item.trim()).filter(Boolean);
  const candidate = { ...form, lang: initial?.lang ?? effectiveLang, payMin: number(form.payMin), payMax: number(form.payMax), requirements };
  const parsed = postingFormSchema.safeParse(candidate);
  const missing = (key: keyof FormState) => tried && !parsed.success && parsed.error.issues.some((issue) => issue.path[0] === key);

  async function writeDraft() {
    setBusy("draft");
    setProblem(null);
    try {
      const result = await postJson<Draft>("/api/employer/draft", { lang: effectiveLang, words });
      const { draft } = result;
      setForm({
        roleId: result.roleId,
        workType: "",
        title: draft.title,
        business: draft.business,
        area: draft.area,
        summary: draft.summary,
        timings: draft.timings,
        payMin: draft.pay_min === null ? "" : String(Math.round(draft.pay_min)),
        payMax: draft.pay_max === null ? "" : String(Math.round(draft.pay_max)),
        payPeriod: draft.pay_period,
        requirements: draft.requirements.length ? draft.requirements.slice(0, MAX_REQUIREMENTS) : [""],
      });
      setBlocked(result.blocked);
      setDraftBlocked(result.blocked.length > 0);
      setCautions(result.cautions);
      setStage("review");
      window.scrollTo({ top: 0 });
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setTried(true);
    if (!parsed.success) return;
    setBusy("publish");
    setProblem(null);
    try {
      const result = postingId
        ? await sendJson<{ id: string }>("PUT", `/api/employer/postings/${postingId}`, parsed.data)
        : await postJson<{ id: string }>("/api/employer/postings", parsed.data);
      router.push(`/employer/${result.id}${postingId ? "" : "?posted=1"}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "posting_blocked") {
        setBlocked((error.details.blocked as PostingSignal[]) ?? []);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setProblem(t(errorKey(error)));
      }
      setBusy(null);
    }
  }

  if (busy) return <Loading text={busy === "draft" ? t("writingPosting") : t("publishing")} />;

  if (stage === "describe") {
    return (
      <section className="describe">
        <p className="muted">{t("describeHint")}</p>
        {/* Most shop owners would rather say it than type it, so talking comes first. */}
        <VoiceInput size="small" label={t("describeTalk")} onText={(text) => setWords((current) => (current.trim() ? `${current.trim()} ${text}` : text))} />
        <label className="field">
          <span>{t("describeOrType")}</span>
          <textarea rows={5} value={words} placeholder={t("describePlaceholder")} onChange={(event) => setWords(event.target.value)} />
        </label>
        <p className="describe-example">{t("describeExample")}</p>
        {problem && <ErrorNote text={problem} onRetry={writeDraft} />}
        <div className="row-actions">
          <button type="button" className="btn btn-primary" disabled={words.trim().length < 10} onClick={writeDraft}>{t("makePosting")}</button>
          <button type="button" className="link-button" onClick={() => setStage("review")}>{t("fillMyself")}</button>
        </div>
      </section>
    );
  }

  const field = (key: "title" | "business" | "area" | "timings", label: StringKey, hint?: StringKey) => (
    <label className="field">
      <span>{t(label)}</span>
      <input value={form[key]} aria-invalid={missing(key) || undefined} onChange={(event) => set(key, event.target.value)} />
      {hint && <small className="field-hint">{t(hint)}</small>}
      {missing(key) && <small className="field-problem">{t("fillThisIn")}</small>}
    </label>
  );

  return (
    <section className="review-posting">
      {!postingId && (
        <header className="page-head">
          <h2>{t("postingReviewTitle")}</h2>
          <p>{t("postingReviewSub")}</p>
        </header>
      )}

      {blocked.length > 0 && (
        <section className="verdict verdict-warn" role="alert">
          <div className="verdict-head"><Icon name="warning" size={28} /><h2>{t("blockedTitle")}</h2></div>
          <ul className="signal-list">{blocked.map((signal) => <li key={signal}>{t(BLOCK_TEXT[signal])}</li>)}</ul>
          <p>{draftBlocked ? t("blockedDescribeAgain") : t("blockedFix")}</p>
          {draftBlocked && <button type="button" className="btn btn-quiet" onClick={() => { setStage("describe"); setBlocked([]); setDraftBlocked(false); }}>{t("describeAgain")}</button>}
        </section>
      )}
      {cautions.length > 0 && !blocked.length && <p className="honest-note">{t("cautionUnrealistic")}</p>}

      <div className="fields">
        {field("title", "fieldTitle")}
        {field("business", "fieldBusiness")}
        {field("area", "fieldArea")}
        <label className="field">
          <span>{t("fieldWorkType")}</span>
          <select value={form.roleId} aria-invalid={missing("roleId") || undefined} onChange={(event) => set("roleId", event.target.value)}>
            {!form.roleId && <option value="" disabled>{t("chooseWorkType")}</option>}
            {ROLES.map((role) => <option key={role.id} value={role.id}>{role[effectiveLang]}</option>)}
            <option value={OTHER_WORK}>{t("workTypeOther")}</option>
          </select>
          {missing("roleId") ? <small className="field-problem">{t("fillThisIn")}</small> : form.roleId !== OTHER_WORK && <small className="field-hint">{t("workTypeHint")}</small>}
        </label>
        {form.roleId === OTHER_WORK && (
          <label className="field">
            <span>{t("workTypeOwn")}</span>
            <input value={form.workType} maxLength={60} placeholder={t("workTypeOwnPlaceholder")} aria-invalid={missing("workType") || undefined} onChange={(event) => set("workType", event.target.value)} />
            {missing("workType") ? <small className="field-problem">{t("fillThisIn")}</small> : <small className="field-hint">{t("workTypeOwnHint")}</small>}
          </label>
        )}
        <label className="field">
          <span>{t("fieldSummary")}</span>
          <textarea rows={3} value={form.summary} aria-invalid={missing("summary") || undefined} onChange={(event) => set("summary", event.target.value)} />
          {missing("summary") && <small className="field-problem">{t("fillThisIn")}</small>}
        </label>
        {field("timings", "fieldTimings")}

        <fieldset className="field pay-fields">
          <legend>{t("fieldPay")}</legend>
          <div className="pay-row">
            <label>
              <span>{t("payFrom")}</span>
              <input inputMode="numeric" value={form.payMin} onChange={(event) => set("payMin", event.target.value.replace(/\D/g, "").slice(0, 7))} />
            </label>
            <label>
              <span>{t("payTo")}</span>
              <input inputMode="numeric" value={form.payMax} aria-invalid={missing("payMax") || undefined} onChange={(event) => set("payMax", event.target.value.replace(/\D/g, "").slice(0, 7))} />
            </label>
            <label>
              <span>{t("payEvery")}</span>
              <select value={form.payPeriod} onChange={(event) => set("payPeriod", event.target.value as "month" | "day")}>
                <option value="month">{t("perMonth")}</option>
                <option value="day">{t("perDay")}</option>
              </select>
            </label>
          </div>
          {missing("payMax") ? <small className="field-problem">{t("payBackwards")}</small> : <small className="field-hint">{t("payHint")}</small>}
        </fieldset>

        <fieldset className="field requirement-fields">
          <legend>{t("fieldRequirements")}</legend>
          <small className="field-hint">{t("requirementsHint")}</small>
          <ol>
            {form.requirements.map((item, index) => (
              <li key={index}>
                <input
                  value={item}
                  aria-label={`${t("fieldRequirements")} ${index + 1}`}
                  onChange={(event) => set("requirements", form.requirements.map((entry, at) => (at === index ? event.target.value : entry)))}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("removeRequirement")}
                  onClick={() => set("requirements", form.requirements.length > 1 ? form.requirements.filter((_, at) => at !== index) : [""])}
                >
                  <Icon name="close" size={20} />
                </button>
              </li>
            ))}
          </ol>
          {form.requirements.length < MAX_REQUIREMENTS && (
            <button type="button" className="link-button" onClick={() => set("requirements", [...form.requirements, ""])}>
              {t("addRequirement")}
            </button>
          )}
        </fieldset>
      </div>

      <p className="honest-note">{t("publishNote")}</p>
      {problem && <ErrorNote text={problem} onRetry={publish} />}
      <div className="row-actions">
        <button type="button" className="btn btn-primary" disabled={draftBlocked} onClick={publish}>{postingId ? t("saveChanges") : t("publish")}</button>
        {!postingId && <button type="button" className="link-button" onClick={() => { setStage("describe"); setBlocked([]); setDraftBlocked(false); }}>{t("describeAgain")}</button>}
      </div>
    </section>
  );
}
