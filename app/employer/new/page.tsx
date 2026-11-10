"use client";

import Link from "next/link";
import { useApp } from "@/components/app-state";
import { PostingEditor } from "@/components/posting-editor";
import { Icon, Shell } from "@/components/ui";

export default function NewPosting() {
  const { ready, t } = useApp();
  if (!ready) return <Shell><span /></Shell>;
  return (
    <Shell>
      <div className="page">
        <Link href="/employer" className="back-link"><Icon name="back" size={20} />{t("backToPostings")}</Link>
        <header className="page-head"><h1>{t("postJob")}</h1></header>
        <PostingEditor />
      </div>
    </Shell>
  );
}
