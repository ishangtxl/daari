import { NextResponse } from "next/server";
import { fail, handleError, rateAllowed } from "@/lib/server/route";
import { speechToText } from "@/lib/server/sarvam";
import { langSchema } from "@/lib/types";

const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request) {
  if (!rateAllowed("stt", req, 30)) return fail("too_many_requests", 429);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const lang = langSchema.safeParse(form?.get("lang"));
  if (!(file instanceof Blob) || !lang.success || file.size === 0 || file.size > MAX_BYTES) return fail("bad_request", 400);
  try {
    return NextResponse.json({ text: await speechToText(file, lang.data) });
  } catch (error) {
    return handleError("stt", error);
  }
}
