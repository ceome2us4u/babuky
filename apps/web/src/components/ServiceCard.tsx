import type { ServiceItem } from "@/config/site";

export function ServiceCard({ service }: { service: ServiceItem }) {
  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900">{service.name}</h3>
      <p className="mt-2 text-sm font-medium text-brand">{service.summary}</p>
      <p className="mt-3 text-sm text-gray-600">{service.description}</p>
    </div>
  );
}
