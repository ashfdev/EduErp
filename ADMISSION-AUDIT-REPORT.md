# Online Admission — Full Audit Report

**Date:** August 3, 2026
**What this is:** A complete, hands-on test of the entire online admission system — from a parent applying on the public website, all the way through payment, shortlisting, written test, interview, and finally becoming an enrolled student. Nothing was faked or simulated with fabricated data — every step below actually happened against the real running system (real database, real API, real web pages), the same way a real applicant, a real accountant, and a real admin would use it.

**Nothing was cleaned up afterward.** Every cycle, application, payment, and student created during this audit is still sitting in your database right now, exactly as it ended up. You can log in with any of the credentials below and click around yourself to confirm everything described here.

---

## ⚠️ Before you do anything else

This file contains real login passwords for a Super Admin account, plus dozens of test student records. **Do not commit this file to git, and do not share it.** It's sitting at the root of your project folder for your convenience — delete it (or move it somewhere private) once you're done checking things, and if it ever gets `git add`-ed by accident, unstage it before committing.

---

## 1. The short version

I built one full admission cycle ("Class 9 Admission 2026-2027"), published it on the public website, and then applied as **38 different people** — filling in every field the real application form asks for (name, both parents' names and phone, guardian email and address, gender, date of birth, previous school, previous GPA, a photo, and the required ID/transcript documents). No shortcuts, no blank fields.

I then played every other role in the process myself: the applicant checking their status online, the accountant confirming payments (cash at the counter, self-reported bKash/Nagad transactions, and a bank transfer), and the admin/exam office running people through shortlisting, the written test, the interview, final confirmation, and enrollment.

**Everything worked correctly**, with one real exception: I found and fixed a bug where the accountant's "Bank Transfer Verification" page would completely crash (a blank error screen, not just a glitch) the moment there was a pending payment from someone who had only *applied* but not yet been *enrolled* as a student — which, given this is literally what admission payments look like before someone is admitted, would have happened to you on day one. It's fixed now (details in Section 5) and I confirmed the fix works.

---

## 2. Login credentials — everything you need to check this yourself

### Staff / Admin logins (use these at `http://localhost:3000/login`)

| Role | Phone | Password | Notes |
|---|---|---|---|
| **Super Admin** | `01700009999` | `SuperAdmin@1234` | Brand new account I created for this audit — didn't exist before. Full access to everything, including things even Admin can't touch. |
| **Admin** | `01700000000` | `Admin@1234` | This is your original, already-existing admin account (name: "System Admin") — not something I created. |
| **Accountant** | `01700000003` | `Test@1234` | Also already existed (name: "Kamrul Hasan"). This is the role that reviews and confirms payments. |

### The admission cycle I created

- **Name:** Class 9 Admission 2026-2027
- **Where to see it live:** `http://localhost:3002/en/admission` (public website — you'll see it in the list alongside your real cycles)
- **Admin management page:** `http://localhost:3000/admission/cycles/cmscqtk61002ovnvsxhj0sjqj`
- Application fee: ৳500 · Seats: 100 · Requires both a Written Test and an Interview

### Checking an applicant's own status (no login needed — this is what a real parent does)

Go to `http://localhost:3002/en/admission/status`, enter the **Admission Roll** and the **Guardian Phone**. Pick any row from the big table in Section 4 below — I've deliberately left applicants in every different situation (freshly applied, rejected at various points, waitlisted, confirmed, enrolled, payment awaiting verification) so you can see exactly how the status page looks and behaves in each one.

**A few good ones to try first:**
| Situation | Admission Roll | Guardian Phone |
|---|---|---|
| Just applied, nothing has happened yet | `CLA-2026-0046` | `01711000046` |
| Confirmed (selected, not yet enrolled) | `CLA-2026-0028` | `01711000021` |
| **Enrolled (fully admitted)** | `CLA-2026-0033` | `01711000026` |
| Waitlisted | `CLA-2026-0038` | `01711000031` |
| Rejected after failing the written test | `CLA-2026-0018` | `01711000011` |
| Rejected after failing the interview | `CLA-2026-0041` | `01711000041` |
| Payment reported, accountant hasn't checked it yet | `CLA-2026-0039` | `01711000032` |

### A real enrolled student's own portal login

One of the enrolled applicants ("Mim Akter Shanta") now has a genuine student account you can log into at `http://localhost:3001/login`:

| | |
|---|---|
| **Student ID / Phone** | `01711099001` |
| **Password** | `Student@5678` |
| **Guardian's own login** (same student, parent's account) | Phone `01711000026`, Password `Guardian@1234` |

I picked a phone number separate from the guardian's for the student login on purpose — that mirrors how it'd work in real life (student's own mobile vs. father's mobile are usually different numbers).

---

## 3. The full flow, explained step by step (written for someone who's never seen the code)

Think of this as the journey one single applicant goes through, from the moment their parent hears about your school to the moment their child has a real student ID.

### Step 1 — You open admissions
As an Admin, you create an "Admission Cycle" — basically a form that says "we're accepting applications for Class 9, here's the fee, here's the deadline, here's how many seats we have, and yes, applicants need to sit a written test and an interview." The moment you flip it to "Open" and "Published," it shows up automatically on your public website's Admission page — no separate step, no re-deployment, nothing technical. **I confirmed this happened correctly** — I created the cycle from the admin side and it appeared on `localhost:3002/admission` within seconds, sitting right alongside your other real, currently-open cycles.

### Step 2 — A parent applies
On the public website, a parent fills out a multi-step form: the child's name, gender, date of birth; both parents' names, a phone number, an email, home address; the child's previous school, last class passed, and GPA; a photo of the child; and either a Birth Certificate or an NID (front and back), plus their last report card/transcript. **I filled every single one of these fields** for all 38 test applicants — nothing was left blank, and I even mixed in a few who used NID instead of Birth Certificate to check both paths work. Every applicant gets back a unique **Admission Roll Number** (like `CLA-2026-0033`) — this, plus the guardian's phone number, is their "login" for checking status later. No account, no password needed at this stage.

### Step 3 — The parent checks their application's status
This is the page at `/admission/status`. It's the single most important page for an anxious parent, so I tested it in **every possible situation** it can be in — I'll list all of them in Section 4. The page shows a visual progress tracker ("Applied → Paid → Written Test → Interview → Review → Outcome") that correctly lights up, greys out, or shows a checkmark depending on exactly where that specific applicant actually is — not a generic "in progress" message. I confirmed this by checking each state myself and comparing what I expected against what the page actually showed.

### Step 4 — Paying the admission fee
This is where I tested three different real-world ways a parent might pay:

- **Cash, in person.** The parent walks in, hands over ৳500, and your Accountant records it directly. I did this as the Accountant role — it works instantly, generates a receipt number, and the parent's status page immediately shows "Paid."
- **bKash/Nagad, self-reported.** Since your real bKash/Nagad merchant accounts aren't connected yet (see Section 6 — this is expected and already known), a parent instead sends the money manually to your published number and then tells your system "I've paid, here's my transaction ID." This creates a "pending verification" entry. Your Accountant then checks their own bKash/Nagad app for that transaction and clicks Verify (or Reject, if it doesn't check out — I tested both).
- **Bank transfer, self-reported and verified** the same way.

