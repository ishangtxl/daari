import { z } from "zod";
import { chatJson, looseList, looseText } from "@/lib/server/llm";
import { evidence } from "@/lib/server/match";
import { searchPlaces } from "@/lib/server/places";
import { outreachPrompt } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { roleById } from "@/lib/roles";
import { langSchema, profileSchema } from "@/lib/types";

const schema = z.object({ lang: langSchema, roleId: z.string().max(40), area: z.string().max(120).default(""), profile: profileSchema });

const draftSchema = z.object({
  message_en: looseText,
  message_local: looseText,
  call_script: looseText,
  tips: looseList,
});

export const POST = jsonRoute("outreach", schema, async ({ lang, roleId, area, profile }) => {
  const role = roleById(roleId);
  const query = `${role?.placesQuery ?? role?.en ?? "shop"} near ${area || "Bengaluru"}, Bengaluru`;
  const [places, draft] = await Promise.all([
    searchPlaces(query),
    chatJson("outreach", draftSchema, [
      { role: "system", content: outreachPrompt(lang) },
      { role: "user", content: `Kind of business: ${role?.placesQuery ?? role?.en}\nThe person's own words:\n${evidence(profile)}` },
    ]),
  ]);
  return { places, draft, mapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(query)}` };
}, 15);
