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
  compact?: boolean;
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
  compact = false,
}: WeekCardProps) {
  const titleClass = compact
    ? "font-display text-[24px] font-semibold leading-[1.18] tracking-tightDisplay text-foreground"
    : "font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-foreground";
  const enTitleClass = compact
    ? "ui-en mt-1 block font-text text-[14px] leading-[1.42] tracking-tightCaption text-muted-foreground"
    : "ui-en mt-1 block font-text text-[15px] leading-[1.43] tracking-tightCaption text-muted-foreground";
  const descClass = compact
    ? "font-text text-[13px] leading-[1.45] tracking-tightCaption text-muted-foreground"
    : "font-text text-[14px] leading-[1.45] tracking-tightCaption text-muted-foreground";

  return (
    <article
      className={cn(
        compact ? "group flex h-full flex-col justify-between rounded-apple bg-card px-4 py-4 text-card-foreground shadow-card transition" : "group flex h-full flex-col justify-between rounded-apple bg-card px-5 py-5 text-card-foreground shadow-card transition",
        className,
      )}
    >
      <div className={compact ? "space-y-2.5" : "space-y-3"}>
        <p className="font-text text-[12px] font-semibold tracking-[0.08em] text-muted-foreground">
          {weekLabelZh}
          <span className="ui-en ml-1 uppercase">{weekLabelEn}</span>
        </p>
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-capsule border border-border px-2 py-0.5 font-text text-[11px] tracking-tightCaption text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
        <h3 className={titleClass}>
          <span className={compact ? "block overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" : "block"}>
            {zhTitle}
          </span>
          <span
            className={cn(
              enTitleClass,
              compact && "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
            )}
          >
            {enTitle}
          </span>
        </h3>
        <p className={descClass}>
          <span className={compact ? "block overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" : "block"}>
            {descriptionZh}
          </span>
          <span
            className={cn(
              "ui-en mt-1 block text-muted-foreground",
              compact && "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
            )}
          >
            {descriptionEn}
          </span>
        </p>
      </div>

      <div className={compact ? "mt-4 space-y-2" : "mt-6 flex flex-wrap items-center gap-2"}>
        {showOpenLink ? (
          <Link
            href={href}
            className={
              compact
                ? "inline-flex items-center rounded-capsule border border-primary/60 px-3 py-1.5 font-text text-[13px] tracking-tightCaption text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                : "inline-flex items-center rounded-capsule border border-primary/60 px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            }
          >
            �򿪱ʼ�
            <span className="ui-en ml-1">Open Note</span>
            <span className="ml-1">&gt;</span>
          </Link>
        ) : null}
        {footerAction}
      </div>
    </article>
  );
}
