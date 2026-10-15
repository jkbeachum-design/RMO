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
- Compliance Log lists every report filed by CEOs (through the structured report form).
- Log detail shows extracted data (projects, contract value, subs, crew) and any review flags raised by the rules engine.
- "RMO review" section: add supervisory notes and mark the log reviewed. Review flags, needs-review status and your notes are visible only to RMOs; CEOs never see them.

## Portfolio
- CSLB 7068.1 / 7068.2 tracking: rolling one-year usage, firm associations and slots remaining, record an association with its eligibility basis, and 7068.2 disassociation clocks.

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

## Settings
The menu has a Settings item (last link). Sections:
- Account: edit your name and phone, see your sign-in email, change password (current password, then the new one twice, 8+ characters), log out.
- Notifications: phone alerts through the ntfy app (server, topic, optional access token which is saved but never shown again), alert email address(es), and toggles for "New report submitted" and "Reports with flags" (flag details are included only in your RMO alerts). "Send test alert" sends one phone push and one email. The daily digest is turned off.
- Compliance rules: per-company rule thresholds that raise review flags, and the low-involvement window in days.
- Companies & licenses (formerly Onboarding): add a company to your portfolio or edit one (license number, legal name, license status, qualifier duties, links).
- Team & CEOs (formerly Roles): permission matrix, the company team, Add CEO, pending invites, change a member's role, and "Remove from this license", which takes a person off that one company after a confirmation. It does not deactivate their account, and you cannot remove yourself or the last RMO.
- App & help: install on your phone, the Help button, and support contact.
Old links to Onboarding, Roles and Alerts open the matching Settings page.

## CEO portal (what your CEOs see)
- Check-In with the structured report form, History (with edit), Vault, Projects, Subs, phone install and offline queue, forgot password, and CEO Settings (account with phone-only editing, change password, My company with the RMO contact, phone app and offline queue, help). CEOs never see review flags.

## Support
- If something is not covered here, it may not exist yet; check with the system admin (Jonathan Beachum, jbeachum@buildmyoffice.com).

You are signed in as a CEO. Your RMO (Responsible Managing Officer) is the qualifier for your company's contractor license. This portal is how you keep your RMO informed about your projects, subcontractors, crew and documents.

## Signing in
- Open rmo.buildmyoffice.com in Chrome and sign in with your email and password.
- There is no sign-up button. Your account is created for you by your RMO.
- To change your password while signed in, go to Settings, Account, Change password.
- Forgot your password? On the sign-in page tap "Forgot password?", enter your email, then open the reset link that is emailed to you (check spam too). Set a new password and confirm it, then sign in.
- "Log out" is in the top bar.

## Put it on your phone (Android, Chrome)
- While online, open the site in Chrome, tap the three-dot menu, then "Add to Home screen" or "Install app". Open it from that icon from then on.
- Weak signal is OK. After one visit, the CEO home (Check-In), Submit report, and History keep working with poor signal. Reports you fill in are saved on the phone and send automatically when you are back online. A banner shows when you are offline or have reports waiting to send.

## Check-In (home page)
- "Submit structured report" - the report form for your projects, subs, crew, permits, and photo or document uploads. This is how you check in.
- There is no phone call-in option right now; reports are submitted with the form.
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
- If you have no reports yet, submit the report form to file one.

## Vault
- Tap Vault, then "Add a document". Give it a title (for example "COI - Sparks Electric"), an optional expiration date, an optional related company or project name, and choose the file or take a photo.
- Files can be PDF, JPG or PNG, up to 5 MB. Good for COIs, permits, contracts and licenses.

## Projects
- Projects lists your company's projects. Add a new one or open one to edit: project address, contract value, permit number, trades, scope, start date, end date, and status (Active, On hold, Completed).

## Subs
- Subs lists your subcontractors. Add or edit: company name, contact name, phone, email, trade, CSLB number, COI expiration date, and COI document link.

## Settings
Open the menu (three-line button, top left on a phone) and tap Settings. It has four parts:
- Account: your name (read-only; ask your RMO to change it), your sign-in email (read-only), and your phone number, which you can edit and save. Change password: enter your current password, then the new one twice (at least 8 characters). Log out is here too.
- My company: your company name and CSLB license number, plus your RMO's name, phone and email. These details are managed by your RMO.
- Phone app: install the site on your phone, see whether you are online, and see how many reports are waiting to send from this phone. If any are waiting and you have signal, tap "Send now".
- Help & feedback: how to use the ? Help button, and buttons to text, call or email Jonathan Beachum.

## Help and feedback
- For anything this guide does not cover, or if something looks broken, contact your RMO, Jonathan Beachum: text or call (916) 228-1776, or email jbeachum@buildmyoffice.com. A screenshot helps.
