import { Hero } from "@/components/Hero";
import { ServiceCard } from "@/components/ServiceCard";
import { siteConfig } from "@/config/site";

export default function HomePage() {
  return (
    <>
      <Hero />
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="text-center text-2xl font-bold text-gray-900">What we do</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {siteConfig.services.map((service) => (
            <ServiceCard key={service.slug} service={service} />
          ))}
        </div>
      </section>
    </>
  );
}