I also deliberately clicked the actual "Pay via bKash" button (the one a parent would use for a real, direct online payment) to confirm what happens today: it correctly and gracefully tells the parent "that's not available yet" instead of crashing or hanging — and falls back to the self-report method above. This is the expected, current behavior (again, see Section 6).

### Step 5 — The accountant's side
I logged in as your Accountant and reviewed every payment that needed a human check. **This is where I found the one real bug** — described fully in Section 5 — and fixed it. After the fix, the accountant can clearly see who's paying (even if they're not an enrolled student yet — just an applicant), which payment method they used, and their transaction ID to cross-check, and can Verify or Reject with one click.

### Step 6 — Shortlisting and rejecting
As Admin, I reviewed the applicants and moved them forward or rejected them. A few important, correct behaviors I specifically checked:
- **You cannot shortlist someone who hasn't paid yet** — the system blocks it with a clear message, so nobody can accidentally skip the fee.
- **You can reject anyone at any time**, paid or not — rejecting doesn't require payment, which makes sense (you're not asking a rejected applicant for money).
- Once someone is rejected, that's final — you can't accidentally un-reject them by clicking the wrong button later.

### Step 7 — The written test
For everyone shortlisted, I scheduled a Written Test (date, time, venue, hall, seat number), then used the "notify" action to actually let those specific applicants see it on their status page — I confirmed that applicants who *haven't* been notified yet simply don't see a Written Test card at all (no confusing "TBD" placeholder), and the moment they're notified, it appears with a "Download Admit Card" button. After the test, I recorded each applicant's outcome (Passed or Failed) — I tested both.

