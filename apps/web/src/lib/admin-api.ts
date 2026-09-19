// Types for the admin console's API (apps/api/src/routes/admin*.ts).

export type Page<T> = { total: number; items: T[] };

export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost";
export type MessageStatus = "new" | "replied" | "closed";
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];
export const MESSAGE_STATUSES: MessageStatus[] = ["new", "replied", "closed"];

export type Estimate = {
  id: string;
  ticket_ref: string;
  status: LeadStatus;
  deposit_status: "pending" | "paid";
  budget_low: number;
  budget_high: number;
  selected_items: { id: string; low: number; high: number }[];
  name: string;
  email: string;
  description: string;
  admin_notes: string;
  razorpay_order_id: string | null;
  created_at: string;
  updated_at: string;
  phone: string;
  profile_name: string | null;
  profile_email: string | null;
  account_type: "business" | "individual" | null;
  business_name: string | null;
  city: string | null;
  /** A web address they asked about from the shop signup ("On request"); "" if none. */
  requested_domain: string;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  status: MessageStatus;
  admin_notes: string;
  created_at: string;
};

export type AdminShop = {
  id: string;
  slug: string;
  name: string;
  owner_name: string;
  industry: string;
  mode: "display" | "order";
  status: "draft" | "active" | "suspended";
  address_text: string;
  upi_id: string | null;
  verified_merchant_name: string | null;
  is_upi_verified: boolean;
  created_at: string;
  phone: string;
  profile_name: string | null;
  profile_email: string | null;
  business_name: string | null;
  city: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  item_count: number;
  plan: "standard" | "premium";
  own_domain: string | null;
  own_domain_status: string | null;
  own_domain_cost_cents: number | null;
  own_domain_renewal_cents: number | null;
  own_domain_expires_at: string | null;
  own_domain_alert: string | null;
  own_domain_last_error: string | null;
};

export type AdminUser = {
  phone: string;
  consent: boolean;
  created_at: string;
  has_password: boolean;
  full_name: string | null;
  email: string | null;
  account_type: "business" | "individual" | null;
  business_name: string | null;
  city: string | null;
  lead_sources: string[];
  shop_count: number;
  estimate_count: number;
};

export type Overview = {
  counts: Record<string, number>;
  feed: { kind: "estimate" | "message" | "shop" | "signup"; id: string; title: string; detail: string; created_at: string }[];
  actions: {
    admin_email: string;
    action: string;
    target_type: string;
    target_id: string;
    details: Record<string, unknown>;
    created_at: string;
  }[];
};
