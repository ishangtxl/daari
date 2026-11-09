import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { validateBusinessProof, screenJobScam } from "../lib/server/job-verification";
import { getActiveJobs, saveJob, getJobById, closeJob } from "../lib/server/jobs-store";
import { allJobs } from "../lib/server/match";
import type { FullJob } from "../lib/types";
import { GET as getJobsRoute, POST as postJobRoute } from "../app/api/jobs/route";
import { GET as getJobByIdRoute, PATCH as patchJobByIdRoute } from "../app/api/jobs/[id]/route";
import { translate } from "../lib/i18n";

let mockSession: { sub: string; name?: string; provider: "phone" | "google" } | null = null;
vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return {
    ...actual,
    getSession: () => Promise.resolve(mockSession),
  };
});

describe("Business Verification Validator", () => {
  it("validates legitimate Karnataka GSTIN format", () => {
    const res = validateBusinessProof("gstin", "29ABCDE1234F1Z5");
    expect(res.valid).toBe(true);
  });

  it("rejects invalid GSTIN format", () => {
    const res = validateBusinessProof("gstin", "INVALID_GST_123");
    expect(res.valid).toBe(false);
    expect(res.reason).toBeDefined();
  });

  it("validates valid Udyam registration number", () => {
    const res = validateBusinessProof("udyam", "UDYAM-KR-03-0123456");
    expect(res.valid).toBe(true);
  });

  it("rejects invalid Udyam format", () => {
    const res = validateBusinessProof("udyam", "UDYAM-1234");
    expect(res.valid).toBe(false);
  });

  it("validates merchant UPI VPA handles", () => {
    expect(validateBusinessProof("merchant_upi", "sriraghavendra@paytm").valid).toBe(true);
    expect(validateBusinessProof("merchant_upi", "bangaloremobiles@phonepe").valid).toBe(true);
    expect(validateBusinessProof("merchant_upi", "autoclinic@icici").valid).toBe(true);
  });

  it("rejects invalid UPI handle format", () => {
    expect(validateBusinessProof("merchant_upi", "not-a-vpa").valid).toBe(false);
  });

  it("accepts storefront proof without formal ID", () => {
    expect(validateBusinessProof("storefront").valid).toBe(true);
    expect(validateBusinessProof("none").valid).toBe(true);
  });
});

describe("Job Scam Screening", () => {
  it("immediately blocks listings that demand candidate registration fees or deposits", async () => {
    const result = await screenJobScam("Immediate job offer for electrician. Candidate must pay 500 registration fee before joining.");
    expect(result.isScam).toBe(true);
    expect(result.reason).toContain("Demanding payment or fees");
  });

  it("blocks uniform charges or training fees", async () => {
    const result = await screenJobScam("Mobile repair shop helper. Pay ₹1000 security deposit for uniform kit.");
    expect(result.isScam).toBe(true);
  });

  it("allows legitimate local repair shop vacancies", async () => {
    const result = await screenJobScam("Looking for experienced mobile screen replacement technician in Jayanagar 4th Block. Salary 18000 to 22000 per month.");
    expect(result.isScam).toBe(false);
  });
});

