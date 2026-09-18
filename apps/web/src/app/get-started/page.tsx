import { PayButton } from "@/components/PayButton";
import { siteConfig } from "@/config/site";

export const metadata = {
  title: `Get Started — ${siteConfig.siteName}`,
};

const steps = [
  { title: "Scope the engagement", description: "We talk through what you need and how we'll work together." },
  { title: "Sign the contract", description: "We send a service agreement for e-signature." },
  { title: "Kick off", description: "Pay the deposit below and we start work." },
];

export default function GetStartedPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Get Started</h1>
      <ol className="mt-8 space-y-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
              {index + 1}
            </span>
            <div>
              <p className="font-semibold text-gray-900">{step.title}</p>
              <p className="text-sm text-gray-600">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 border-t border-gray-200 pt-8">
        <h2 className="text-lg font-semibold text-gray-900">Ready to kick off?</h2>
        <p className="mt-1 text-sm text-gray-600">Pay the deposit to confirm your project slot.</p>
        <div className="mt-4">
          <PayButton amountInPaise={5000000} label="Pay deposit (₹50,000)" />
        </div>
      </div>
    </section>
  );
}
