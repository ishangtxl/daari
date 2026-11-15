# Test flow: Ravi, a mobile repair worker

Ravi has a 10th pass and no ITI, and spent two years fixing phones at his uncle's shop in Jayanagar. He is looking for a repair job.

**Setup:** open https://145-223-23-79.sslip.io in a private Chrome window, which starts with no saved data. Sign in with a Google account. Allow the microphone when asked. Job matches and AI wording vary between runs, so expect different jobs and numbers.

## Flow

**1. Choose a language**
- Pick English. Use हिन्दी on your second run.
- Expect: Home says "Let's find your way", with **Tap and talk**, **Type instead**, and four places to start: find a job, learn a skill, make my resume, not sure yet.

**2. Start**
- Tap **Find a job**.
- Expect: Talk opens and asks which part of Bengaluru you live in. The text box and the yellow mic are both at the bottom.

**3. Talk**
- Tap the mic and say the line below, then tap it again to stop.
  - EN: "I live in Jayanagar. I repaired mobile phones at my uncle's shop for two years. I replaced screens and batteries."
  - HI: "मैं जयनगर में रहता हूँ। मैंने अपने चाचा की दुकान पर दो साल मोबाइल ठीक किए। स्क्रीन और बैटरी बदलता था।"
- Expect: your words appear correctly, and Daari replies out loud with one question.

**4. Type and get a plan**
- Type the line below in the box and press send. Answer any question after it in a few words.
  - EN: "I passed 10th. I did not do ITI. I want a mobile repair job soon."
  - HI: "मैंने 10वीं पास की है, आईटीआई नहीं किया। मुझे जल्दी मोबाइल रिपेयर की नौकरी चाहिए।"
- Expect: Daari says it understands, without asking another question, and **Your road** appears: what it understood (including the repair work), two to four steps with buttons, and a yellow destination at the end. The screen scrolls to the start of the plan.
- Tap **See jobs**.

**5. Jobs**
- Expect: repair jobs at the top, each showing pay and "You meet X of Y". There should be no receptionist or other unrelated roles.

**6. Close a gap**
- Open a job that shows gaps, such as 2 of 5.
- Tap **Yes, You have this** on one stop. Expect: the count goes up by one.
- Tap **Show me how to close the gaps**. Expect: steps that link only to NPTEL, SWAYAM or YouTube.

**7. Apply**
- Tap **Prepare my application**.
- Expect: an employer message, what it says in your language, a call script, documents to carry and interview questions.
- Tap **Answer out loud** on a question and give a short answer. Expect: "What was good" and "Make it better".
- Tap **I have applied**. Expect: the button changes to "Applied".

**8. Places to ask**
- Go to **Jobs**, then **Places to ask**.
- Expect: "Mobile repair technician" and "Jayanagar" are already filled in.
- Tap **Find places and write my message**. Expect: an outreach message and a Google Maps link. Real shop listings need the Places key.

**9. My applications**
- Open the **My applications** tab. Expect: your job is listed and you can change its status.

**10. Learn**
- Tap **Learn**, then **Make my learning plan**. Expect: a plan based on your jobs' gaps.

**11. Check a message**
- Tap **Check**, then **Try an example**, then **Check this message**. Expect: "Be careful", including "Asks you to pay money".
- Paste this and check it: "Electrician needed for apartment maintenance in Whitefield. ITI Electrical and 1 year experience required. Salary Rs 18,000 to 22,000 with PF and ESI. Walk in with your resume."
- Expect: "I found no common warning signs".

**12. Resume**
- Tap **Resume**. Expect: "What I know about you" matches what you said, and your area is filled in.
- Enter a name and phone number, then tap **Write my resume**.
- Expect: every review line is something you actually said, and the download button stays disabled.
- Tick **Yes, all of this is true** and download the PDF. Expect: a clean PDF with no invented claims.

**13. Home and saved data**
- Tap **Home**. Expect: "Welcome back" and **Your road**, with the jobs and resume steps ticked as done.
- Refresh the page. Expect: everything is still there.

**14. Start over**
- Tap the person button in the top corner, then **Start over**. Expect: it says what Daari will forget and what stays, before anything happens.
- Tap **Yes, start over**. Expect: you land on Home, your details are gone, the language stays, and Home asks "What work have you done?" again.

## Accounts

- Finish a few steps on one Google account, then sign out from the person button in the top corner. Expect: the next screen shows nothing of that person.
- Sign in with a second Google account. Expect: a fresh start, with none of the first person's conversation, plan or jobs.
- Sign out and back in with the first account, or open the site on another phone. Expect: the conversation, plan, applications and resume are all still there.
- From the person button, choose **Delete my information** and confirm. Expect: it is gone after a refresh and on any other phone, along with any jobs that account posted.

## Eligibility sorting

- Select **Best eligibility match**. The count is based on every listed requirement shown in **You meet X of Y requirements**: skills, education, experience and other criteria.
- Jobs with all requirements met (X = Y) appear first; jobs with one unmet requirement come next, then two unmet requirements, and so on.
- For jobs with the same number of unmet requirements, the higher share of requirements met comes first. Safer listings still rank above listings flagged for payment or sensitive-information requests.

## Watch for

- **Plan timing:** Your road appearing before Daari knows your work, or never appearing after you have answered its questions.
- **Scrolling:** on a phone, the newest message or the plan hidden behind the text box, or the page jumping while you read older messages.
- **Wrong gaps:** "You need this" on something Ravi clearly has. A language requirement he meets by talking in that language, like "Can communicate in English or Hindi", should show as met.
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
