import Link from "next/link";
import { cn } from "@/lib/utils";

type InteractiveDemoCardProps = {
  href: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  className?: string;
};

export function InteractiveDemoCard({
  href,
  titleZh,
  titleEn,
  descriptionZh,
  descriptionEn,
  className,
}: InteractiveDemoCardProps) {
  return (
    <article className={cn("rounded-apple bg-white px-5 py-5 shadow-card dark:bg-[#272729]", className)}>
      <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/58">
        交互演示
        <span className="ui-en ml-1">Interactive Demo</span>
      </p>
      <h3 className="mt-2 font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-[#1d1d1f] dark:text-white">
        {titleZh}
        <span className="ui-en mt-1 block font-text text-[14px] leading-[1.43] tracking-tightCaption text-black/65 dark:text-white/68">{titleEn}</span>
      </h3>
      <p className="mt-3 font-text text-[14px] leading-[1.45] tracking-tightCaption text-black/75 dark:text-white/78">
        {descriptionZh}
        <span className="ui-en ml-1">{descriptionEn}</span>
      </p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center rounded-capsule border border-[#0066cc] px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 dark:border-[#2997ff] dark:text-[#2997ff]"
      >
        打开演示
        <span className="ui-en ml-1">Open Demo</span>
        <span className="ml-1">&gt;</span>
      </Link>
    </article>
  );
}

export function TryThisDemoBlock(props: InteractiveDemoCardProps) {
  return (
    <div className="my-8">
      <InteractiveDemoCard {...props} />
    </div>
  );
}
