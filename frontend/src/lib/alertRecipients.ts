/**
 * Re-export shared alert recipient filtering for Next.js routes.
 * Canonical implementation lives in repo-root `src/alertRecipients.js`.
 */
export {
  DEFAULT_ALERT_EMAIL_BLOCKLIST,
  parseCsvEnv,
  normalizeEmail,
  normalizePhone,
  filterAlertEmails,
  filterAlertPhones,
  filterAlertRecipients
} from '../../../src/alertRecipients.js';
