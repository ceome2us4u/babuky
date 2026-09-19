// UPI payment intent. Built only from the UPI ID and name the shop owner
// confirmed (see apps/api /shops/:id/upi/confirm); the money moves buyer ->
// vendor directly over UPI and never touches Babuki or Razorpay.
export function buildUpiLink(opts: {
  vpa: string;
  name: string;
  amountPaise?: number;
  note?: string;
}): string {
  const params = [`pa=${encodeURIComponent(opts.vpa)}`, `pn=${encodeURIComponent(opts.name)}`];
  if (opts.amountPaise && opts.amountPaise > 0) params.push(`am=${(opts.amountPaise / 100).toFixed(2)}`);
  params.push("cu=INR");
  if (opts.note) params.push(`tn=${encodeURIComponent(opts.note.slice(0, 50))}`);
  return `upi://pay?${params.join("&")}`;
}

// Whole rupees show without decimals (₹450); anything else always shows two
// (₹450.50, never ₹450.5).
export const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
