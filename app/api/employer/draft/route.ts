import { z } from "zod";
import { accountRoute } from "@/lib/server/account";
import { draftPosting } from "@/lib/server/hiring";
import { screenVerdict } from "@/lib/postings";
import { langSchema } from "@/lib/types";

const schema = z.object({ lang: langSchema, words: z.string().trim().min(10).max(4000) });

/** A first draft of a posting from what the employer said, checked before they spend time on it. */
export const POST = accountRoute("posting-draft", schema, async ({ lang, words }) => {
  const { draft, roleId, signals } = await draftPosting(lang, words);
  return { draft, roleId, ...screenVerdict(signals) };
}, 15);
