"use client";

import Link from "next/link";
import type { StringKey } from "@/lib/i18n";
import { ROAD_LINKS, stepDone } from "@/lib/client/road";
import type { RoadAction, Roadmap } from "@/lib/types";
import { useApp } from "./app-state";
import { Icon, ReadAloud } from "./ui";

const ACTION_LABEL: Record<RoadAction, StringKey> = {
  jobs: "roadJobs",
  learn: "roadLearn",
  resume: "roadResume",
  check: "roadCheck",
  talk: "roadTalk",
};

/**
 * The plan drawn as a road: one stop per step, ending at where it leads. Steps tick themselves off
 * once their page has produced something, so the road shows progress when someone comes back.
 */
export function RoadMap({ roadmap, id, onTalk }: { roadmap: Roadmap; id: string; onTalk?: () => void }) {
  const { t, applications, plan, resume } = useApp();
  const done = roadmap.steps.map((step) => stepDone(step.action, { applications, plan, resume }));
  const next = done.findIndex((isDone) => !isDone);
  const spoken = [roadmap.understood, ...roadmap.steps.map((step, index) => `${index + 1}. ${step.title}. ${step.why}`), roadmap.destination].join(" ");

  return (
    <section className="road" aria-label={t("roadTitle")}>
      <div className="road-head">
        <h2>{t("roadTitle")}</h2>
        <ReadAloud id={`${id}-read`} text={spoken} />
      </div>
      <p className="road-understood">{roadmap.understood}</p>
      <p className="road-fix">{t("roadFix")}</p>
      <ol className="road-steps">
        {roadmap.steps.map((step, index) => {
          const label = t(ACTION_LABEL[step.action]);
          const primary = index === next;
          const className = primary ? "btn btn-primary" : "btn btn-quiet";
          return (
            <li key={`${step.action}-${index}`} className="road-step" data-done={done[index] || undefined} data-next={primary || undefined}>
              <span className="road-stop" aria-hidden="true">{done[index] && <Icon name="check" size={14} />}</span>
              <div className="road-step-body">
                <h3>{step.title}</h3>
                <p>{step.why}</p>
                <div className="road-step-actions">
                  {step.action === "talk" && onTalk ? (
                    <button type="button" className={className} onClick={onTalk}>{label}</button>
                  ) : (
                    <Link href={ROAD_LINKS[step.action]} className={className}>{label}</Link>
                  )}
                  {done[index] && <span className="road-done"><Icon name="check" size={18} />{t("roadDone")}</span>}
                </div>
              </div>
            </li>
          );
        })}
        <li className="road-step road-destination">
          <span className="road-end" aria-hidden="true" />
          <div className="road-step-body">
            <strong>{roadmap.destination}</strong>
          </div>
        </li>
      </ol>
    </section>
  );
}
