import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { fail, handleError, rateAllowed } from "@/lib/server/route";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  if (!rateAllowed("resume-parse", req, 10)) return fail("too_many_requests", 429);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_BYTES) return fail("bad_request", 400);
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    const words = text.replace(/\s+/g, " ").trim().slice(0, 8000);
    // A scanned resume has no text layer. The page offers talking through it instead.
    if (words.length < 40) return fail("no_text", 422);
    return NextResponse.json({ words });
  } catch (error) {
    return handleError("resume-parse", error);
  }
}
