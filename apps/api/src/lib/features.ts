// Product switches — like APP_MODE (see ./mode.ts), these are env properties on
// the box (api/.env), flipped by a script, never by editing code:
//
//   FEATURE_OWN_DOMAIN=on   the ₹1,500 "own web address" plan is offered
//   anything else / unset   OFF: the site is exactly the ₹500 subdomain flow
//
//   bash scripts/set-own-domain.sh on|off <host>
//
// scripts/deploy.sh preserves the value, and /health + /features report it.
// OFF only stops NEW sales: payments already taken (the webhook), domains
// already paid for, renewals and existing premium shops keep working, because
// those follow each shop's own plan, not this switch.

export const ownDomainEnabled = () => process.env.FEATURE_OWN_DOMAIN === "on";

/** What the browser may know about. Read by the web app at runtime, never baked into a build. */
export const features = () => ({ ownDomain: ownDomainEnabled() });
