import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { closeJob, getJobById, requestFeatured } from "@/lib/server/jobs-store";
import { allJobs } from "@/lib/server/match";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = (await getJobById(id)) || allJobs().find((j) => j.id === id) || null;
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !session.sub) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();

  if (body.action === "close") {
    const success = await closeJob(id, session.sub);
    if (!success) {
      return NextResponse.json({ ok: false, error: "Failed to close job or not owner" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "request_featured") {
    const result = requestFeatured(id, session.sub);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : result.reason === "not_owner" ? 403 : 409;
      return NextResponse.json({ ok: false, error: result.reason }, { status });
    }
    return NextResponse.json({ ok: true, approved: result.approved });
  }

  return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
}