describe("Job Store and Match Engine Integration", () => {
  const testJobId = `job_test_${Date.now()}`;
  const mockJob: FullJob = {
    id: testJobId,
    roles: ["mobile_repair"],
    title: {
      en: "Mobile Technician at Test Clinic",
      hi: "टेस्ट क्लिनिक में मोबाइल टेक्नीशियन",
      kn: "ಟೆಸ್ಟ್ ಕ್ಲಿನಿಕ್‌ನಲ್ಲಿ ಮೊಬೈಲ್ ತಂತ್ರಜ್ಞ",
    },
    summary: {
      en: "Immediate vacancy in Jayanagar.",
      hi: "जयनगर में तत्काल भर्ती।",
      kn: "ಜಯನಗರದಲ್ಲಿ ತುರ್ತು ನೇಮಕಾತಿ.",
    },
    employer: "Test Mobile Clinic",
    area: "Jayanagar",
    publisher: "Daari Direct",
    applyLink: "https://wa.me/919999999999",
    postedAt: new Date().toISOString(),
    salaryText: "₹18,000 - ₹22,000",
    salaryMin: 18000,
    genderRestriction: null,
    requirements: [
      {
        id: "req_soldering",
        en: "Experience with display change and soldering",
        hi: "डिस्प्ले चेंज और सोल्डरिंग का अनुभव",
        kn: "ಡಿಸ್ಪ್ಲೇ ಬದಲಾವಣೆ ಮತ್ತು ಸಾಲ್ಡರಿಂಗ್ ಅನುಭವ",
        kind: "skill",
      },
    ],
    signals: { asks_payment: 0, asks_sensitive: 0, unrealistic: 0 },
    description: "Test direct vacancy",
    metadata: {
      source: "direct_employer",
      posterPhone: "+919999999999",
      posterId: "+919999999999",
      verification: {
        proofType: "merchant_upi",
        proofValue: "test@paytm",
        isVerified: true,
        businessName: "Test Mobile Clinic",
        businessAddress: "Jayanagar 4th block",
        locality: "Jayanagar",
      },
      whatsappContact: "919999999999",
      status: "active",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  };

  it("persists direct shop jobs and retrieves them in getActiveJobs", async () => {
    await saveJob(mockJob);
    const active = await getActiveJobs();
    expect(active.some((j) => j.id === testJobId)).toBe(true);

    const retrieved = await getJobById(testJobId);
    expect(retrieved?.employer).toBe("Test Mobile Clinic");
  });

  it("seamlessly merges direct shop jobs into allJobs for candidate matching", () => {
    const jobs = allJobs();
    expect(jobs.some((j) => j.id === testJobId)).toBe(true);
    // Direct shop jobs should be placed at the top of the catalog
    expect(jobs[0].publisher).toBe("Daari Direct");
  });

  it("allows verified poster to close their listing and immediately reflects in allJobs", async () => {
    const closed = await closeJob(testJobId, "+919999999999");
    expect(closed).toBe(true);

    const active = await getActiveJobs();
    expect(active.some((j) => j.id === testJobId)).toBe(false);

    // Verify allJobs immediately omits closed jobs without stale cache lag
    const jobs = allJobs();
    expect(jobs.some((j) => j.id === testJobId)).toBe(false);
  });
});

describe("Multilingual Brand Marks & Taglines Verification", () => {
  it("verifies accurate brand marks and subtitles for all 3 supported languages", () => {
    expect(translate("en", "loginHeroTitle")).toBe("Your path to skilled work in Bengaluru");
    expect(translate("kn", "loginHeroTitle")).toBe("ಬೆಂಗಳೂರಿನಲ್ಲಿ ಕೌಶಲ್ಯದ ಕೆಲಸಕ್ಕೆ ನಿಮ್ಮ ದಾರಿ");
    expect(translate("hi", "loginHeroTitle")).toBe("बेंगलुरु में कुशल काम के लिए आपका रास्ता");

    expect(translate("en", "intentSeekerTitle")).toBe("I am looking for a job");
    expect(translate("en", "intentEmployerTitle")).toBe("I want to hire workers");
    expect(translate("kn", "intentSeekerTitle")).toBe("ನನಗೆ ಕೆಲಸ ಬೇಕಾಗಿದೆ");
    expect(translate("kn", "intentEmployerTitle")).toBe("ನನ್ನ ಅಂಗಡಿಗೆ ಕೆಲಸಗಾರರು ಬೇಕಾಗಿದ್ದಾರೆ");
    expect(translate("hi", "intentSeekerTitle")).toBe("मुझे काम चाहिए");
    expect(translate("hi", "intentEmployerTitle")).toBe("मुझे कामगार चाहिए");
  });
});

describe("Jobs API HTTP Endpoints (/api/jobs and /api/jobs/[id])", () => {
  beforeEach(() => {
    mockSession = null;
  });

  it("GET /api/jobs returns active jobs and supports query filtering", async () => {
    const req = new NextRequest("http://localhost:3000/api/jobs");
    const res = await getJobsRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.jobs)).toBe(true);

    // Test role filtering
    const roleReq = new NextRequest("http://localhost:3000/api/jobs?role=mobile");
    const roleRes = await getJobsRoute(roleReq);
    expect(roleRes.status).toBe(200);
    const roleBody = await roleRes.json();
    expect(roleBody.ok).toBe(true);
    // Test area filtering
    const areaReq = new NextRequest("http://localhost:3000/api/jobs?area=jayanagar");
    const areaRes = await getJobsRoute(areaReq);
    expect(areaRes.status).toBe(200);
    const areaBody = await areaRes.json();
    expect(areaBody.ok).toBe(true);

    // Test minSalary filtering
    const salaryReq = new NextRequest("http://localhost:3000/api/jobs?minSalary=18000");
    const salaryRes = await getJobsRoute(salaryReq);
    expect(salaryRes.status).toBe(200);
    const salaryBody = await salaryRes.json();
    expect(salaryBody.ok).toBe(true);
    expect(salaryBody.jobs.every((j: FullJob) => (j.salaryMin ?? 0) >= 18000)).toBe(true);
  });

  it("POST /api/jobs rejects unauthenticated requests with 401", async () => {
    mockSession = null;
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        businessName: "Shop A",
        roleCategory: "Electrician",
        locality: "Jayanagar",
      }),
    });
    const res = await postJobRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("POST /api/jobs rejects missing required fields with 400", async () => {
    mockSession = { sub: "+919999999999", name: "Tester", provider: "phone" };
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        businessName: "",
        roleCategory: "Electrician",
        locality: "Jayanagar",
      }),
    });
    const res = await postJobRoute(req);
    expect(res.status).toBe(400);
  });

  it("POST /api/jobs rejects invalid phone number with 400", async () => {
    mockSession = { sub: "user-without-phone@gmail.com", name: "Tester", provider: "google" };
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        businessName: "Real Shop",
        roleCategory: "Electrician",
        locality: "Jayanagar",
        whatsappContact: "123", // invalid < 10 digits
      }),
    });
    const res = await postJobRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("10-digit phone number");
  });

  it("POST /api/jobs rejects invalid business proof with 400", async () => {
    mockSession = { sub: "+919999999999", name: "Tester", provider: "phone" };
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        businessName: "Real Shop",
        roleCategory: "Electrician",
        locality: "Jayanagar",
        verification: { proofType: "gstin", proofValue: "INVALID_GST" },
      }),
    });
    const res = await postJobRoute(req);
    expect(res.status).toBe(400);
  });

  it("POST /api/jobs blocks scam job listings demanding fees with 422", async () => {
    mockSession = { sub: "+919999999999", name: "Tester", provider: "phone" };
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        businessName: "Fraud Garage",
        roleCategory: "Mechanic",
        locality: "Peenya",
        customNotes: "Selected candidates must pay a 1500 registration fee for tools kit.",
      }),
    });
    const res = await postJobRoute(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("POST /api/jobs successfully publishes a legitimate vacancy", async () => {
    mockSession = { sub: "+919876543210", name: "Shankar Garage", provider: "phone" };
    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        businessName: "Shankar Two-Wheeler Works",
        roleCategory: "Two-Wheeler / Auto Mechanic",
        locality: "Rajajinagar",
        landmark: "Near Metro 1st Block",
        salaryMin: 18000,
        salaryMax: 24000,
        selectedRequirements: ["Own Two-Wheeler", "1+ Year Experience"],
        whatsappContact: "9876543210",
        verification: { proofType: "merchant_upi", proofValue: "shankarworks@paytm" },
      }),
    });
    const res = await postJobRoute(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job.id).toBeDefined();
    expect(body.job.employer).toBe("Shankar Two-Wheeler Works");
    expect(body.job.title.en).toBeDefined();

    // Verify GET /api/jobs/[id] can retrieve it
    const getReq = new NextRequest(`http://localhost:3000/api/jobs/${body.job.id}`);
    const getRes = await getJobByIdRoute(getReq, { params: Promise.resolve({ id: body.job.id }) });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.job.employer).toBe("Shankar Two-Wheeler Works");

    // Verify PATCH /api/jobs/[id] rejects unauthenticated close with 401
    mockSession = null;
    const patchUnauthReq = new NextRequest(`http://localhost:3000/api/jobs/${body.job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "close" }),
    });
    const patchUnauthRes = await patchJobByIdRoute(patchUnauthReq, { params: Promise.resolve({ id: body.job.id }) });
    expect(patchUnauthRes.status).toBe(401);

    // Verify PATCH /api/jobs/[id] rejects invalid action with 400
    mockSession = { sub: "+919876543210", provider: "phone" };
    const patchInvalidReq = new NextRequest(`http://localhost:3000/api/jobs/${body.job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "delete_everything" }),
    });
    const patchInvalidRes = await patchJobByIdRoute(patchInvalidReq, { params: Promise.resolve({ id: body.job.id }) });
    expect(patchInvalidRes.status).toBe(400);

    // Verify unauthorized user cannot close it (403)
    mockSession = { sub: "+911111111111", provider: "phone" };
    const patchReqUnauthorized = new NextRequest(`http://localhost:3000/api/jobs/${body.job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "close" }),
    });
    const patchResUnauthorized = await patchJobByIdRoute(patchReqUnauthorized, { params: Promise.resolve({ id: body.job.id }) });
    expect(patchResUnauthorized.status).toBe(403);

    // Verify authorized owner CAN close it (200)
    mockSession = { sub: "+919876543210", provider: "phone" };
    const patchReq = new NextRequest(`http://localhost:3000/api/jobs/${body.job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "close" }),
    });
    const patchRes = await patchJobByIdRoute(patchReq, { params: Promise.resolve({ id: body.job.id }) });
    expect(patchRes.status).toBe(200);
  });

  it("GET /api/jobs/[id] retrieves catalog job and returns 404 for unknown job", async () => {
    // Known catalog job from jobs.json
    const all = allJobs();
    if (all.length > 0) {
      const catalogJobId = all[all.length - 1].id;
      const getReq = new NextRequest(`http://localhost:3000/api/jobs/${catalogJobId}`);
      const getRes = await getJobByIdRoute(getReq, { params: Promise.resolve({ id: catalogJobId }) });
      expect(getRes.status).toBe(200);
    }

    // Unknown job
    const unknownReq = new NextRequest("http://localhost:3000/api/jobs/job_unknown_999999");
    const unknownRes = await getJobByIdRoute(unknownReq, { params: Promise.resolve({ id: "job_unknown_999999" }) });
    expect(unknownRes.status).toBe(404);
  });

  it("POST /api/jobs supports custom skilled trade, custom locality and multiple custom requirements", async () => {
    mockSession = { sub: "+919988776655", name: "Modern Woodcraft", provider: "phone" };
    const customReqs = [
      "Can speak Kannada",
      "5+ years modular furniture experience",
      "Must know Edge Banding & CNC routing",
      "Night shift emergency project availability",
    ];

    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        businessName: "Modern Woodcraft Interiors",
        roleCategory: "Master Carpenter & CNC Operator",
        locality: "HSR Layout Sector 2",
        landmark: "Opposite BDA Complex",
        salaryMin: 26000,
        salaryMax: 35000,
        selectedRequirements: customReqs,
        customNotes: "Tools provided at workshop. Overtime pay included.",
        whatsappContact: "9988776655",
        verification: { proofType: "gstin", proofValue: "29AAAAA0000A1Z5" },
      }),
    });

    const res = await postJobRoute(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job.area).toBe("HSR Layout Sector 2");
    expect(body.job.employer).toBe("Modern Woodcraft Interiors");
    expect(body.job.title.en).toContain("Master Carpenter");
    expect(body.job.requirements.length).toBeGreaterThanOrEqual(4);
    const reqTexts = body.job.requirements.map((r: any) => r.en);
    expect(reqTexts).toContain("5+ years modular furniture experience");
    expect(reqTexts).toContain("Must know Edge Banding & CNC routing");
  });

  it("POST /api/jobs rejects a duplicate active listing but allows a different role or locality", async () => {
    mockSession = { sub: "+917777777777", name: "Dup Tester", provider: "phone" };
    await saveJob({
      id: "job_dup_existing",
      roles: ["auto_mech"],
      title: { en: "Mechanic at Dup Garage", hi: "Mechanic", kn: "Mechanic" },
      summary: { en: "Vacancy", hi: "Vacancy", kn: "Vacancy" },
      employer: "Dup Garage",
      area: "Peenya",
      publisher: "Daari Direct",
      applyLink: "https://wa.me/917777777777",
      postedAt: new Date().toISOString(),
      salaryText: "₹18,000",
      salaryMin: 18000,
      genderRestriction: null,
      requirements: [],
      signals: { asks_payment: 0, asks_sensitive: 0, unrealistic: 0 },
      description: "Duplicate check fixture",
      metadata: {
        source: "direct_employer",
        roleCategory: "Mechanic",
        posterPhone: "+917777777777",
        posterId: "+917777777777",
        verification: {
          proofType: "none",
          isVerified: false,
          businessName: "Dup Garage",
          businessAddress: "Peenya",
          locality: "Peenya",
        },
        whatsappContact: "917777777777",
        status: "active",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const post = (overrides: Record<string, unknown>) =>
      postJobRoute(
        new NextRequest("http://localhost:3000/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            businessName: "Dup Garage",
            roleCategory: "Mechanic",
            locality: "Peenya",
            // Scam wording makes later steps return 422 without a model call, so only the duplicate check decides 409 vs not-409.
            customNotes: "Pay registration fee",
            ...overrides,
          }),
        }),
      );

    const dup = await post({ businessName: " dup  garage ", locality: "PEENYA" });
    expect(dup.status).toBe(409);
    expect((await dup.json()).existingJobId).toBe("job_dup_existing");

    expect((await post({ locality: "Jayanagar" })).status).not.toBe(409);
    expect((await post({ roleCategory: "Electrician" })).status).not.toBe(409);

    await closeJob("job_dup_existing", "+917777777777");
    expect((await post({})).status).not.toBe(409);
  });
});
