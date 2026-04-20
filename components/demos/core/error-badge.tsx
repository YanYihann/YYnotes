import { formatNumber } from "@/lib/numerical/format";
import type { MethodError } from "@/lib/numerical/types";

type ErrorBadgeProps = {
  error?: MethodError;
};

export function ErrorBadge({ error }: ErrorBadgeProps) {
  if (!error) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <span className="inline-flex items-center rounded-capsule border border-primary/35 bg-primary/10 px-2.5 py-0.5 font-text text-[12px] font-semibold tracking-tightCaption text-primary">
      |e|={formatNumber(error.absolute, 8)}
    </span>
  );
}
