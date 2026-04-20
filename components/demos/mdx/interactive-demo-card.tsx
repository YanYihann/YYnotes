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
    <article className={cn("rounded-apple bg-card px-5 py-5 text-card-foreground shadow-card", className)}>
      <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        ������ʾ
        <span className="ui-en ml-1">Interactive Demo</span>
      </p>
      <h3 className="mt-2 font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-foreground">
        {titleZh}
        <span className="ui-en mt-1 block font-text text-[14px] leading-[1.43] tracking-tightCaption text-muted-foreground">{titleEn}</span>
      </h3>
      <p className="mt-3 font-text text-[14px] leading-[1.45] tracking-tightCaption text-muted-foreground">
        {descriptionZh}
        <span className="ui-en ml-1">{descriptionEn}</span>
      </p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center rounded-capsule border border-primary/60 px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        ����ʾ
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
