# Job Provider — Testing Guide

Manual test cases for the job provider side of Daari.  
Run these in order on `http://localhost:3000` after a fresh `npm run dev`.

---

## 1. Role Selection (First-time user)

### 1.1 Fresh visit — role chooser appears
- Clear `localStorage` (DevTools → Application → Storage → Clear site data).
- Open `http://localhost:3000`.
- **Expect**: Language chooser appears first.
- Pick a language.
- **Expect**: Role chooser appears with two cards — "I am looking for work" and "I want to hire workers".

### 1.2 Seeker card routes correctly
- Tap **"I am looking for work"**.
- **Expect**: Seeker home with mic button and job-search links. Nav shows 6 tabs (Home / Talk / Jobs / Learn / Check / Me).

### 1.3 Provider card routes correctly
- Clear localStorage, repeat language step.
- Tap **"I want to hire workers"**.
- **Expect**: Provider home with 3 action links (Talk / My Listings / Applicants). Nav shows 4 tabs.

### 1.4 Role is persisted across refreshes
- After picking provider, hard-refresh the page.
- **Expect**: Provider home loads directly, no role chooser again.

---

## 2. Role via Login Intent Screen

### 2.1 Login intent sets role before OAuth
- Clear localStorage. Open `http://localhost:3000/login`.
- **Expect**: Splash animation → intent screen with two buttons.
- Tap **"I need workers for my shop"** (employer card).
- **Expect**: Phone/OTP form appears. Role is already `job_provider` in localStorage (verify in DevTools → Application → localStorage → `daari.v1` → `role`).

### 2.2 Returning user skips intent screen
- With `role` already set in localStorage, open `http://localhost:3000/login`.
- **Expect**: Intent screen is skipped; phone form shown immediately for the stored role.

### 2.3 No double role chooser after OAuth
- Clear localStorage. Pick employer on `/login` intent screen (sets role).
- Complete Google OAuth.
- **Expect**: Lands on provider home (`/`) with NO role chooser flash.

---

## 3. Sign Out — No Flash

### 3.1 Sign out via topbar button
- Sign in as provider. Tap "Sign Out" in the topbar.
- **Expect**: Immediately navigates to `/login`. **No role-chooser screen flashes** between signout and login page.

### 3.2 Sign out via provider home button
- On provider home page, tap the "Sign out" link at the bottom.
- **Expect**: Same — instant redirect to `/login`, no flash.

### 3.3 Role preserved after sign-out
- After signing out, check localStorage — `role` is still `"job_provider"`.
- Navigate to `/` without logging in.
- **Expect**: Provider home shown (unauthenticated), topbar shows "Sign In".

### 3.4 Switch role by going Back on login
- On `/login` phone form, tap **"← Back"** to reach the intent screen.
- Tap the **seeker** card.
- **Expect**: Role in localStorage changes to `"job_seeker"`.

---

## 4. Provider Navigation

### 4.1 Nav tabs — provider set
- As a provider, verify the bottom nav has exactly 4 tabs: **Home**, **Talk**, **My Listings**, **Applicants**.
- Tap each tab and confirm it routes to the correct page.

