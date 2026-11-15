# Test script

This script follows Ravi, a mobile repair worker, through Daari, then tests hiring with a second account. Each step says what to do and what you should see.

Ravi passed 10th, has no ITI, and spent two years fixing phones at his uncle's shop in Jayanagar. He is looking for a repair job.

**Before you start:** open https://145-223-23-79.sslip.io in a private Chrome window, so it starts with no saved data. Sign in with a Google account and allow the microphone when asked. Job matches and the AI's wording change between runs, so the exact jobs and numbers will differ from run to run.

## Part 1: Finding work as Ravi

**1. Choose a language**
- Pick English. On a second run, pick हिन्दी and use the Hindi lines below.
- Expect: Home says "Let's find your way", with **Tap and talk**, **Type instead**, and four places to start: **Find a job**, **Learn a skill**, **Make my resume** and **I'm not sure yet**.

**2. Start**
- Tap **Find a job**.
- Expect: Talk opens and asks which area of Bengaluru you live in. The text box and the yellow mic are at the bottom.

**3. Talk**
- Tap the mic, say the line below, then tap it again to stop.
  - EN: "I live in Jayanagar. I repaired mobile phones at my uncle's shop for two years. I replaced screens and batteries."
  - HI: "मैं जयनगर में रहता हूँ। मैंने अपने चाचा की दुकान पर दो साल मोबाइल ठीक किए। स्क्रीन और बैटरी बदलता था।"
- Expect: your words appear correctly, and Daari replies out loud with one question.

**4. Type and get a plan**
- Type the line below and send it. Answer any question that follows in a few words.
  - EN: "I passed 10th. I did not do ITI. I want a mobile repair job soon."
  - HI: "मैंने 10वीं पास की है, आईटीआई नहीं किया। मुझे जल्दी मोबाइल रिपेयर की नौकरी चाहिए।"
- Expect: **Your road** appears once Daari knows your work, not before. It shows what Daari understood (including the repair work), two to four steps with buttons, and a yellow destination at the end. The screen scrolls to the start of the plan, and nothing is hidden behind the text box.
- Tap **See jobs**.

**5. Jobs**
- Expect: repair jobs at the top, each showing pay and "You meet X of Y requirements". No receptionist or other unrelated roles.
- A requirement Ravi meets by talking, such as "Can communicate in English or Hindi", shows as met.
- Choose **Best eligibility match**. Expect: jobs where every requirement is met come first, then jobs with one unmet requirement, then two, and so on. Listings flagged for asking money or personal details sit at the bottom with a warning.

**6. Close a gap**
- Open a job with gaps, such as 2 of 5.
- On a requirement Daari is unsure about, tap **Yes, I have this**. Expect: the count goes up by one.
- Tap **Show me how to close the gaps**. Expect: steps that link only to NPTEL, SWAYAM or YouTube.

**7. Apply**
- Tap **Prepare my application**.
- Expect: a message to the employer, what it says in your language, a call script, documents to carry and interview questions.
- Tap **Answer out loud** on a question and give a short answer. Expect: "What was good" and "Make it better".
- Tap **I have applied**. Expect: the button changes to "Applied".

**8. Places to ask**
- Go to **Jobs**, then the **Places to ask** tab.
- Expect: "Mobile repair technician" and "Jayanagar" are already filled in.
- Tap **Find places and write my message**. Expect: a WhatsApp message, a call script and a Google Maps link to repair shops in the area. These are labelled as places to ask, not confirmed vacancies.

**9. Applied jobs**
- Open the **Applied** tab. Expect: the job from step 7 is listed, and you can change its status.

**10. Learn**
- Tap **Learn**, then **Make my learning plan**. Expect: a plan built from the gaps in your jobs, with real videos and courses.

**11. Check a message**
- Tap **Check**, then **Try an example**, then **Check this message**. Expect: "Be careful", including "Asks you to pay money".
- Paste this and check it: "Electrician needed for apartment maintenance in Whitefield. ITI Electrical and 1 year experience required. Salary Rs 18,000 to 22,000 with PF and ESI. Walk in with your resume."
- Expect: "I found no common warning signs".

**12. Resume**
- Tap **Resume**. Expect: "What I know about you" matches what you said, and your area is filled in.
- Enter a name and phone number, then tap **Write my resume**.
- Expect: every review line is something you actually said, and the download button stays disabled.
- Tick **Yes, all of this is true** and tap **Download resume PDF**. Expect: a clean PDF with no invented claims.

**13. Home and saved data**
- Tap **Home**. Expect: "Welcome back" and **Your road**, with the jobs and resume steps marked done.
- Refresh the page. Expect: everything is still there.

**14. Start over**
- Tap the person button in the top corner, then **Start over**. Expect: before anything happens, it says what Daari will forget and what stays.
- Tap **Yes, start over**. Expect: Home says "Let's find your way" and asks "Where do you want to start?" again. Your details are gone and your language stays.

## Part 2: Hiring

Use a second Google account for the employer, in another private window.

**15. A posting that asks for money**
- On Home, tap **Hiring? Post a job on Daari**.
- Type: "I need a mobile repair technician at my shop in Jayanagar. ₹15,000 a month. Candidates must pay a ₹2,000 registration fee." Tap **Write my posting**.
- Expect: "This posting can't go up yet", saying it asks people to pay, and a button to **Describe the job again**. There is no way to post it.

**16. An honest posting**
- Tap **Describe the job again** and type: "I need a mobile repair technician at my shop in Jayanagar. ₹15,000 to ₹18,000 a month, 10 am to 8 pm, Tuesday off. Must know screen and battery change." Tap **Write my posting**.
- Expect: **Check your posting**, with the title, area, pay, timings and requirements filled in from what you typed.
- Tap **Post this job**. Expect: "Your job is up", with the posting also shown in the other two languages.

**17. Apply as Ravi**
- Back in Ravi's window, tell Daari about the repair work again as in steps 3 and 4, since step 14 cleared it. Then open **Jobs**.
- Expect: the new job is listed with an **Apply on Daari** badge.
- Open it, tap **Apply now**, answer yes or no to each requirement, and enter a 10-digit phone number.
- Expect: under "They will also see", exactly what the employer will get. Tap **Send to** the shop.
- Expect: "Sent to" the shop with today's date, and "They have not looked yet".

**18. Reply as the employer**
- In the employer's window, open **Postings** and the job. Expect: Ravi under **People who applied**, with his answers, work and skills.
- Tap **Shortlist**.
- In Ravi's window, refresh the job. Expect: "They are interested in you. Keep your phone close."

**19. Close the job**
- As the employer, tap **Close this job**. Expect: it disappears from Ravi's job list, and his application says the job is closed.

## Part 3: Languages

**20. Hindi and Kannada**
- Tap **Language** in the top bar and switch to ಕನ್ನಡ, then to हिन्दी.
- Visit Home, Talk, Jobs, Learn, Check and Resume. Expect: every label is in the chosen language, with no English left over.
- Tap **Listen** on a reply in each language. Expect: it is read aloud in that language, without cutting off.

## Part 4: Accounts

**21. Separate accounts**
- Sign out from the person button. Expect: the next screen shows nothing of the person who just left.
- Sign in with a different Google account. Expect: a fresh start, with none of the first person's conversation, plan or jobs.
- Sign out and back in with the first account, or open the site on another phone. Expect: the conversation, plan, applications and resume are all still there.

**22. Delete**
- From the person button, choose **Delete my information** and confirm. Expect: everything is gone after a refresh and on any other phone, including any jobs that account posted.
