/**
 * CEO-facing site guide used as Help chatbot context.
 * HARD RULE: this text must never mention review flags, flagged items,
 * needs-review/attention, risk, or any RMO-only screens. Enforced by
 * assertCeoGuideClean() in src/lib/helpContext.ts.
 */
export const CEO_GUIDE = `# RMO Compliance - CEO guide

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

## Help and feedback
- For anything this guide does not cover, or if something looks broken, contact your RMO, Jonathan Beachum: text or call (916) 228-1776, or email jbeachum@buildmyoffice.com. A screenshot helps.
`;
