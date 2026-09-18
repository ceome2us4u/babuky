import * as React from "react";

import { cn } from "@/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border border-gold/40 bg-secondary px-3 py-1 text-xs font-semibold uppercase text-burgundy",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
