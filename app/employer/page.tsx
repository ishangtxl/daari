"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import { ErrorNote, Icon, Loading, PayText, Shell } from "@/components/ui";
import { errorKey, getJson } from "@/lib/client/api";
import { StateLine } from "@/components/hiring";
import { payText, type PostingSummary } from "@/lib/postings";

export default function Postings() {
  const { ready, t, effectiveLang } = useApp();
  const [postings, setPostings] = useState<PostingSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setPostings((await getJson<{ postings: PostingSummary[] }>("/api/employer/postings")).postings);
    } catch (error) {
      setProblem(t(errorKey(error)));
    }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  if (!ready) return <Shell><span /></Shell>;
  return (
    <Shell>
      <div className="page">
        <header className="page-head">
          <h1>{t("employerTitle")}</h1>
          <p>{t("employerSub")}</p>
        </header>
        {problem ? <ErrorNote text={problem} onRetry={load} /> : postings === null ? <Loading text={t("loadingPostings")} /> : postings.length === 0 ? (
          <section className="hire-how">
            <h2>{t("employerEmptyTitle")}</h2>
            <ol className="hire-steps">
              <li><Icon name="mic" size={26} /><p>{t("employerHow1")}</p></li>
              <li><Icon name="shield" size={26} /><p>{t("employerHow2")}</p></li>
              <li><Icon name="phone" size={26} /><p>{t("employerHow3")}</p></li>
            </ol>
            <Link href="/employer/new" className="btn btn-primary"><Icon name="plus" />{t("postJob")}</Link>
          </section>
        ) : (
          <>
            <Link href="/employer/new" className="btn btn-primary hire-new"><Icon name="plus" />{t("postJob")}</Link>
            <ul className="job-list">
              {postings.map((posting) => (
                <li key={posting.id}>
                  <Link href={`/employer/${posting.id}`} className="job-row posting-row" data-state={posting.state}>
                    <div className="job-row-head">
                      <h3>{posting.body.title[effectiveLang]}</h3>
                      <PayText className="job-pay" text={payText(posting.body.form)} />
                    </div>
                    <p className="job-where">{posting.body.form.business}, {posting.body.form.area}</p>
                    <p className="posting-meta">
                      <StateLine posting={posting} />
                      <span>{posting.applicants ? t("applicantCount", { count: posting.applicants }) : t("noApplicantsYet")}</span>
                      {posting.fresh > 0 && <span className="count-badge">{t("applicantsNew", { count: posting.fresh })}</span>}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Shell>
  );
}
