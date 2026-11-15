# Daari: problem statement and solution

*Daari* (ದಾರಿ) means "the way" in Kannada.

Track: More Opportunity, Greater Together

## The problem

Bengaluru has a lot of people who are unsure of their way forward at work. They are students, graduates, diploma and ITI holders, and skilled workers like tailors, electricians and phone repair technicians. Their kind of work isn't organised the way IT is. There is no one place where these jobs are listed, job titles aren't standard, and there's no clear path from the skills someone has to the job they want.

No platform is built for them. Today a tailor or a phone repair technician finds work mostly by word of mouth. When they try a job portal, it is in English, wants a resume they don't have, uses job titles they don't recognise, and never tells them why they were turned down. The same people are the main targets of fake job offers on WhatsApp and Telegram that ask for a "registration fee" before an interview.

The other side has the same gap. The small shops and workshops that hire these people rarely post jobs online, so good vacancies stay inside a few people's networks.

For this to change, a job seeker needs to be able to:

- describe their education and work, informal work included, in their own language, and have it count
- see which jobs fit, and exactly what is missing for the ones that don't yet
- learn the missing skills, and apply without needing English or a resume
- tell a real job offer from a scam

## The solution

Daari is a web app where anyone can come and talk about where they are in life: what they studied, the work they've done, and what they want to learn. It's an open-ended conversation in Kannada, Hindi or English, by voice or by typing. Daari acts as a career counsellor. It finds the right jobs for the person, finds courses to close the gaps, and helps them apply from start to finish.

### How it works

1. **Talk.** The person picks a language, shown in its own script, and taps the mic. Speech is understood even when someone mixes Kannada, Hindi and English, as most people do. The counsellor asks one question at a time and treats informal work as real experience. Three years fixing phones at an uncle's shop counts.
2. **Get a plan.** Once Daari knows enough, it says back what it understood and gives two to four steps that end at the work the person is aiming for. Each step has a button that opens the right screen.
3. **Find jobs that fit.** Daari matches the person against real-time Bengaluru listings and the jobs employers post on Daari. Each job shows its requirements as stops on a bus route, with the ones they already meet filled in. "You meet 4 of 5" is a count they can check stop by stop, not a made-up match score. Jobs can be sorted by fit, pay or road distance. Because many small shops never post online, Daari also lists local businesses in the person's trade and area, and writes a WhatsApp message and a call script to ask them about work.
4. **Learn what's missing.** Requirements they don't meet yet become a short learning plan. Each step links to verified NPTEL and SWAYAM courses, or to YouTube lessons that have been checked to be in their language and to actually teach the skill.
5. **Apply.** For any job, Daari writes the message to the employer, a call script and the list of documents to carry. The person can practise likely interview questions out loud and get feedback. They always send the application themselves, and Daari keeps track of where they applied.
6. **Make a resume.** Daari writes an English resume from what the person said. Any line their own words don't support is removed. Before downloading, they see every claim in their own language and confirm it is true.
7. **Check a job message.** Paste or read out a message from WhatsApp, Telegram or SMS. Daari names the warning signs, such as "asks you to pay money", and says what to do next.
8. **Hire on Daari.** A shop owner describes a job by talking or typing in their own language. Daari writes the posting in all three languages and refuses any posting that charges applicants, asks for an OTP, bank details or Aadhaar before an interview, or turns people away by caste, religion or community. People whose skills fit apply inside Daari, and they can see whether the employer has looked at their application, shortlisted them, or chosen someone else.

### Extra rules behind the design

- **A language model writes, and a separate check decides.** Replies, plans and resumes are written by a language model. Every yes-or-no judgement that changes what someone sees goes to its own fast classifier model: whether the person meets a requirement, whether a message asks for money, whether a video is in Kannada. Each of these can be tested on its own. The cost effectiveness of not using an LLM behind every decision results in being able to provide the platform for free with ads that could support the LLM cost.

## Impact

The outcome we measure is **the time from someone opening Daari for the first time to sending their first job application**. On a job portal, someone without a resume or English often can't get that far at all. On Daari, a test user starting from nothing reached a sent application in 20 minutes.

Scam screening works on clear margins. We wrote 100 Bengaluru job postings: 50 honest ones, and the same 50 with a demand for money added, such as a registration fee or a deposit. The screen blocked all 50 that asked for money and none of the honest ones. Honest postings scored 0.05 to 0.12 and the ones asking for money scored 0.92 to 0.97, against a cut-off of 0.6. Each check took a median of 263 ms. This uses the same classifier model as Daari's other yes-or-no decisions, and `scripts/posting-eval.ts` reruns it.

## Built with IBM Bob

Daari started as a vague idea, and IBM Bob helped us turn it into a working app. Bob helped us plan it, and suggested the name Daari. Using design skills we found online, we got Bob to produce an interface that is easy to use on a phone and draws on Bengaluru itself, with its auto-rickshaws and pink trumpet trees. Bob helped us plan the user flows and fill gaps we hadn't thought of. Because it is fast, we could try several versions of each part and keep the best one.

## Try it

Live: https://145-223-23-79.sslip.io
