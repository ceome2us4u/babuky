import { siteConfig } from "@/config/site";
import { CTAButton } from "./CTAButton";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
        {siteConfig.tagline}
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">{siteConfig.description}</p>
      <div className="mt-8 flex justify-center gap-4">
        <CTAButton href="/get-started">Get Started</CTAButton>
        <CTAButton href="/services" variant="secondary">
          See Our Services
        </CTAButton>
      </div>
    </section>
  );
}
