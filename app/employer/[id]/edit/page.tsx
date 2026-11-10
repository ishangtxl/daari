"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-state";
import { PostingEditor } from "@/components/posting-editor";
import { ErrorNote, Icon, Loading, Shell } from "@/components/ui";
import { errorKey, getJson } from "@/lib/client/api";
import type { PostingSummary } from "@/lib/postings";

export default function EditPosting() {
  const { id } = useParams<{ id: string }>();
  const { ready, t } = useApp();
  const [posting, setPosting] = useState<PostingSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    getJson<{ posting: PostingSummary }>(`/api/employer/postings/${id}`)
      .then((result) => setPosting(result.posting))
      .catch((error) => setProblem(t(errorKey(error))));
  }, [id, t]);
  if (!ready) return <Shell><span /></Shell>;
  return (
    <Shell>
      <div className="page">
        <Link href={`/employer/${id}`} className="back-link"><Icon name="back" size={20} />{t("backToPosting")}</Link>
        <header className="page-head"><h1>{t("editPosting")}</h1></header>
        {problem ? <ErrorNote text={problem} /> : posting ? <PostingEditor initial={posting.body.form} postingId={id} /> : <Loading text={t("loadingPostings")} />}
      </div>
    </Shell>
  );
}
