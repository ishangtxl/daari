"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-state";
import { mergeProfile } from "@/lib/profile";
import { ErrorNote, Icon, Loading, ReadAloud, Shell } from "@/components/ui";
import { errorKey, postForm, postJson, postRaw } from "@/lib/client/api";
import type { Profile, ResumeData } from "@/lib/types";

export default function Me() {
  const { ready, t, effectiveLang, profile, user, resume, resumeReview, resumeRemoved, update } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState<"upload" | "build" | "pdf" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [template, setTemplate] = useState<"clear" | "trade">("clear");
  const fileInput = useRef<HTMLInputElement>(null);
  // The number someone signed in with is the one employers should call, unless they say otherwise.
  const signedInPhone = user?.provider === "phone" ? user.id.replace(/^\+91/, "") : "";
  useEffect(() => {
    if (ready && !profile.phone && signedInPhone) update((current) => ({ profile: { ...current.profile, phone: current.profile.phone || signedInPhone } }));
  }, [ready, profile.phone, signedInPhone, update]);

  if (!ready) return <Shell><span /></Shell>;

  const setField = (key: "name" | "phone" | "area", value: string) => update({ profile: { ...profile, [key]: value } });
  const hasWork = profile.words.trim().length > 0 || profile.skills.length > 0 || profile.experience.length > 0;

  async function upload(file: File) {
    setBusy("upload");
    setProblem(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await postForm<{ words: string }>("/api/resume/parse", form);
      const words = `${profile.words}\n${result.words}`.trim().slice(-12000);
      const found = await postJson<{ profile: Partial<Profile> }>("/api/profile", { words });
      update((current) => ({ profile: { ...mergeProfile(current.profile, found.profile), words } }));
      setNotice(t("uploaded"));
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(null);
    }
  }

  async function build() {
    setBusy("build");
    setProblem(null);
    setConfirmed(false);
    try {
      const result = await postJson<{ resume: ResumeData; review: string[]; removed: string[] }>("/api/resume/build", { lang: effectiveLang, profile });
      update({ resume: result.resume, resumeReview: result.review, resumeRemoved: result.removed });
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!resume) return;
    if (!profile.name.trim()) {
      setProblem(t("needName"));
      return;
    }
    setBusy("pdf");
    setProblem(null);
    try {
      const body = { resume: { ...resume, name: profile.name, phone: profile.phone, area: profile.area }, template };
      const blob = await (await postRaw("/api/resume/pdf", body)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${profile.name.replace(/[^a-zA-Z0-9]+/g, "_")}_resume.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(null);
    }
  }

  const facts: [string, string][] = [
    [t("skills"), profile.skills.join(", ")],
    [t("experience"), profile.experience.map((item) => [item.role, item.place, item.years && `${item.years} yr`].filter(Boolean).join(", ")).join("; ")],
    [t("education"), profile.education],
    [t("wants"), profile.wantedWork.join(", ")],
  ].filter(([, value]) => value) as [string, string][];

  return (
    <Shell>
      <div className="page">
        <header className="page-head">
          <h1>{t("meTitle")}</h1>
          <p>{t("meSub")}</p>
        </header>

        <div className="fields">
          <label className="field"><span>{t("name")}</span><input value={profile.name} autoComplete="name" onChange={(event) => setField("name", event.target.value)} /></label>
          <label className="field"><span>{t("phone")}</span><input value={profile.phone} inputMode="tel" autoComplete="tel" onChange={(event) => setField("phone", event.target.value)} /></label>
          <label className="field"><span>{t("area")}</span><input value={profile.area} onChange={(event) => setField("area", event.target.value)} /></label>
        </div>

        <section>
          <h2>{t("whatIKnow")}</h2>
          {facts.length ? (
            <dl className="facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          ) : (
            <p className="empty-text">{t("nothingYet")}</p>
          )}
        </section>

        <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.target.value = ""; }} />
        <div className="row-actions">
          <button type="button" className="btn btn-primary" disabled={busy !== null || !hasWork} onClick={build}>{t("buildResume")}</button>
          <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={() => router.push("/talk?from=resume")}>{t("addMoreInfo")}</button>
          <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={() => fileInput.current?.click()}>{t("uploadResume")}</button>
        </div>
        {!hasWork && <p className="honest-note">{t("needWork")}</p>}
        {busy === "upload" && <Loading text={t("uploading")} />}
        {busy === "build" && <Loading text={t("building")} />}
        {notice && <p className="all-met"><Icon name="check" />{notice}</p>}
        {problem && <ErrorNote text={problem} />}

        {resume && (
          <section className="review">
            <h2>{t("reviewTitle")}</h2>
            <p>{t("reviewSub")}</p>
            <ul className="review-list">{resumeReview.map((line, index) => <li key={index}>{line}</li>)}</ul>
            <ReadAloud id="resume-review" text={resumeReview.join(". ")} />
            {resumeRemoved.length > 0 && (
              <div className="removed">
                <p>{t("removedNote")}</p>
                <ul>{resumeRemoved.map((line, index) => <li key={index}>{line}</li>)}</ul>
              </div>
            )}
            <label className="confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t("reviewConfirm")}</span></label>
            <fieldset className="template-pick">
              <legend>{t("template")}</legend>
              <label><input type="radio" name="template" checked={template === "clear"} onChange={() => setTemplate("clear")} />{t("templateClear")}</label>
              <label><input type="radio" name="template" checked={template === "trade"} onChange={() => setTemplate("trade")} />{t("templateTrade")}</label>
            </fieldset>
            <button type="button" className="btn btn-primary" disabled={!confirmed || busy !== null} onClick={download}>
              {busy === "pdf" ? <span className="spinner" /> : <Icon name="download" />}
              {t("downloadPdf")}
            </button>
          </section>
        )}
      </div>
    </Shell>
  );
}
