import { ServiceCard } from "@/components/ServiceCard";
import { CTAButton } from "@/components/CTAButton";
import { siteConfig } from "@/config/site";

export const metadata = {
  title: `Services — ${siteConfig.siteName}`,
};

export default function ServicesPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Services</h1>
      <p className="mt-3 max-w-2xl text-gray-600">
        {siteConfig.siteName} acts as your software services company — pick an engagement model
        that fits how your team already works.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {siteConfig.services.map((service) => (
          <ServiceCard key={service.slug} service={service} />
        ))}
      </div>
      <div className="mt-10">
        <CTAButton href="/get-started">Start a project</CTAButton>
      </div>
    </section>
  );
}
