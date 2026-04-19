import Link from "next/link";

type LoginRequiredCardProps = {
  redirectTo: string;
  titleZh?: string;
  titleEn?: string;
  descriptionZh?: string;
  descriptionEn?: string;
  className?: string;
};

export function LoginRequiredCard({
  redirectTo,
  titleZh = "请先登录",
  titleEn = "Sign In Required",
  descriptionZh = "登录后可查看并管理属于你自己的笔记。",
  descriptionEn = "Sign in to view and manage only your own notes.",
  className = "",
}: LoginRequiredCardProps) {
  const href = `/auth?redirect=${encodeURIComponent(redirectTo)}`;

  return (
    <article className={`rounded-apple bg-white p-6 shadow-card dark:bg-[#272729] ${className}`.trim()}>
      <p className="font-text text-[12px] font-semibold uppercase tracking-[0.1em] text-black/55 dark:text-white/55">
        Account
      </p>
      <h2 className="mt-3 font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-[#1d1d1f] dark:text-white">
        {titleZh}
        <span className="ui-en mt-1 block text-[0.6em] font-normal text-black/70 dark:text-white/75">{titleEn}</span>
      </h2>
      <p className="mt-4 font-text text-[15px] leading-[1.45] text-black/78 dark:text-white/80">
        {descriptionZh}
        <span className="ui-en ml-1">{descriptionEn}</span>
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={href}
          className="inline-flex items-center rounded-apple bg-[#0071e3] px-5 py-2 font-text text-[15px] text-white transition hover:bg-[#0066cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          登录 / 注册
          <span className="ui-en ml-1">Sign In</span>
        </Link>
      </div>
    </article>
  );
}
