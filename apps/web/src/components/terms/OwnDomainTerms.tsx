"use client";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useFeatures } from "@/lib/features";

// Terms for the ₹1,500 "own web address" plan. Shown only while the feature is
// on (the site must look exactly as before when it's off).
//
// Why these clauses (checked 2026-09-19):
//  - Babuki is the registrant and LICENSES the name to the vendor. Under ICANN's
//    Registrar Accreditation Agreement §3.7.7.3 a registrant that licenses a
//    name stays the holder of record and accepts liability for harm caused by
//    its wrongful use UNLESS it discloses the licensee's identity and contact
//    details within 7 days to anyone giving reasonable evidence of actionable
//    harm — so the vendor must agree to that disclosure (§4).
//  - .IN names are governed by NIXI's policies and disputes by INDRP; generic
//    names by UDRP. Babuki, as holder, is the respondent in either, so the vendor
//    warrants its right to the name and indemnifies Babuki (Trade Marks Act,
//    1999: passing off / infringement) (§3, §4).
//  - The vendor never owns or can transfer the name (no ownership passes in a
//    licence), and what happens when payments stop is spelled out (§1, §5).
//  - Accepted at checkout = a valid electronic contract (IT Act 2000 s.10A).
const CLAUSES = [
  "Who owns the address: Me2Us4U (OPC) Private Limited ('Babuki') registers the web address in its own name and remains its registered holder at all times. The vendor receives a limited, non-exclusive, non-transferable licence to use it for their Babuki storefront for as long as their Own Web Address subscription is active and paid. No ownership, right of transfer or transfer (authorisation) code passes to the vendor.",
  "What the price includes: the monthly fee shown at checkout covers registering the address, renewing it every year, pointing it at the storefront and its secure (https) certificate. There are no separate domain charges. Early-bird vendors retain ₹1,500/month for the lifetime of continuous subscription.",
  "Choosing a name: the vendor confirms they are entitled to use the name they choose and that it does not infringe any trade mark, company name or other person's rights (including under the Trade Marks Act, 1999). Babuki may refuse, or ask the vendor to change, a name that appears to infringe someone's rights or breaks the rules of the registry for that ending (for .IN names, NIXI's policies).",
  "Complaints about a name: because Babuki is the registered holder, domain disputes (INDRP for .IN names, UDRP for others) and legal notices are addressed to Babuki. The vendor agrees that, if anyone gives Babuki reasonable evidence that the address or its storefront is causing them actionable harm, Babuki may share the vendor's identity and contact details with that person (as registry rules require, within 7 days), and may suspend or disable the address. The vendor indemnifies Babuki against claims arising from the name they chose or their use of it.",
  "If payments stop: the storefront goes offline and the address is held for 30 days. Renewing within those 30 days restores both. After that the address is released — it is not renewed and may later be registered by anyone — and it is not transferred to the vendor. The vendor's shop, catalog and Babuki address (slug.babuki.com) are kept as for any lapsed subscription.",
  "Setup and replacements: an address usually works within 30 minutes of the first payment, but this depends on the registry and is not guaranteed. If a chosen address cannot be registered (for example, someone else registers it first), the vendor picks another at no extra cost; meanwhile the storefront works at its Babuki address. If a registry materially changes its price or eligibility rules for an ending, Babuki may offer an equivalent address instead.",
  "Upgrading from the ₹500 plan: the ₹500 subscription is cancelled automatically once the first ₹1,500 payment has gone through, so the vendor is not charged for both.",
  "Refunds: monthly fees already paid are not refundable, as the address is registered and paid for with the registry as soon as the first payment is received.",
];

export function OwnDomainTermsItem() {
  const { ownDomain } = useFeatures();
  if (!ownDomain) return null;
  return (
    <AccordionItem value="own-domain">
      <AccordionTrigger className="text-left font-semibold">Own Web Address Plan (₹1,500/month)</AccordionTrigger>
      <AccordionContent>
        <ul className="space-y-3 text-sm text-muted-foreground">
          {CLAUSES.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-gold">§{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}
