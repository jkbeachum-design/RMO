/** RMO-facing site guide used as Help chatbot context (RMO mode only). */
export const RMO_GUIDE = `# RMO Compliance - RMO guide

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
`;
