"use client";

import { useApp } from "@/components/app-state";
import { Icon, Shell } from "@/components/ui";

export default function ProviderApplicants() {
  const { ready, t } = useApp();
  if (!ready) return <Shell><span /></Shell>;

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <h1>{t("providerApplicantsTitle")}</h1>
        </div>
        <div className="empty">
          <Icon name="users" size={48} />
          <p className="empty-text">{t("providerApplicantsEmpty")}</p>
        </div>
      </div>
    </Shell>
  );
}
