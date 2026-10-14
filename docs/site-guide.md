<!-- Source of truth lives in frontend/src/content/help/*.ts (bundled for the Help chatbot). -->

You are signed in as the RMO (Responsible Managing Officer / qualifier). The RMO dashboard is at /dashboard. Your CEOs (company owners you qualify for) use a separate CEO portal at /operator.

## Signing in and accounts
- Sign in with email and password (Supabase Auth). Public sign-up is turned off; CEO accounts are set up by you/your admin.
- "Forgot password?" on the sign-in page emails a reset link; the link opens "Set a new password".
- If your account has both RMO and CEO access, a "Switch to CEO" / "Switch to RMO" button appears in the top bar.
- The "Active license" switcher picks which company/license you are viewing.

## Overview (/dashboard)
- RMO Dashboard with counts for active projects, compliance logs, items needing review, and recent critical items, plus recent compliance logs. Open a log to see its detail.

## Inbox
- "Needs review" list of CEO reports waiting on you.

## Compliance log and log detail
- Compliance Log lists every report filed by CEOs (by phone call or the structured form).
- Log detail shows extracted data (projects, contract value, subs, crew) and any review flags raised by the rules engine.
- "RMO review" section: add supervisory notes and mark the log reviewed. Review flags, needs-review status and your notes are visible only to RMOs; CEOs never see them.

## Portfolio
- CSLB 7068.1 / 7068.2 tracking: rolling one-year usage, firm associations and slots remaining, record an association with its eligibility basis, and 7068.2 disassociation clocks.

## Onboarding (companies / licenses)
- "Add company to portfolio": license number, legal company name, license status (e.g. ACTIVE / EXEMPT), qualifier duties description, links. Existing companies can be edited here.

## Roles & team (CEO management)
- Permission matrix by role, the company team list, and pending invites. Manage which people (CEOs and others) have access to which company.

## Projects and Subs
- Same records the CEO sees, across your accessible licenses. Create or edit projects (address, contract value, permit, trades, scope, dates, status) and subcontractors (company, contact, phone, email, trade, CSLB number, COI expiration and document link). An AI fill helper can turn a pasted note into form fields.

## Supervision
- Supervision log with a 30-day involvement heatmap. "Log activity" records what you did (e.g. "Inspected framing at 123 Main") with optional project address and details.

## Vault
- Document vault per company, with "Expiring soon" and "Missing docs". Add documents (PDF/JPG/PNG up to 5 MB) with optional expiration and related name.

## Monthly Audit
- Monthly Compliance Audit Report: compliance activities for the month, RMO supervisory notes, and digital signature.

## Export
- Audit defense / evidence export package and acknowledgements.

## Rules
- Rules & digests: rule thresholds that generate review flags, and digest / low-involvement alert settings.

## CEO portal (what your CEOs see)
- Check-In with the compliance line (916) 848-5224 and the structured report form, History (with edit), Vault, Projects, Subs, phone install and offline queue, forgot password. CEOs never see review flags.

## Support
- If something is not covered here, it may not exist yet; check with the system admin (Jonathan Beachum, jbeachum@buildmyoffice.com).

You are signed in as a CEO. Your RMO (Responsible Managing Officer) is the qualifier for your company's contractor license. This portal is how you keep your RMO informed about your projects, subcontractors, crew and documents.

## Signing in
- Open rmo.buildmyoffice.com in Chrome and sign in with your email and password.
- There is no sign-up button. Your account is created for you by your RMO.
- Forgot your password? On the sign-in page tap "Forgot password?", enter your email, then open the reset link that is emailed to you (check spam too). Set a new password and confirm it, then sign in.
- "Log out" is in the top bar.

## Put it on your phone (Android, Chrome)
- While online, open the site in Chrome, tap the three-dot menu, then "Add to Home screen" or "Install app". Open it from that icon from then on.
- Weak signal is OK. After one visit, the CEO home (Check-In), Submit report, and History keep working with poor signal. Reports you fill in are saved on the phone and send automatically when you are back online. A banner shows when you are offline or have reports waiting to send.

## Check-In (home page)
Two ways to report:
- "Call compliance line" - (916) 848-5224. Quick and hands-free from a job site.
- "Submit structured report" - the form for multiple projects, permits, and photo or document uploads.
- "View your reports" opens History.

## Manual Report (Submit Compliance Report form)
- Your name (CEO identification) and the company/license this report is for.
- Projects on this report: pick an existing project or "New project..." and enter address, contract value, trades (comma-separated) and permit number.
- Subs on this report: company name, contact name, CSLB license number, trade.
- Crew: choose "No direct employees (everything subcontractors)" or "Yes, we have direct employees or hired crew" and describe how many and what roles.
- Document uploads (optional): building permits and project photos.
- Additional notes (optional): anything else your RMO should know for this period.
- Submit. If you are offline it is queued on the phone and sent later.

## History
- "Your reports" lists the reports you have sent, with the submitted date.
- You can open "Edit report" to correct your name, project address, contract value, permit number, trades or notes.
- If you have no reports yet, call the compliance line or submit the form to file one.

## Vault
- Tap Vault, then "Add a document". Give it a title (for example "COI - Sparks Electric"), an optional expiration date, an optional related company or project name, and choose the file or take a photo.
- Files can be PDF, JPG or PNG, up to 5 MB. Good for COIs, permits, contracts and licenses.

## Projects
- Projects lists your company's projects. Add a new one or open one to edit: project address, contract value, permit number, trades, scope, start date, end date, and status (Active, On hold, Completed).

## Subs
- Subs lists your subcontractors. Add or edit: company name, contact name, phone, email, trade, CSLB number, COI expiration date, and COI document link.

## Help and feedback
- For anything this guide does not cover, or if something looks broken, contact your RMO, Jonathan Beachum: text or call (916) 228-1776, or email jbeachum@buildmyoffice.com. A screenshot helps.
