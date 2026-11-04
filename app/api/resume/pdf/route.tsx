import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { jsonRoute, fail } from "@/lib/server/route";
import { resumeSchema, type ResumeData } from "@/lib/types";

const schema = z.object({ resume: resumeSchema, template: z.enum(["clear", "trade"]).default("clear") });

const COBALT = "#1B3BB3";
const INK = "#141C33";
const MUTED = "#4A5470";

const styles = StyleSheet.create({
  page: { paddingVertical: 42, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 10.5, color: INK, lineHeight: 1.45 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 24, color: COBALT, lineHeight: 1.1 },
  headline: { fontSize: 12.5, marginTop: 4 },
  contact: { fontSize: 10, color: MUTED, marginTop: 4 },
  summary: { marginTop: 14 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 11.5, color: COBALT, marginTop: 16, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: COBALT },
  jobTitle: { fontFamily: "Helvetica-Bold" },
  jobMeta: { color: MUTED },
  job: { marginBottom: 8 },
  bullet: { flexDirection: "row", marginTop: 2 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
});

// The standard PDF fonts cover Latin text only, and resumes are written in English for employers.
const clean = (text: string) => text.replace(/₹/g, "Rs. ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function Resume({ resume, template }: { resume: ResumeData; template: "clear" | "trade" }) {
  const contact = [resume.phone, resume.area && `${resume.area}, Bengaluru`].filter(Boolean).join("   |   ");
  const skills = resume.skills.length > 0 && (
    <Section title="Skills">
      <Text>{clean(resume.skills.join(", "))}</Text>
    </Section>
  );
  const experience = resume.experience.length > 0 && (
    <View>
      <Text style={styles.heading}>Work experience</Text>
      {resume.experience.map((item, index) => (
        <View key={index} style={styles.job} wrap={false}>
          <Text>
            <Text style={styles.jobTitle}>{clean(item.role)}</Text>
            <Text style={styles.jobMeta}>{clean([item.place, item.duration].filter(Boolean).join(", ")) && `  ${clean([item.place, item.duration].filter(Boolean).join(", "))}`}</Text>
          </Text>
          {item.bullets.map((bullet, bulletIndex) => (
            <View key={bulletIndex} style={styles.bullet}>
              <Text style={styles.dot}>-</Text>
              <Text style={styles.bulletText}>{clean(bullet)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
  return (
    <Document title={`${resume.name} resume`} author={resume.name}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{clean(resume.name)}</Text>
        {resume.headline ? <Text style={styles.headline}>{clean(resume.headline)}</Text> : null}
        {contact ? <Text style={styles.contact}>{clean(contact)}</Text> : null}
        {resume.summary ? <Text style={styles.summary}>{clean(resume.summary)}</Text> : null}
        {/* Trade jobs are decided on skills, so that template leads with them. */}
        {template === "trade" ? skills : experience}
        {template === "trade" ? experience : skills}
        {resume.education.length > 0 && (
          <Section title="Education">
            {resume.education.map((line, index) => <Text key={index}>{clean(line)}</Text>)}
          </Section>
        )}
        {resume.languages.length > 0 && (
          <Section title="Languages">
            <Text>{clean(resume.languages.join(", "))}</Text>
          </Section>
        )}
      </Page>
    </Document>
  );
}

export const POST = jsonRoute("resume-pdf", schema, async ({ resume, template }) => {
  // A name in another script would come out blank with these fonts, so ask for it in English letters.
  if (!resume.name.trim() || /[^\u0000-ɏ\s.'-]/.test(resume.name)) return fail("name_latin", 422);
  const pdf = await renderToBuffer(<Resume resume={resume} template={template} />);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${resume.name.replace(/[^a-zA-Z0-9]+/g, "_")}_resume.pdf"`,
    },
  });
}, 20);
