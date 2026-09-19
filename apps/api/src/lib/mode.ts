// ONE switch for TEST vs LIVE across everything (OTP, Razorpay, …) — the same
// convention as the Home repo's packages/integrations/src/mode.ts.
//
//   APP_MODE=test        -> test mode: OTP is never really sent (a fixed code is
//                           accepted for ANY phone number and returned as
//                           `devOtpHint`), and Razorpay uses its TEST credentials.
//   unset / anything else -> LIVE.
//
// It is an env property on the box (api/.env), flipped with
// `scripts/set-app-mode.sh test|live <host>` — never by editing code, and
// `scripts/deploy.sh` preserves whatever is set. /health reports the mode.

export const isTestMode = () => process.env.APP_MODE === "test";
export const appMode = () => (isTestMode() ? "test" : "live");

/**
 * The message to show a user when something upstream failed (Razorpay, MSG91,
 * missing config...). The real error is always logged for us. In LIVE users get
 * only the friendly `fallback` — never provider JSON or variable names; in TEST
 * mode the detail is returned so whoever is testing can see what actually broke.
 */
export function publicError(error: unknown, fallback: string): string {
  console.error(`[${fallback}]`, error);
  return isTestMode() && error instanceof Error ? error.message : fallback;
}

/**
 * Picks `<BASE>_TEST` or `<BASE>_LIVE` by mode. Both sets sit side by side in
 * the env, so a flip is one variable, no key juggling. FAILS CLOSED: a missing
 * (or still-placeholder) value for the active mode is an error — test mode can
 * never quietly fall back to live keys and move real money.
 */
export function pick(base: string): string {
  const suffix = isTestMode() ? "TEST" : "LIVE";
  const value = process.env[`${base}_${suffix}`];
  if (!value || value === "not-configured-yet") {
    throw new Error(`${base}_${suffix} is not configured yet (APP_MODE=${appMode()}).`);
  }
  return value;
}
