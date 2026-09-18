import { siteConfig } from "@/config/site";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          &copy; {year} {siteConfig.siteName}. All rights reserved.
        </p>
        {siteConfig.contact.email ? (
          <a href={`mailto:${siteConfig.contact.email}`} className="hover:text-brand">
            {siteConfig.contact.email}
          </a>
        ) : (
          <span className="italic text-gray-400">Contact details coming soon</span>
        )}
      </div>
    </footer>
  );
}
