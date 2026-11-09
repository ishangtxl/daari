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
          {step.videos?.length ? (
            <ul className="videos">
              {step.videos.map((video) => (
                <li key={video.url}>
                  <a className="video" href={video.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- small YouTube thumbnail, no resizing needed */}
                    <img src={video.thumbnail} alt="" width={128} height={72} loading="lazy" />
                    <span>
                      <strong>{video.title}</strong>
                      <span className="video-meta">
                        {video.channel} · {video.kind === "playlist" ? t("playlistOf", { n: video.length }) : video.length}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="row-actions">
            <a className="btn btn-quiet" href={step.youtube} target="_blank" rel="noreferrer">
              <Icon name="external" size={20} />
              {t(step.videos?.length ? "moreVideos" : "watchVideos")}
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
