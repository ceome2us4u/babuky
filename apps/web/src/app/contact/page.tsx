import { ContactForm } from "@/components/ContactForm";
import { siteConfig } from "@/config/site";

export const metadata = {
  title: `Contact — ${siteConfig.siteName}`,
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Contact</h1>

      {siteConfig.contact.email || siteConfig.contact.phone ? (
        <div className="mt-4 space-y-1 text-gray-600">
          {siteConfig.contact.email && <p>Email: {siteConfig.contact.email}</p>}
          {siteConfig.contact.phone && <p>Phone: {siteConfig.contact.phone}</p>}
        </div>
      ) : (
        <p className="mt-4 text-gray-600">
          Direct contact details are being finalized. In the meantime, send us a message below.
        </p>
      )}

      <div className="mt-10">
        <ContactForm />
      </div>
    </section>
  );
}
