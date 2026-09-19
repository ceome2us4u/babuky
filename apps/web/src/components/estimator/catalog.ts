import {
  Database,
  Globe,
  Link2,
  Lock,
  MessageSquare,
  Plug,
  Server,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

// The estimator's price list and wording. Written for shopkeepers and small
// business owners who have never bought software: the MAIN words are plain
// ("A safe home on the internet for my website"), and the technical name sits
// underneath as subtext ("Technical name: …") so people who Google the tech
// term still land on it and our team can match it to a quote.
//
// `id`, `low` and `high` are what the API stores on the lead
// (apps/api/src/routes/consultancy.ts) — keep the ids stable.

export type EstimatorItem = {
  id: string;
  /** Plain-language name shown as the main heading. */
  title: string;
  /** Very short noun phrase, used in sentences like "You'll probably also need…". */
  short: string;
  /** One or two plain sentences: what it is and why anyone would want it. */
  plain: string;
  /** The technical name, shown as subtext. */
  techName: string;
  low: number;
  high: number;
  icon: LucideIcon;
};

export type EstimatorSection = {
  step: number;
  title: string;
  caption: string;
  items: EstimatorItem[];
};

export const SECTIONS: EstimatorSection[] = [
  {
    step: 1,
    title: "What would you like us to build?",
    caption: "Pick everything that sounds right. Not sure? Choose the closest one — we'll sort out the details together on a call.",
    items: [
      {
        id: "web",
        title: "A website for my business",
        short: "website",
        plain:
          "Shows customers who you are, what you offer, where to find you and how to reach you. Up to 8 pages, and easy for you to update.",
        techName: "Informational website (up to 8 pages, CMS-ready)",
        low: 25000,
        high: 40000,
        icon: Globe,
      },
      {
        id: "ecom",
        title: "An online shop where customers order and pay",
        short: "online shop",
        plain:
          "Customers look through your products, add what they like to a basket and pay online. You receive the orders.",
        techName: "E-commerce store (product catalog, cart, payment gateway)",
        low: 60000,
        high: 110000,
        icon: ShoppingBag,
      },
      {
        id: "mobile",
        title: "A mobile app for Android and iPhone",
        short: "mobile app",
        plain: "One app your customers can install on their phones. We build it once and it works on both kinds of phone.",
        techName: "Cross-platform mobile app (single codebase, Android + iOS)",
        low: 90000,
        high: 160000,
        icon: Smartphone,
      },
      {
        id: "api",
        title: "Connect my apps and software so they share information",
        short: "system behind the app",
        plain:
          "Already have an app, a website or a billing tool? We make them talk to each other, and build the behind-the-scenes system that keeps everything up to date.",
        techName: "Web services / REST APIs (login, data handling, documentation)",
        low: 40000,
        high: 75000,
        icon: Plug,
      },
    ],
  },
  {
    step: 2,
    title: "Getting it online, safely",
    caption: "A website or app needs a web address, a place to live on the internet, and a safety lock. Most projects need these.",
    items: [
      {
        id: "dns",
        title: "My own web address (like yourshop.com)",
        short: "web address",
        plain: "We help you choose your web address and connect it to your website — and to your business email, if you want one.",
        techName: "Domain configuration (DNS, email records, redirects)",
        low: 2000,
        high: 4000,
        icon: Link2,
      },
      {
        id: "ssl",
        title: "The safety padlock on my website",
        short: "safety padlock",
        plain:
          "The little padlock beside your web address. Without it, browsers warn visitors that your site is “Not secure”, and many leave.",
        techName: "SSL certificate (secure HTTPS, auto-renewing)",
        low: 2500,
        high: 5000,
        icon: Lock,
      },
      {
        id: "ec2",
        title: "A safe home on the internet for my website or app",
        short: "online home for your website",
        plain:
          "We set up and look after the computer in the cloud that keeps your website or app running day and night, with the right security.",
        techName: "Cloud server setup (AWS / Google Cloud EC2, security groups, deployment)",
        low: 12000,
        high: 20000,
        icon: Server,
      },
      {
        id: "db",
        title: "A safe place to keep my customer and order details",
        short: "safe storage for your data",
        plain: "Your customers, orders and products are stored securely, backed up automatically, and quick to look up.",
        techName: "Database setup (managed SQL, backups, performance tuning)",
        low: 10000,
        high: 18000,
        icon: Database,
      },
    ],
  },
  {
    step: 3,
    title: "Text messages (SMS) to your customers",
    caption: "Only if you want customers to log in with a phone code or get updates by SMS.",
    items: [
      {
        id: "dlt",
        title: "Permission to send business SMS in India",
        short: "SMS permission",
        plain:
          "Indian rules say every business that sends SMS must register first. We do the paperwork with the telecom authority so your messages aren't blocked.",
        techName: "DLT registration (TRAI entity, sender header, message templates)",
        low: 6000,
        high: 10000,
        icon: ShieldCheck,
      },
      {
        id: "msg91",
        title: "Login codes and updates on my customers' phones",
        short: "SMS login codes",
        plain:
          "Customers get a code by SMS to log in or confirm an order, and you can send them order updates.",
        techName: "OTP / SMS gateway integration (MSG91)",
        low: 8000,
        high: 15000,
        icon: MessageSquare,
      },
    ],
  },
];

export const ALL_ITEMS: EstimatorItem[] = SECTIONS.flatMap((s) => s.items);
export const ITEM_BY_ID = new Map(ALL_ITEMS.map((i) => [i.id, i]));

/** One-tap starting points for people who don't know what to pick. */
export const PRESETS: { id: string; title: string; sub: string; ids: string[] }[] = [
  { id: "website", title: "I need a website", sub: "so customers can find me online", ids: ["web", "dns", "ssl", "ec2"] },
  { id: "sell", title: "I want to sell online", sub: "and get paid by customers", ids: ["ecom", "dns", "ssl", "ec2", "db"] },
  { id: "app", title: "I want my own mobile app", sub: "for Android and iPhone", ids: ["mobile", "api", "ec2", "db"] },
  { id: "sms", title: "Customers should log in with a phone code", sub: "by SMS, the way banks do", ids: ["msg91", "dlt"] },
];

// What people usually forget: choosing X almost always also needs Y.
const NEEDS: Record<string, string[]> = {
  web: ["dns", "ssl", "ec2"],
  ecom: ["dns", "ssl", "ec2", "db"],
  mobile: ["api", "ec2", "db"],
  api: ["ec2", "db"],
  msg91: ["dlt"],
};

/** Items the current choices usually need but which aren't ticked yet. */
export function missingFor(selected: Set<string>): EstimatorItem[] {
  const missing = new Set<string>();
  for (const id of selected) for (const need of NEEDS[id] ?? []) if (!selected.has(need)) missing.add(need);
  return ALL_ITEMS.filter((i) => missing.has(i.id));
}

export const sum = (items: EstimatorItem[]) => ({
  low: items.reduce((s, i) => s + i.low, 0),
  high: items.reduce((s, i) => s + i.high, 0),
});

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
