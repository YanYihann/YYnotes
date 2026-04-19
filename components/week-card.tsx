import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WeekCardProps = {
  href: string;
  weekLabelZh: string;
  weekLabelEn: string;
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  tags?: string[];
  className?: string;
  footerAction?: ReactNode;
  showOpenLink?: boolean;
};

export function WeekCard({
  href,
  weekLabelZh,
  weekLabelEn,
  zhTitle,
  enTitle,
  descriptionZh,
  descriptionEn,
  tags = [],
  className,
  footerAction,
  showOpenLink = true,
}: WeekCardProps) {
  return (
    <article
      className={cn(
        "group flex h-full flex-col justify-between rounded-apple bg-white px-5 py-5 shadow-card transition dark:bg-[#272729]",
        className,
      )}
    >
      <div className="space-y-3">
        <p className="font-text text-[12px] font-semibold tracking-[0.08em] text-black/55 dark:text-white/55">
          {weekLabelZh}
          <span className="ui-en ml-1 uppercase">{weekLabelEn}</span>
        </p>
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-capsule border border-black/15 px-2 py-0.5 font-text text-[11px] tracking-tightCaption text-black/65 dark:border-white/20 dark:text-white/68"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
        <h3 className="font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-[#1d1d1f] dark:text-white">
          {zhTitle}
          <span className="ui-en mt-1 block font-text text-[15px] leading-[1.43] tracking-tightCaption text-black/62 dark:text-white/65">{enTitle}</span>
        </h3>
        <p className="font-text text-[14px] leading-[1.45] tracking-tightCaption text-black/75 dark:text-white/75">
          {descriptionZh}
          <span className="ui-en mt-1 block text-black/62 dark:text-white/66">{descriptionEn}</span>
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {showOpenLink ? (
          <Link
            href={href}
            className="inline-flex items-center rounded-capsule border border-[#0066cc] px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:border-[#2997ff] dark:text-[#2997ff]"
          >
            打开笔记
            <span className="ui-en ml-1">Open Note</span>
            <span className="ml-1">&gt;</span>
          </Link>
        ) : null}
        {footerAction}
      </div>
    </article>
  );
}
