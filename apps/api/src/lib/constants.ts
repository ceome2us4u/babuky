export const LEAD_SOURCES = ["MERCHANT", "LOCAL_BUYER", "CONSULTANCY_LEAD"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const SHOP_MODES = ["display", "order"] as const;
