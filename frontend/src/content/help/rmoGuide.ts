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
`;
