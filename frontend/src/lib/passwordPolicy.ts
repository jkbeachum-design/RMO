/** Shared password rules for reset / invite temp passwords. */
export function validateNewPassword(password: string): { ok: true } | { ok: false; error: string } {
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }
  if (password.length > 200) {
    return { ok: false, error: 'Password is too long' };
  }
  return { ok: true };
}
