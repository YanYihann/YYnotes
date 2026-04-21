import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-4 sm:px-6">
        <p className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
          YYNotes 笔记站
          <span className="ui-en ml-2 text-[19px] font-normal text-muted-foreground">YYNotes Note Archive</span>
        </p>
        <p className="max-w-[760px] font-text text-[14px] leading-[1.45] tracking-tightCaption text-muted-foreground">
          用于集中整理与长期维护多学科笔记内容。
          <span className="ui-en ml-1">
            Built to archive and maintain notes across multiple subjects.
          </span>
        </p>
        <div className="mt-2 flex items-center gap-4 text-[14px] text-muted-foreground">
          <Link href="/notes" className="text-primary underline-offset-4 hover:underline">
            浏览全部笔记
            <span className="ui-en ml-1">Browse All Notes</span>
          </Link>
          <span aria-hidden>?</span>
          <span>{year}</span>
        </div>
      </div>
    </footer>
  );
}
