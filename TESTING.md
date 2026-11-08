# Test flow: Ravi, a mobile repair worker

Ravi has a 10th pass and no ITI, and spent two years fixing phones at his uncle's shop in Jayanagar. He is looking for a repair job.

**Setup:** open https://145-223-23-79.sslip.io in a private Chrome window, which starts with no saved data. Sign in with one of the Firebase test numbers, which log in with a fixed code and send no SMS. Allow the microphone when asked. Job matches and AI wording vary between runs, so expect different jobs and numbers.

## Flow

**1. Choose a language**
- Pick English. Use हिन्दी on your second run.
- Expect: the home page asks "What work have you done?"

**2. Talk**
- Tap **Tap and talk** and say the line below, then tap the mic to stop.
  - EN: "I repaired mobile phones at my uncle's shop for two years. I replaced screens and batteries. I live in Jayanagar."
  - HI: "मैंने अपने चाचा की दुकान पर दो साल मोबाइल ठीक किए। स्क्रीन और बैटरी बदलता था। मैं जयनगर में रहता हूँ।"
- Expect: your words appear correctly, and Daari replies out loud and asks a follow-up question.

**3. Type**
- Tap **Type instead** and send the line below.
  - EN: "I passed 10th. I did not do ITI. I want a mobile repair job. I do not have a driving licence."
  - HI: "मैंने 10वीं पास की है, आईटीआई नहीं किया। मुझे मोबाइल रिपेयर की नौकरी चाहिए। ड्राइविंग लाइसेंस नहीं है।"
- Expect: a **See my jobs** link appears. Tap it.

**4. Jobs**
- Expect: repair jobs at the top, each showing pay and "You meet X of Y". There should be no receptionist or other unrelated roles.

**5. Close a gap**
- Open a job that shows gaps, such as 2 of 5.
- Tap **Yes, You have this** on one stop. Expect: the count goes up by one.
- Tap **Show me how to close the gaps**. Expect: steps that link only to NPTEL, SWAYAM or YouTube.

**6. Apply**
- Tap **Prepare my application**.
- Expect: an employer message, what it says in your language, a call script, documents to carry and interview questions.
- Tap **Answer out loud** on a question and give a short answer. Expect: "What was good" and "Make it better".
- Tap **I have applied**. Expect: the button changes to "Applied".

**7. Places to ask**
- Go to **Jobs**, then **Places to ask**.
- Expect: "Mobile repair technician" and "Jayanagar" are already filled in.
- Tap **Find places and write my message**. Expect: an outreach message and a Google Maps link. Real shop listings need the Places key.

**8. My applications**
- Open the **My applications** tab. Expect: your job is listed and you can change its status.

**9. Learn**
- Tap **Learn**, then **Make my learning plan**. Expect: a plan based on your jobs' gaps.

**10. Check a message**
- Tap **Check**, then **Try an example**, then **Check this message**. Expect: "Be careful", including "Asks you to pay money".
- Paste this and check it: "Electrician needed for apartment maintenance in Whitefield. ITI Electrical and 1 year experience required. Salary Rs 18,000 to 22,000 with PF and ESI. Walk in with your resume."
- Expect: "I found no common warning signs".

**11. Resume**
- Tap **Resume**. Expect: "What I know about you" matches what you said, and your area is filled in.
- Enter a name and phone number, then tap **Write my resume**.
- Expect: every review line is something you actually said, and the download button stays disabled.
- Tick **Yes, all of this is true** and download the PDF. Expect: a clean PDF with no invented claims.

**12. Home and saved data**
- Tap **Home**. Expect: the link now says "Your jobs are ready".
- Refresh the page. Expect: everything is still there.

**13. Delete**
- Under **Resume**, tap **Delete my information from this phone** and confirm.
- Expect: your details are gone, the language stays, and Home asks "What work have you done?" again.

## Eligibility sorting

- Select **Best eligibility match**. The count is based on every listed requirement shown in **You meet X of Y requirements**: skills, education, experience and other criteria.
- Jobs with all requirements met (X = Y) appear first; jobs with one unmet requirement come next, then two unmet requirements, and so on.
- For jobs with the same number of unmet requirements, the higher share of requirements met comes first. Safer listings still rank above listings flagged for payment or sensitive-information requests.

## Watch for

- **Wrong gaps:** "You need this" on something Ravi clearly has. "Can communicate in English or Hindi" has already shown up this way.
- **Scam false alarms:** warnings on ordinary job messages.
- **Voice:** misheard words, or a slow or cut-off spoken reply.
- **Language:** English left over in the Hindi or Kannada screens. Listen to "Listen" in each language too.

## Not tested yet

Run these separately:

- Your real voice, including somewhere noisy
- Kannada, end to end, with a native speaker
- Uploading a PDF resume
- A real phone, especially a cheap Android and an iPhone
- Real shop listings, which need the Places key
