"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp, type ChatMessage, type ProviderJobDraft } from "@/components/app-state";
import { Composer } from "@/components/composer";
import { ErrorNote, Icon, Loading, ReadAloud, Shell } from "@/components/ui";
import { errorKey, postJson, postRaw } from "@/lib/client/api";
import { speak } from "@/lib/client/audio";

const newId = () => crypto.randomUUID();
// Close enough to the bottom that new messages should keep the view pinned there.
const PINNED_PX = 120;

const POPULAR_AREAS = [
  "Jayanagar", "Rajajinagar", "Peenya", "Indiranagar", "Koramangala",
  "Malleshwaram", "Whitefield", "BTM Layout", "HSR Layout", "Yelahanka",
];

const MANDATORY_FIELDS: { key: keyof ProviderJobDraft; label: string }[] = [
  { key: "businessName", label: "Shop name" },
  { key: "roleCategory", label: "Role" },
  { key: "locality", label: "Locality" },
  { key: "salaryMin", label: "Min salary" },
  { key: "whatsappContact", label: "WhatsApp" },
];

function isMandatoryFilled(draft: ProviderJobDraft): boolean {
  return Boolean(
    draft.businessName.trim() &&
    (draft.roleCategory.trim() || draft.customRoleName.trim()) &&
    draft.locality.trim() &&
    draft.salaryMin > 0 &&
    draft.whatsappContact.trim(),
  );
}

function missingFields(draft: ProviderJobDraft): string[] {
  const missing: string[] = [];
  if (!draft.businessName.trim()) missing.push("Shop name");
  if (!draft.roleCategory.trim() && !draft.customRoleName.trim()) missing.push("Role");
  if (!draft.locality.trim()) missing.push("Locality");
  if (!draft.salaryMin) missing.push("Min salary");
  if (!draft.whatsappContact.trim()) missing.push("WhatsApp");
  return missing;
}

