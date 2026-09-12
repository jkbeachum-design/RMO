/** Pilot bootstrap email — used only for migration when password_hash is unset. */
export const PILOT_EMAIL = 'jbeachum@buildmyoffice.com';
/** Legacy seed email — remapped to PILOT_EMAIL on bootstrap / migration. */
export const LEGACY_PILOT_EMAIL = 'jonathan@buildmyoffice.com';
export const PILOT_NAME = 'Jonathan Beachum';
export const COMPLIANCE_PHONE = '+19168485224';
export const COMPLIANCE_PHONE_DISPLAY = '(916) 848-5224';
export const SESSION_COOKIE = 'rmo_session';

/**
 * @deprecated Do not hard-code license access. Prefer the first membership license
 * from the signed session / user_licenses. Kept only as a display fallback label
 * for empty states — never as an authorization default.
 */
export const LEGACY_PILOT_LICENSE = '836089';
