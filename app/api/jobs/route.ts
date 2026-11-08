import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveJobs, saveJob } from "@/lib/server/jobs-store";
import { allJobs } from "@/lib/server/match";
import {
  enrichJobWithAI,
  screenJobScam,
  validateBusinessProof,
  type JobPostInput,
} from "@/lib/server/job-verification";
import type { BusinessVerification, FullJob } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase();
    const role = searchParams.get("role")?.toLowerCase();
    const area = searchParams.get("area")?.toLowerCase() || searchParams.get("locality")?.toLowerCase();
    const minSalaryStr = searchParams.get("minSalary");
    const minSalary = minSalaryStr ? Number(minSalaryStr) : undefined;
    const source = searchParams.get("source");

    const jobs = source === "direct" ? await getActiveJobs() : allJobs();

    let filtered = jobs;
    if (role) {
      filtered = filtered.filter(
        (j) =>
          j.roles?.some((r) => r.toLowerCase().includes(role)) ||
          j.title?.en?.toLowerCase().includes(role) ||
          j.title?.kn?.toLowerCase().includes(role) ||
          j.title?.hi?.toLowerCase().includes(role),
      );
    }
    if (area) {
      filtered = filtered.filter((j) => j.area?.toLowerCase().includes(area));
    }
    if (minSalary && !isNaN(minSalary)) {
      filtered = filtered.filter((j) => (j.salaryMin ?? 0) >= minSalary);
    }
    if (query) {
      filtered = filtered.filter(
        (j) =>
          j.title?.en?.toLowerCase().includes(query) ||
          j.title?.kn?.toLowerCase().includes(query) ||
          j.title?.hi?.toLowerCase().includes(query) ||
          j.area?.toLowerCase().includes(query) ||
          j.employer?.toLowerCase().includes(query) ||
          j.description?.toLowerCase().includes(query),
      );
    }

    return NextResponse.json({ ok: true, jobs: filtered });
  } catch (err: unknown) {
    console.error("[api/jobs GET] Failed to list jobs:", err);
    return NextResponse.json({ ok: false, error: "Failed to load jobs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.sub) {
      return NextResponse.json(
        { ok: false, error: "Authentication required to post a job vacancy." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const {
      businessName,
      roleCategory,
      locality,
      landmark,
      salaryMin,
      salaryMax,
      selectedRequirements,
      customNotes,
      whatsappContact,
      verification,
    } = body;

    if (!businessName?.trim()) {
      return NextResponse.json({ ok: false, error: "Business or shop name is required." }, { status: 400 });
    }
    if (!roleCategory?.trim()) {
      return NextResponse.json({ ok: false, error: "Job role / trade is required." }, { status: 400 });
    }
    if (!locality?.trim()) {
      return NextResponse.json({ ok: false, error: "Locality in Bengaluru is required." }, { status: 400 });
    }

    // 1. Business proof validation
    const proofType = verification?.proofType ?? "none";
    const proofValue = verification?.proofValue?.trim();
    const proofCheck = validateBusinessProof(proofType, proofValue);
    if (!proofCheck.valid) {
      return NextResponse.json({ ok: false, error: proofCheck.reason }, { status: 400 });
    }

    // 2. Scam & Fraud detection
    const combinedListingText = `${businessName} ${roleCategory} ${locality} ${landmark || ""} ${customNotes || ""} ${selectedRequirements?.join(" ") || ""}`;
    const scamCheck = await screenJobScam(combinedListingText);
    if (scamCheck.isScam) {
      return NextResponse.json(
        {
          ok: false,
          error: scamCheck.reason || "Posting flagged for security review. Daari prohibits charging fees or deposits.",
          signals: scamCheck.signals,
        },
        { status: 422 },
      );
    }

    // 3. AI Enrichment (Multilingual titles, summary, and stops)
    const input: JobPostInput = {
      businessName: businessName.trim(),
      roleCategory: roleCategory.trim(),
      locality: locality.trim(),
      landmark: (landmark || "").trim(),
      salaryMin: Number(salaryMin) || 15000,
      salaryMax: Number(salaryMax) || Number(salaryMin) || 20000,
      selectedRequirements: Array.isArray(selectedRequirements) ? selectedRequirements : [],
      customNotes: customNotes?.trim(),
      whatsappContact: (whatsappContact || session.sub).trim(),
      verification: {
        proofType,
        proofValue,
      },
    };

    const enriched = await enrichJobWithAI(input);

    // 4. Construct FullJob
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const rawContact = whatsappContact || session.sub || "";
    const cleanPhone = rawContact.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      return NextResponse.json(
        { ok: false, error: "A valid 10-digit phone number is required for WhatsApp inquiries." },
        { status: 400 },
      );
    }
    const waNumber = cleanPhone.startsWith("91") && cleanPhone.length === 12 ? cleanPhone : `91${cleanPhone.slice(-10)}`;
    const jobId = `job_shop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const isVerifiedProof = proofType !== "none";
    const bizVerification: BusinessVerification = {
      proofType,
      proofValue,
      isVerified: isVerifiedProof,
      businessName: input.businessName,
      businessAddress: input.landmark ? `${input.landmark}, ${input.locality}` : input.locality,
      locality: input.locality,
    };

    const mappedRoles = (() => {
      const cat = input.roleCategory.toLowerCase();
      if (cat.includes("mobile")) return ["mobile_repair", "cctv"];
      if (cat.includes("electr")) return ["electrician", "diploma_elec"];
      if (cat.includes("plumb")) return ["plumber"];
      if (cat.includes("mech") || cat.includes("auto") || cat.includes("garage")) return ["auto_mech", "fitter"];
      if (cat.includes("tailor") || cat.includes("garment")) return ["tailor"];
      if (cat.includes("retail") || cat.includes("sales") || cat.includes("shop")) return ["sales", "office_admin"];
      if (cat.includes("driver") || cat.includes("delivery")) return ["driver"];
      return ["apprentice"];
    })();

    const job: FullJob = {
      id: jobId,
      roles: mappedRoles,
      title: enriched.title,
      employer: input.businessName,
      area: input.locality,
      summary: enriched.summary,
      publisher: "Daari Direct",
      applyLink: `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Namaskara! I saw your vacancy for "${enriched.title.en}" on Daari. I would like to apply.`,
      )}`,
      postedAt: now.toISOString(),
      salaryText: `₹${input.salaryMin.toLocaleString("en-IN")} - ₹${input.salaryMax.toLocaleString("en-IN")}`,
      salaryMin: input.salaryMin,
      genderRestriction: null,
      requirements: enriched.requirements,
      signals: scamCheck.signals,
      description: input.customNotes
        ? `${input.customNotes}\n\nShop Address: ${bizVerification.businessAddress}`
        : `Direct vacancy at ${input.businessName}, ${bizVerification.businessAddress}`,
      metadata: {
        source: "direct_employer",
        posterPhone: session.sub,
        posterName: session.name,
        posterId: session.sub,
        verification: bizVerification,
        whatsappContact: waNumber,
        status: "active",
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      },
    };

    await saveJob(job);
    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (err: unknown) {
    console.error("[api/jobs POST] Error saving job vacancy:", err);
    return NextResponse.json({ ok: false, error: "An unexpected error occurred while posting the job." }, { status: 500 });
  }
}
