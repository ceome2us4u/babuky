import { cn } from "@/lib/utils";

// Brand assets are cropped from the owner-supplied logo concept
// (babuki_logo_concept_1.jpg): the full lockup and the square circuit-"B"
// emblem. Both sit on the brand's deep burgundy, so they render as a dark
// chip on the light UI.

export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/babuki-logo.png"
      alt="Babuki — the complete business engine"
      className={cn("h-11 w-auto rounded-md", className)}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <Logo className={cn("h-9", className)} />;
}

export function BrandBadge({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/babuki-mark.png"
      alt="Babuki"
      className={cn("size-12 rounded-lg", className)}
    />
  );
}