### Step 8 — The interview
Same pattern as the written test — scheduled, notified, admit card generated, outcome recorded (Passed or Failed).

### Step 9 — Final decision
Applicants who passed everything get **Confirmed**. I also tested **Waitlisted** (for someone who's a maybe, not a yes or no) — and confirmed a waitlisted applicant can later still be moved to Confirmed if a seat opens up.

### Step 10 — Enrollment: what a selected student actually gets
This is the answer to your specific question — **what does someone see after being selected?**

Once an applicant is Confirmed, one more click ("Enroll") turns them into a **real student** in your system — a genuine student record with a Student ID (like `STU-26-3243`), added to Class 9, with all the standard Class 9 subjects automatically assigned to them. Behind the scenes, this also automatically creates a real login for the **guardian** (using the phone number they applied with) — I confirmed this happened correctly and without me having to do anything extra.

The student's *own* portal login isn't created automatically (because the application form never asked for the child's own phone number — only the parents') — so I created one manually as a demonstration, the same way you would for a real newly-enrolled student, and logged into it. **What I found:** a complete, real student dashboard — their class (Class 9), a payment summary (their ৳500 admission fee correctly showing as paid), quick links to their routine/results/attendance, notices, and more. Full screenshot in Section 4.

One nice detail I confirmed while testing this: the very first time you log into a newly-created account, the system **forces you to set your own password** before letting you see anything else — it won't let the temporary password sent by SMS just linger forever. That's a real, working security feature, not something I added.

---

## 4. Every situation I tested, with screenshots

All screenshots are saved at:
`C:\Users\PC\AppData\Local\Temp\claude\e--EduErp\03288a6a-2096-4f72-8991-4d8a82314795\scratchpad\pw-driver\audit-shots\`

| Screenshot file | What it shows |
|---|---|
| `baseline-just-applied.png` | A brand-new applicant, nothing processed yet — Step 1 of the tracker done, "Payment Due" clearly shown, a "report payment" button ready. |
| `rejected-unpaid.png` | Rejected before ever paying — payment steps correctly show as never-happened, not "in progress." |
| `rejected-paid.png` | Paid, then rejected before any test — this is the exact case where I found and fixed a real bug **last session** (the tracker used to falsely show the test/interview as "in progress"; now correctly shows "never happened"). |
| `rejected-written-test-failed.png` | Sat the written test, failed it, rejected. |
| `rejected-interview-failed.png` | Passed the written test, failed the interview, rejected — shows both stage cards with real dates/venues, one marked complete, the process correctly ending in rejection. |
| `confirmed.png` | Selected! Every step checked off, both admit cards downloadable, status clearly says CONFIRMED. |
| `enrolled.png` | Fully admitted — identical tracker to Confirmed, but status now says ENROLLED. |
| `waitlisted.png` | Sitting on the waitlist. |
| `payment-pending-verification.png` | Reported a Nagad payment; accountant hasn't checked it yet — the page is honest about this, doesn't falsely say "Paid." |
| `payment-rejected-transaction.png` | Reported a payment with a transaction ID the accountant couldn't verify and rejected — correctly still shows "Payment Due," doesn't silently disappear. |
| `admin-applications-list.png` | The admin's master list — every one of the 38 applicants, their status, and payment state, all in one table. |
| `admin-cycle-detail-scheduling.png` | The cycle's own dashboard: 39 applied, 5 confirmed, 5 enrolled, 90 seats left — and it all adds up correctly. |
| `admin-payment-verification-queue.png` | The accountant's payment queue **after my fix** — correctly shows an applicant's name, their transaction ID, and a working Verify button. |
| `student-portal-home.png` | The real, logged-in dashboard of an enrolled student. |

---

## 5. The bug I found and fixed

**Where:** `apps/admin/src/app/(dashboard)/fees/bank-transfers/page.tsx` — the Accountant's "Bank Transfer Verification" queue (this is the same page used for bKash/Nagad self-reported payments too, not just literal bank transfers).

**What was wrong:** The page assumed every pending payment belonged to an already-enrolled student. The moment a payment belonged to someone who had only *applied* (not yet enrolled — which describes every single admission payment before the applicant is admitted), the entire page crashed with a blank white error screen. Your accountant would have opened this page on day one of real admissions and seen nothing but an error.

**Two smaller issues in the same spot, fixed at the same time:**
- The transaction ID a parent reports (e.g., their bKash transaction number) was being saved correctly but was **never actually shown** to the accountant — meaning there was no way to check it against the bKash/Nagad app even if the page hadn't crashed.
- The "Verify" button only worked for bank transfers with an uploaded slip — bKash/Nagad/Rocket payments (which only ever have a transaction ID, never a "slip") would have had a permanently greyed-out Verify button.

**What I changed:** The page now correctly shows either the enrolled student's name or, for an applicant, their name and admission roll; it now displays the payment method and transaction ID clearly; and the Verify button is only required to have a slip when the payment method is actually a bank transfer.

**How I confirmed the fix works:** I reproduced the crash first (real screenshot, real error message), made the fix, ran the project's own type-checker (clean, no errors), and re-tested the same page — it now renders correctly and the Verify action works. See `admin-payment-verification-queue.png`.

This fix is **saved in your code** (not just in the running server) — it'll still be there the next time you restart everything. It has not been committed to git yet, in line with your standing rule that I only commit when you explicitly ask.

---

## 6. Known, already-expected limitation (not a bug)

Real bKash/Nagad/SSLCommerz payment gateway accounts aren't connected yet — this has been a known, deliberate, already-documented state of this project (you're waiting on real merchant credentials from those providers). I confirmed the system handles this exactly as designed: clicking "Pay via bKash" correctly and gracefully falls back to the manual self-report method instead of erroring out or pretending to work. Once you have real credentials, this becomes a configuration change, not a code change.

---

## 7. The full list of everyone I created (for your own reference/testing)

38 applicants total, all under the "Class 9 Admission 2026-2027" cycle. Nothing has been deleted.

| Roll | Name | Guardian Phone | Final Status | Student ID (if enrolled) |
|---|---|---|---|---|
| CLA-2026-0008 | Arif Hossain Chowdhury | 01711000001 | REJECTED (never paid) | |
| CLA-2026-0009 | Fatima Akter Rimi | 01711000002 | REJECTED (never paid) | |
| CLA-2026-0010 | Tanvir Ahmed Nabil | 01711000003 | REJECTED (never paid) | |
| CLA-2026-0011 | Sumaiya Islam Mim | 01711000004 | REJECTED (never paid) | |
| CLA-2026-0012 | Rakibul Hasan Fahim | 01711000005 | REJECTED (never paid) | |
| CLA-2026-0013 | Nusrat Jahan Priya | 01711000006 | REJECTED (paid, then rejected) | |
| CLA-2026-0014 | Mahmudul Hasan Zisan | 01711000007 | REJECTED (paid, then rejected) | |
| CLA-2026-0015 | Tasnim Jahan Oishi | 01711000008 | REJECTED (paid, then rejected) | |
| CLA-2026-0016 | Ashraful Islam Rafi | 01711000009 | REJECTED (paid, then rejected) | |
| CLA-2026-0017 | Jannatul Ferdous Mim | 01711000010 | REJECTED (paid, then rejected) | |
| CLA-2026-0018 | Imran Kabir Sadi | 01711000011 | REJECTED (failed written test) | |
| CLA-2026-0019 | Farhana Yasmin Nova | 01711000012 | REJECTED (failed written test) | |
| CLA-2026-0020 | Shakil Ahmed Raihan | 01711000013 | REJECTED (failed written test) | |
| CLA-2026-0021 | Rumana Sultana Ruhi | 01711000014 | REJECTED (failed written test) | |
| CLA-2026-0022 | Saiful Islam Emon | 01711000015 | REJECTED (failed written test) | |
| CLA-2026-0023 | Marzia Akter Trisha | 01711000016 | REJECTED (paid via bKash, verified after rejection — a bonus edge case) | |
| CLA-2026-0024 | Nayeem Hasan Arnob | 01711000017 | REJECTED (same as above) | |
| CLA-2026-0025 | Adiba Rahman Nawreen | 01711000018 | REJECTED (same as above) | |
| CLA-2026-0026 | Rifat Hossain Shanto | 01711000019 | REJECTED (same as above) | |
| CLA-2026-0027 | Sanjida Islam Mow | 01711000020 | REJECTED (same as above) | |
| CLA-2026-0028 | Abir Hossain Nihal | 01711000021 | **CONFIRMED** (bank transfer, both stages passed) | |
| CLA-2026-0029 | Israt Jahan Ishika | 01711000022 | **CONFIRMED** | |
| CLA-2026-0030 | Rezaul Karim Dip | 01711000023 | **CONFIRMED** | |
| CLA-2026-0031 | Tahmina Akter Bristi | 01711000024 | **CONFIRMED** | |
| CLA-2026-0032 | Farhan Sadik Adib | 01711000025 | **CONFIRMED** | |
| CLA-2026-0033 | Mim Akter Shanta | 01711000026 | **ENROLLED** | STU-26-3243 |
| CLA-2026-0034 | Tanjim Hasan Oyon | 01711000027 | **ENROLLED** | STU-26-3244 |
| CLA-2026-0035 | Nishat Tabassum Anika | 01711000028 | **ENROLLED** | STU-26-3245 |
| CLA-2026-0036 | Rasel Ahmed Fahad | 01711000029 | **ENROLLED** | STU-26-3246 |
| CLA-2026-0037 | Lamia Akter Nodi | 01711000030 | **ENROLLED** | STU-26-3247 |
| CLA-2026-0038 | Zawad Hossain Fahim | 01711000031 | WAITLISTED | |
| CLA-2026-0039 | Rukaiya Akter Tuli | 01711000032 | PENDING (Nagad payment awaiting accountant check) | |
| CLA-2026-0040 | Emon Chandra Das | 01711000033 | PENDING (Nagad payment, accountant rejected the transaction) | |
| CLA-2026-0041 | Nafisa Anjum Prithi | 01711000041 | REJECTED (bKash paid+verified, failed interview) | |
| CLA-2026-0042 | Tawhidul Islam Sabbir | 01711000042 | REJECTED (same as above) | |
| CLA-2026-0043 | Rownak Jahan Meem | 01711000043 | REJECTED (same as above) | |
| CLA-2026-0044 | Asaduzzaman Nabil | 01711000044 | REJECTED (same as above) | |
| CLA-2026-0045 | Mahiya Islam Nodi | 01711000045 | REJECTED (same as above) | |
| CLA-2026-0046 | Nabila Sultana Orin | 01711000046 | PENDING (just applied, untouched — the baseline case) | |

---

## 8. Bottom line

The online admission system — application, status tracking, payment (cash + self-reported digital + accountant verification), shortlisting, written test, interview, final decision, and enrollment into a real student account — all works correctly, end to end, exactly as it's supposed to. One real, meaningful bug was found (the accountant's payment queue crashing on applicant-only payments) and it's already fixed and verified. The only thing not fully live is the direct bKash/Nagad/SSLCommerz online checkout, which is expected and already known to you — everything falls back correctly to the manual/self-report method in the meantime.
