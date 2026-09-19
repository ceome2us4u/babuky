import { query } from "./db.js";
import { cancelSubscription, fetchSubscriptionStatus } from "./razorpay.js";

// A shop is created ("draft") when the vendor reaches the payment step, and only
// becomes live once the subscription is paid. Someone who backs out at payment
// used to keep their web address forever — blocking everyone else, and even the
// same person coming back. So an unpaid draft only HOLDS its address for a while:
//
//  - the owner can always pick their own unfinished shop back up;
//  - after DRAFT_HOLD_HOURS an EMPTY draft (no items, no categories, no
//    non-pending subscription) is "abandoned" and its address can be taken;
//  - before it's actually released we ask Razorpay whether a payment could still
//    be in flight (webhooks can lag), and if we can't tell we keep the address.
//
// A draft with catalog work in it is never released automatically — that's the
// vendor's effort; they can finish it from /dashboard or delete it themselves.

export const DRAFT_HOLD_HOURS = 2;

/** SQL predicate over a `shops s` row: an unpaid, empty draft older than the hold time. */
export const ABANDONED_DRAFT_SQL = `(
  s.status = 'draft'
  AND s.created_at < now() - make_interval(hours => ${DRAFT_HOLD_HOURS})
  AND NOT EXISTS (SELECT 1 FROM shop_items i WHERE i.shop_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM shop_categories c WHERE c.shop_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM shop_subscriptions x WHERE x.shop_id = s.id AND x.status <> 'pending')
)`;

export type SlugHolder = { id: string; owner_phone: string; status: "draft" | "active" | "suspended"; abandoned: boolean };

export async function findSlugHolder(slug: string): Promise<SlugHolder | null> {
  const { rows } = await query<SlugHolder>(
    `SELECT s.id, s.owner_phone, s.status::text AS status, ${ABANDONED_DRAFT_SQL} AS abandoned
       FROM shops s WHERE s.slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

// Razorpay subscription states in which nothing has been paid and nothing can be:
// never authenticated ("created"), or ended without a payment.
const UNPAID = new Set(["created", "cancelled", "expired"]);

/**
 * True only when we KNOW no payment is in progress for this shop's subscriptions.
 * Any lookup failure, or a state like authenticated/active/pending, means "keep it".
 */
export async function noPaymentInFlight(shopId: string): Promise<boolean> {
  const { rows } = await query<{ razorpay_subscription_id: string | null }>(
    "SELECT razorpay_subscription_id FROM shop_subscriptions WHERE shop_id = $1",
    [shopId],
  );
  for (const row of rows) {
    if (!row.razorpay_subscription_id) continue;
    try {
      if (!UNPAID.has(await fetchSubscriptionStatus(row.razorpay_subscription_id))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Deletes an unpublished draft (its subscriptions, categories and items go with it) and frees its address. */
export async function releaseDraft(shopId: string): Promise<void> {
  const { rows } = await query<{ razorpay_subscription_id: string | null }>(
    "SELECT razorpay_subscription_id FROM shop_subscriptions WHERE shop_id = $1",
    [shopId],
  );
  for (const row of rows) {
    if (row.razorpay_subscription_id) await cancelSubscription(row.razorpay_subscription_id).catch(() => undefined);
  }
  await query("DELETE FROM shops WHERE id = $1 AND status = 'draft'", [shopId]);
}
