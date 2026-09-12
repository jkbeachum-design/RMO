/**
 * TypeScript types for shared CJS module `src/alertRecipients.js`.
 */
export const DEFAULT_ALERT_EMAIL_BLOCKLIST: readonly string[];

export function parseCsvEnv(value: string | undefined | null): string[];
export function normalizeEmail(email: string): string;
export function normalizePhone(phone: string): string;

export function filterAlertEmails(
  emails: Iterable<string> | string | null | undefined,
  env?: NodeJS.ProcessEnv
): string[];

export function filterAlertPhones(
  phones: Iterable<string> | string | null | undefined,
  env?: NodeJS.ProcessEnv
): string[];

export function filterAlertRecipients(
  contacts: {
    emails?: Iterable<string> | string | null;
    phones?: Iterable<string> | string | null;
  },
  env?: NodeJS.ProcessEnv
): { emails: string[]; phones: string[] };