### 4.2 Seeker pages are inaccessible via nav
- As a provider, confirm there are **no** nav links to `/jobs`, `/learn`, `/check`, or `/me`.
- Manually navigate to `http://localhost:3000/jobs` — the page should render (it's not blocked), but it's not reachable from the provider nav.

---

## 5. Provider Talk — Voice Mode

### 5.1 Greeting message appears
- Open `/provider/talk`.
- **Expect**: A greeting bubble from Daari asking about the business and what kind of worker is needed.

### 5.2 Voice input sends message
- Tap the mic button, speak: *"My shop is Raju Auto Garage in Peenya"*.
- **Expect**: Message appears as a user bubble. Daari replies asking for more details (e.g. what kind of worker).

### 5.3 Voice collects mandatory fields one at a time
- Continue the conversation: provide shop name → role → locality → salary → WhatsApp number (one per turn).
- **Expect**: After each reply, the draft status banner updates showing remaining fields.

### 5.4 Draft status banner — partial
- After providing 2–3 fields, check the amber banner at the bottom of the chat.
- **Expect**: Shows "Still needed: Role, Min salary, WhatsApp" (or whichever remain).

### 5.5 Draft status banner — ready
- After all 5 mandatory fields are filled via voice:
  - Shop name
  - Role/trade
  - Locality in Bengaluru
  - Minimum salary (e.g. ₹18,000)
  - WhatsApp number (10 digits)
- **Expect**: Banner turns green — "All required details filled" — with a "View & post listing" link.

### 5.6 Type-mode fallback
- Tap **"Type instead"** (keyboard icon).
- **Expect**: Text input + Send button appears.
- Type a message and submit.
- **Expect**: Same chat behaviour as voice.
- Tap **"Talk instead"** to go back to mic.

### 5.7 Draft persists across tab switches
- Fill 3 fields via voice, then navigate to **My Listings** tab.
- Come back to **Talk** tab.
- **Expect**: All previous chat messages and the draft status banner are still present.

---

## 6. Provider Talk — Manual Fill Card

### 6.1 Toggle open
- Tap **"Fill manually instead"** button above the voice input.
- **Expect**: A form card slides in at the top of the chat area with all job fields.

### 6.2 Fields present
The manual fill card must contain:
- Shop / business name (text, required *)
- Role/trade (text, required *)
- Locality chips (preset areas + "Other" with custom input, required *)
- Address / landmark (optional)
- Salary range: min (required *) and max fields
- WhatsApp number (required *)
- Vacancies count
- Notes / other details (textarea)

### 6.3 Locality chips
- Tap any locality chip (e.g. "Koramangala") — chip highlights.
- Tap "Other" — a text field appears for custom locality input.

### 6.4 Close card saves data
- Fill in: shop name = "Test Shop", role = "Electrician", locality = "BTM Layout", salary min = 15000, WhatsApp = 9876543210.
- Tap **"Close form"**.
- **Expect**: Card closes. Draft status banner updates immediately.

### 6.5 Manual fill overrides voice
- Use voice to say: *"My shop is Raju Garage"*.
- Then open manual fill card and change business name to "New Shop Name".
- Close the form.
- Navigate to My Listings → Drafts tab.
- **Expect**: Business name shows "New Shop Name" (manual overrides voice).

### 6.6 Voice overrides manual fill
- With "New Shop Name" set manually, say via voice: *"My shop name is Sharma Electronics"*.
- Wait for extraction to complete (~2 sec after assistant replies).
- Check Drafts tab.
- **Expect**: Business name updates to "Sharma Electronics" (voice overrides manual).

### 6.7 Toggle back to voice
- While manual fill card is open, tap **"Talk to fill"** button.
- **Expect**: Card closes (saves data), voice input is active.

---

## 7. Provider Listings — Draft Tab

### 7.1 Empty state
- Without any draft data, open `/provider/listings`.
- **Expect**: "No listings yet. Talk to create your first listing." with a "Talk" button.

### 7.2 Preview card appears with partial draft
- Provide shop name + locality via Talk tab, then switch to Listings.
- **Expect**: Draft preview card shows partial data (name, location). Post button is **disabled**.

### 7.3 Missing fields banner
- With incomplete draft, **Expect**: Amber banner: "Still needed: Role, Min salary, WhatsApp" with a Talk link.

### 7.4 Post button enabled when all mandatory filled
- Fill all 5 mandatory fields (via Talk or manual fill).
- **Expect**: "Post listing" button is blue and enabled.

### 7.5 Draft preview card content
The preview card must show:
- "DIRECT SHOP VACANCY" badge
- Role / trade (bold title)
- Business name
- Locality (pin icon)
- Salary range (₹ icon)
- Vacancies (if > 1)
- WhatsApp number (phone icon)
- Any requirements chips
- Custom notes (if entered)

### 7.6 Draft tab indicator dot
- With an incomplete draft, the "Drafts" tab must show a small **amber dot** indicator.
- Once all fields are filled, the dot disappears.

---

## 8. Provider Listings — Post a Listing

### 8.1 Successful post
- Fill all mandatory fields. Tap **"Post listing"**.
- **Expect**: Spinner while posting. On success, switches to **My Listings** tab. New listing card appears with green "Active" badge and today's date.

### 8.2 Listing card content
Active listing card must show:
- "ACTIVE" badge (green)
- Post date
- **"Close listing"** button (red border)
- Job title, business name, area, salary text

### 8.3 Requires authentication
- Sign out. Try posting a listing.
- **Expect**: Server returns 401 → error message: *"Authentication required to post a job vacancy."*

### 8.4 Scam detection blocks post
- In manual fill "Notes" field, add: *"Candidates must pay ₹500 registration fee"*.
- Tap "Post listing".
- **Expect**: Post is blocked. Error banner shows the scam notice: *"Posting blocked: Daari prohibits demanding deposits, uniform charges, or fees from job seekers."*

### 8.5 Invalid phone number blocked
- Set WhatsApp to a 5-digit number (e.g. `12345`).
- Tap "Post listing".
- **Expect**: Error: *"A valid 10-digit phone number is required for WhatsApp inquiries."*

### 8.6 Missing role blocked
- Clear the role field. Tap "Post listing".
- **Expect**: Error: *"Job role / trade is required."*

---

## 9. Provider Listings — My Listings Tab

### 9.1 Active listings section
- After posting at least one listing, switch to "My Listings" tab.
- **Expect**: "Active" section with listing cards.

### 9.2 Close a listing
- Tap **"Close listing"** on an active listing.
- **Expect**: Listing moves to "Closed" section with grey "LISTING CLOSED" badge. Card is dimmed.

### 9.3 Active count badge
- With 2 active listings, the "My Listings" tab shows a badge with `2`.
- After closing one, badge shows `1`.

### 9.4 Cross-tab sync — active to My Listings
- Go to Talk tab, provide some new fields (or change existing).
- Switch to My Listings tab **without posting**.
- **Expect**: Draft tab reflects latest voice/manual data.

---

## 10. Provider Applicants Page

### 10.1 Empty placeholder
- Open `/provider/applicants`.
- **Expect**: Page title "Applied seekers" and empty-state message: *"Applied seekers will appear here."*
- No errors or broken UI.

---

## 11. Concurrent State (Talk ↔ Listings sync)

### 11.1 Draft persists through navigation
- Fill 2 fields in Talk. Navigate to My Listings. Navigate back to Talk.
- **Expect**: Same 2 fields still shown in draft status banner. Chat history intact.

### 11.2 Manual form changes visible in Listings without refresh
- Open Talk, open manual fill card. Change shop name.
- Close the card. **Without** navigating away from Talk, open a new tab to `/provider/listings`.
- **Expect**: Draft preview shows the updated shop name (shared localStorage state).

---

## Known Limitations (not bugs)

| Item | Status |
|------|--------|
| Applicants tab is a placeholder | Intentional — future DB migration |
| Posted listings stored in localStorage only | Intentional — DB migration pending |
| Draft extraction via voice has ~2s delay after assistant reply | Expected — background API call |
| Closed listings cannot be re-opened | Current behaviour |
