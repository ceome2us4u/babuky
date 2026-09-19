import { cn } from "@/lib/utils";

/** Inline validation message under a field. Renders nothing when there is none. */
export function FieldError({ message, className }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("text-xs font-medium text-destructive", className)}>
      {message}
    </p>
  );
}
