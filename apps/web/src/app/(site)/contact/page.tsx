import { ContactForm } from "@/components/ContactForm";
import { siteConfig } from "@/config/site";

export const metadata = {
  title: `Contact — ${siteConfig.siteName}`,
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-xs font-semibold uppercase text-gold">Get in touch</p>
      <h1 className="mt-2 text-3xl font-black md:text-4xl">Contact</h1>

      {siteConfig.contact.email || siteConfig.contact.phone ? (
        <div className="mt-4 space-y-1 text-sm text-muted-foreground">
          {siteConfig.contact.email && <p>Email: {siteConfig.contact.email}</p>}
          {siteConfig.contact.phone && <p>Phone: {siteConfig.contact.phone}</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Direct contact details are being finalized. In the meantime, send us a message below.
        </p>
      )}

      <div className="mt-8">
        <ContactForm />
      </div>
    </section>
  );
}
