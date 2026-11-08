import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { closeJob, getJobById } from "@/lib/server/jobs-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJobById(id);
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

  return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
}
