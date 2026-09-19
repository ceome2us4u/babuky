import type { Metadata } from "next";
import { FileSignature, Scale, ShieldAlert } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { OwnDomainTermsItem } from "@/components/terms/OwnDomainTerms";

export const metadata: Metadata = {
  title: "Contract & Terms Center — Babuki",
  description:
    "Master Service Agreement, Statement of Work outline and Section 79 intermediary protection under the Indian IT Act, with digital signature.",
  openGraph: {
    title: "Contract & Terms Center — Babuki",
    description: "MSA, SOW and Section 79 intermediary terms for Babuki vendors and clients.",
  },
};

const SECTIONS = [
  {
    id: "msa",
    title: "Master Service Agreement (MSA)",
    body: [
      "Parties: Me2Us4U (OPC) Private Limited, operator of babuki.com ('Babuki'), and the subscribing vendor or client ('Counterparty').",
      "Scope: Babuki provides software-as-a-service provisioning (subdomain storefronts, discovery listing) and, separately, bespoke software consultancy services.",
      "Term & renewal: Subscriptions renew monthly. Early-bird vendors retain ₹500/month for the lifetime of continuous subscription; lapsed accounts re-enter at prevailing rates.",
      "Fees & taxes: Vendor subscription prices shown at checkout are the total amount payable, inclusive of any applicable GST. Consultancy fees are exclusive of GST unless stated. The ₹100 consultancy commitment deposit is credited in full against the first project invoice on contract signing.",
      "Confidentiality: Each party protects the other's non-public information for three years from disclosure.",
      "Limitation of liability: Aggregate liability is limited to fees paid in the three months preceding the claim.",
      "Governing law: Laws of India; exclusive jurisdiction of the courts at the registered office of Me2Us4U (OPC) Pvt Ltd.",
    ],
  },
  {
    id: "sow",
    title: "Statement of Work (SOW) Outline",
    body: [
      "Discovery: A 1-on-1 session with the lead technical architect converts the cart estimate into a fixed deliverable list.",
      "Deliverables: Enumerated per Category 1 (product surface), Category 2 (cloud infrastructure) and Category 3 (telecom & verification).",
      "Milestones: Payment schedule of 40% on signing, 30% at build midpoint, 30% at handover, unless amended in writing.",
      "Change control: Scope additions are quoted as an addendum and do not alter agreed milestones until countersigned.",
      "Acceptance: Deliverables are deemed accepted seven days after handover absent written defect notice.",
      "Support: Thirty days of defect remediation is included post-handover; ongoing support is a separate retainer.",
    ],
  },
  {
    id: "s79",
    title: "Section 79 — Intermediary Protection Clause (Indian IT Act, 2000)",
    body: [
      "Babuki qualifies as an 'intermediary' under Section 2(1)(w) of the Information Technology Act, 2000, providing a technology layer on which third-party vendors publish their own listings.",
      "Under Section 79(1), an intermediary is not liable for third-party information, data or communication links hosted or made available by it.",
      "Section 79(2): Babuki's function is limited to providing access to a communication system; it does not initiate the transmission, select the receiver, or modify the information contained in vendor listings.",
      "Section 79(3): Protection ceases only where the intermediary conspires, abets or fails to expeditiously remove unlawful material after actual knowledge or notification by an appropriate government agency.",
      "Due diligence: Babuki observes the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, publishes grievance contact details, and acts on valid takedown notices within statutory timelines.",
      "Payments: All buyer payments occur directly between buyer and vendor through the vendor's own UPI instrument. Babuki is neither a payment aggregator nor an escrow agent and holds no customer funds.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase text-gold">Legal</p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-black md:text-4xl">
          <Scale className="size-7 text-gold" /> Contract &amp; Terms Center
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Governing terms for Babuki vendors and consultancy clients, under the laws of India.
        </p>
      </header>

      <div className="panel mb-8 flex items-start gap-3 rounded-lg border-l-4 border-l-primary p-5">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-gold" />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Section 79 disclaimer:</span> Babuki and
          Me2Us4U (OPC) Pvt Ltd do not verify the quality of goods, the completion of payments, or the
          physical delivery of any order placed with a vendor listed on this platform. Every
          transaction is strictly between the buyer and the vendor.
        </p>
      </div>

      <Accordion type="multiple" defaultValue={["msa"]} className="panel rounded-lg px-6">
        {SECTIONS.map((s) => (
          <AccordionItem key={s.id} value={s.id}>
            <AccordionTrigger className="text-left font-semibold">{s.title}</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {s.body.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-gold">§{i + 1}</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
        <OwnDomainTermsItem />
      </Accordion>

      <section className="panel mt-8 rounded-lg p-8">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <FileSignature className="size-5 text-gold" /> Digital signature
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Online e-signature (Aadhaar eSign / OTP verification) is being integrated and is not live
          yet. Nothing entered here is recorded — agreements are countersigned with you during
          discovery (consultancy) or accepted at checkout (vendor subscription).
        </p>

        <div className="mt-6 space-y-4 opacity-60">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Client / vendor name</Label>
              <Input placeholder="Your full legal name" disabled />
            </div>
            <div className="space-y-2">
              <Label>Aadhaar / OTP verification</Label>
              <Input placeholder="Your Aadhaar / OTP reference" disabled />
            </div>
          </div>
          <Button disabled>Sign agreement — coming soon</Button>
        </div>
      </section>
    </div>
  );
}
