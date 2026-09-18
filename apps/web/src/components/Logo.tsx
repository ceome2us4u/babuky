import { cn } from "@/lib/utils";

// Official brand assets, from the Lovable mock's project (emblem + wordmark),
// downsized for web in public/brand/. Same structure as the mock's Logo.tsx.
const EMBLEM = "/brand/babuki-emblem.png";
const WORDMARK = "/brand/babuki-wordmark.png";

export function BrandBadge({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={EMBLEM} alt="Babuki emblem" className={cn("size-10 rounded-[22%] object-contain", className)} />
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className="flex items-center gap-3">
      <BrandBadge className="size-9 shrink-0" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={WORDMARK}
        alt="Babuki — The Complete Business Engine"
        className={cn("h-10 w-auto object-contain", className)}
      />
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={WORDMARK}
      alt="Babuki — The Complete Business Engine"
      className={cn("h-14 w-auto object-contain", className)}
    />
  );
}
