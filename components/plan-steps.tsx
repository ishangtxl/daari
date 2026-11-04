"use client";

import type { PlanStep } from "./app-state";
import { useApp } from "./app-state";
import { Icon, ReadAloud } from "./ui";

export function PlanSteps({ steps, idPrefix }: { steps: PlanStep[]; idPrefix: string }) {
  const { t } = useApp();
  return (
    <ol className="plan">
      {steps.map((step, index) => (
        <li key={index} className="plan-step">
          <h3>{step.title}</h3>
          <p>{step.why}</p>
          <dl>
            <div><dt>{t("takes")}</dt><dd>{step.time}</dd></div>
            <div><dt>{t("practice")}</dt><dd>{step.practice}</dd></div>
          </dl>
          <div className="row-actions">
            <a className="btn btn-quiet" href={step.youtube} target="_blank" rel="noreferrer">
              <Icon name="external" size={20} />
              {t("watchVideos")}
            </a>
            {step.course && (
              <a className="btn btn-quiet" href={step.course.url} target="_blank" rel="noreferrer">
                <Icon name="external" size={20} />
                {step.course.source}: {step.course.title}
              </a>
            )}
            <ReadAloud id={`${idPrefix}-${index}`} text={`${step.title}. ${step.why}. ${step.practice}`} />
          </div>
        </li>
      ))}
    </ol>
  );
}