export default function ProviderTalk() {
  const { ready, t, effectiveLang, providerMessages, providerDraft, update } = useApp();
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastText, setLastText] = useState<{ text: string; spoken: boolean } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [localDraft, setLocalDraft] = useState<ProviderJobDraft>(providerDraft);
  const [customAreaInput, setCustomAreaInput] = useState("");
  const [selectedAreaPreset, setSelectedAreaPreset] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const manualCardRef = useRef<HTMLDivElement>(null);

  // Sync localDraft from store when it changes externally (e.g. voice updates it)
  useEffect(() => {
    setLocalDraft((prev) => ({ ...prev, ...providerDraft }));
  }, [providerDraft]);

  // Keep the newest message in view, unless the person has scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [providerMessages.length, streaming, busy, ready]);

  // When manual form scrolls up, note it visually
  useEffect(() => {
    if (showManual && manualCardRef.current) {
      manualCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showManual]);

  const saveManualDraft = useCallback(() => {
    update({ providerDraft: localDraft });
  }, [localDraft, update]);

  const send = useCallback(
    async (text: string, spoken: boolean, retrying = false) => {
      setProblem(null);
      setLastText({ text, spoken });
      setBusy(true);
      setStreaming(null);
      pinnedRef.current = true;
      const withUser: ChatMessage[] = retrying ? providerMessages : [...providerMessages, { id: newId(), role: "user", content: text }];
      if (!retrying) update({ providerMessages: withUser });
      try {
        const res = await postRaw("/api/employer-chat", {
          lang: effectiveLang,
          draft: providerDraft,
          messages: withUser.map(({ role, content }) => ({ role, content })),
        });
        const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
        let reply = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          reply += value;
          setStreaming(reply);
        }
        const id = newId();
        update({ providerMessages: [...withUser, { id, role: "assistant", content: reply }] });
        setStreaming(null);
        if (spoken) speak(id, reply, effectiveLang);

        // Extract draft details from the full conversation in the background
        const allWords = [...withUser.map(m => m.content), reply].join("\n").slice(-8000);
        postJson<{ draft: Partial<ProviderJobDraft> }>("/api/employer-extract", { lang: effectiveLang, words: allWords })
          .then(({ draft: found }) => {
            // Merge: only overwrite with non-empty/non-zero values so voice doesn't clear manual edits
            update((current) => {
              const d = current.providerDraft;
              const merged: ProviderJobDraft = {
                businessName: found.businessName || d.businessName,
                roleCategory: found.roleCategory || d.roleCategory,
                customRoleName: d.customRoleName,
                locality: (found as any).locality || d.locality,
                landmark: (found as any).landmark || d.landmark,
                salaryMin: (found as any).salaryMin > 0 ? (found as any).salaryMin : d.salaryMin,
                salaryMax: (found as any).salaryMax > 0 ? (found as any).salaryMax : d.salaryMax,
                vacancies: (found as any).vacancies > 1 ? (found as any).vacancies : d.vacancies,
                requirements: (found as any).requirements?.length ? (found as any).requirements : d.requirements,
                customNotes: (found as any).customNotes || d.customNotes,
                whatsappContact: (found as any).whatsappContact || d.whatsappContact,
                proofType: d.proofType,
                proofValue: d.proofValue,
              };
              return { providerDraft: merged };
            });
          })
          .catch(() => {});
      } catch (error) {
        setProblem(t(errorKey(error)));
      } finally {
        setBusy(false);
      }
    },
    [effectiveLang, providerMessages, providerDraft, t, update],
  );

  if (!ready) return <Shell fill><span /></Shell>;

  const greeting = t("providerGreeting");
  const ready_ = isMandatoryFilled(providerDraft);
  const missing = missingFields(providerDraft);

  const manualSheet = (
    <>
      {/* Backdrop */}
      {showManual && (
        <div
          className="sheet-backdrop"
          onClick={() => { saveManualDraft(); setShowManual(false); }}
          aria-hidden="true"
        />
      )}
      {/* Bottom sheet */}
      <div className={`manual-sheet${showManual ? " manual-sheet-open" : ""}`} ref={manualCardRef} aria-modal="true" role="dialog">
        {/* Drag handle */}
        <div className="sheet-handle-row">
          <div className="sheet-handle" />
          <button
            type="button"
            className="sheet-close-btn"
            aria-label={t("providerManualCardClose")}
            onClick={() => { saveManualDraft(); setShowManual(false); }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="sheet-title">
          <Icon name="tool" size={18} />
          {t("providerManualCardTitle")}
        </div>

        <div className="sheet-body">
          <label className="field">
            <span>{t("shopNameLabel")} *</span>
            <input
              type="text"
              placeholder={t("shopNamePlaceholder")}
              value={localDraft.businessName}
              onChange={(e) => setLocalDraft((d) => ({ ...d, businessName: e.target.value }))}
            />
          </label>

          <label className="field">
            <span>{t("roleCategoryLabel")} *</span>
            <input
              type="text"
              placeholder={t("customRolePlaceholder")}
              value={localDraft.roleCategory || localDraft.customRoleName}
              onChange={(e) => setLocalDraft((d) => ({ ...d, roleCategory: e.target.value, customRoleName: e.target.value }))}
            />
          </label>

          <div className="field">
            <span>{t("localityLabel")} *</span>
            <div className="manual-chip-row">
              {POPULAR_AREAS.map((area) => (
                <button
                  key={area}
                  type="button"
                  className="chip"
                  aria-pressed={localDraft.locality === area}
                  onClick={() => {
                    setLocalDraft((d) => ({ ...d, locality: area }));
                    setSelectedAreaPreset(area);
                  }}
                >
                  {area}
                </button>
              ))}
              <button
                type="button"
                className="chip chip-other"
                aria-pressed={selectedAreaPreset === "other"}
                onClick={() => setSelectedAreaPreset("other")}
              >
                {t("otherLocality")}
              </button>
            </div>
            {selectedAreaPreset === "other" && (
              <input
                type="text"
                className="custom-locality-input"
                placeholder={t("customLocalityPlaceholder")}
                value={customAreaInput}
                onChange={(e) => {
                  setCustomAreaInput(e.target.value);
                  setLocalDraft((d) => ({ ...d, locality: e.target.value }));
                }}
                autoFocus
              />
            )}
          </div>

          <label className="field">
            <span>{t("landmarkLabel")}</span>
            <input
              type="text"
              placeholder={t("landmarkPlaceholder")}
              value={localDraft.landmark}
              onChange={(e) => setLocalDraft((d) => ({ ...d, landmark: e.target.value }))}
            />
          </label>

          <div className="manual-salary-row">
            <label className="field">
              <span>{t("salaryMinLabel")} *</span>
              <input
                type="number"
                min={8000}
                step={1000}
                value={localDraft.salaryMin || ""}
                placeholder="16000"
                onChange={(e) => setLocalDraft((d) => ({ ...d, salaryMin: Number(e.target.value) || 0 }))}
              />
            </label>
            <span className="salary-dash">—</span>
            <label className="field">
              <span>{t("salaryMaxLabel")}</span>
              <input
                type="number"
                min={localDraft.salaryMin}
                step={1000}
                value={localDraft.salaryMax || ""}
                placeholder="22000"
                onChange={(e) => setLocalDraft((d) => ({ ...d, salaryMax: Number(e.target.value) || 0 }))}
              />
            </label>
          </div>

          <label className="field">
            <span>{t("whatsappLabel")} *</span>
            <input
              type="tel"
              placeholder="10 digit mobile number"
              value={localDraft.whatsappContact}
              onChange={(e) => setLocalDraft((d) => ({ ...d, whatsappContact: e.target.value }))}
            />
          </label>

          <label className="field">
            <span>{t("vacanciesLabel")}</span>
            <input
              type="number"
              min={1}
              max={20}
              value={localDraft.vacancies}
              onChange={(e) => setLocalDraft((d) => ({ ...d, vacancies: Math.max(1, Number(e.target.value) || 1) }))}
            />
          </label>

          <label className="field">
            <span>{t("customReqPlaceholder")}</span>
            <textarea
              rows={2}
              placeholder={t("addRequirementPlaceholder")}
              value={localDraft.customNotes}
              onChange={(e) => setLocalDraft((d) => ({ ...d, customNotes: e.target.value }))}
            />
          </label>

          <button
            type="button"
            className="btn btn-primary manual-fill-save"
            onClick={() => { saveManualDraft(); setShowManual(false); }}
          >
            <Icon name="check" size={18} />
            {t("providerManualCardClose")}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <Shell fill>
      {manualSheet}
      <div className="talk">
        <div
          className="chat"
          ref={scrollRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_PX;
          }}
        >
          <div className="chat-inner" aria-live="polite">
            {providerMessages.length === 0 && (
              <div className="bubble bubble-assistant">
                <p>{greeting}</p>
                <ReadAloud id="provider-greeting" text={greeting} />
              </div>
            )}

            {providerMessages.map((message) =>
              message.role === "assistant" ? (
                <div key={message.id} className="bubble bubble-assistant">
                  <p>{message.content}</p>
                  <ReadAloud id={message.id} text={message.content} />
                </div>
              ) : (
                <div key={message.id} className="bubble bubble-user"><p>{message.content}</p></div>
              ),
            )}
            {streaming !== null && <div className="bubble bubble-assistant"><p>{streaming}</p></div>}
            {busy && streaming === null && <Loading text={t("providerThinking")} stops={3} />}
            {problem && lastText && <ErrorNote text={problem} onRetry={() => send(lastText.text, lastText.spoken, true)} />}

            {/* Draft status banner */}
            {(providerDraft.businessName || providerDraft.locality || providerDraft.roleCategory) && !busy && (
              <div className={`provider-draft-status ${ready_ ? "is-ready" : "is-partial"}`}>
                <Icon name={ready_ ? "check" : "tool"} size={18} />
                <span>{ready_ ? t("providerReadyToPost") : t("providerMissingFields", { fields: missing.join(", ") })}</span>
                {ready_ && (
                  <Link href="/provider/listings" className="btn btn-primary provider-go-btn">
                    {t("providerGoToListing")}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="dock">
          <Composer onSend={(text, spoken) => void send(text, spoken)} busy={busy} hint={providerMessages.length === 0} />
          <div className="dock-actions-row">
            <button type="button" className="dock-switch dock-fill-btn" onClick={() => setShowManual(true)}>
              <Icon name="tool" size={20} />
              {t("providerManualFill")}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
