import { describe, expect, it } from "vitest";
import { validateBusinessProof, screenJobScam } from "../lib/server/job-verification";
import { getActiveJobs, saveJob, getJobById, closeJob } from "../lib/server/jobs-store";
import { allJobs } from "../lib/server/match";
import type { FullJob } from "../lib/types";

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

  it("allows verified poster to close their listing", async () => {
    const closed = await closeJob(testJobId, "+919999999999");
    expect(closed).toBe(true);

    const active = await getActiveJobs();
    expect(active.some((j) => j.id === testJobId)).toBe(false);
  });
});
