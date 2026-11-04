"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp, type PlanStep } from "@/components/app-state";
import { PlanSteps } from "@/components/plan-steps";
import { ErrorNote, Icon, Loading, Shell, TabebuiaTree } from "@/components/ui";
import { errorKey, postJson } from "@/lib/client/api";

export default function Learn() {
  const { ready, t, effectiveLang, jobs, plan, profile, update } = useApp();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The gaps that come up most across the person's best jobs are the ones most worth closing.
  const gaps = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const job of (jobs ?? []).slice(0, 10)) {
      for (const stop of job.stops) {
        if (stop.status === "met") continue;
        const req = job.requirements.find((item) => item.id === stop.id);
        if (!req) continue;
        const entry = counts.get(req.en) ?? { label: req[effectiveLang], count: 0 };
        entry.count++;
        counts.set(req.en, entry);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6);
  }, [jobs, effectiveLang]);

  async function makePlan() {
    setBusy(true);
    setProblem(null);
    try {
      const result = await postJson<{ steps: PlanStep[] }>("/api/plan", {
        lang: effectiveLang,
        gaps: gaps.map(([english]) => english),
        work: profile.wantedWork.join(", ") || jobs?.[0]?.title.en || "",
      });
      update({ plan: result.steps });
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Shell><span /></Shell>;
  return (
    <Shell>
      <div className="page">
        <header className="page-head">
          <h1>{t("learnTitle")}</h1>
          <p>{t("learnSub")}</p>
        </header>
        {!gaps.length ? (
          <div className="empty">
            <TabebuiaTree className="empty-tree" />
            <p>{t("learnEmpty")}</p>
            <Link href="/jobs" className="btn btn-primary"><Icon name="briefcase" />{t("seeJobs")}</Link>
          </div>
        ) : (
          <>
            <section>
              <h2>{t("learnGaps")}</h2>
              <ul className="gap-list">{gaps.map(([english, gap]) => <li key={english}>{gap.label}</li>)}</ul>
            </section>
            {!plan && !busy && <button type="button" className="btn btn-primary" onClick={makePlan}>{t("makePlan")}</button>}
            {busy && <Loading text={t("planLoading")} stops={3} />}
            {problem && <ErrorNote text={problem} onRetry={makePlan} />}
            {plan && <PlanSteps steps={plan} idPrefix="learn" />}
          </>
        )}
      </div>
    </Shell>
  );
}
