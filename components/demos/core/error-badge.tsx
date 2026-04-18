import { formatNumber } from "@/lib/numerical/format";
import type { MethodError } from "@/lib/numerical/types";

type ErrorBadgeProps = {
  error?: MethodError;
};

export function ErrorBadge({ error }: ErrorBadgeProps) {
  if (!error) {
    return <span className="text-black/45 dark:text-white/45">--</span>;
  }

  return (
    <span className="inline-flex items-center rounded-capsule border border-[#0071e3]/35 bg-[#0071e3]/10 px-2.5 py-0.5 font-text text-[12px] font-semibold tracking-tightCaption text-[#0066cc] dark:text-[#6bb5ff]">
      |e|={formatNumber(error.absolute, 8)}
    </span>
  );
}
