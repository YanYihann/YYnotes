"use client";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";

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
  descriptionEn = "Sign in to view and manage your notes.",
  className = "",
}: LoginRequiredCardProps) {
  const { t } = useLanguage();
  const href = `/auth?redirect=${encodeURIComponent(redirectTo)}`;

  return (
    <article className={`rounded-apple bg-card p-6 text-card-foreground shadow-card ${className}`.trim()}>
      <h2 className="mt-3 font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-foreground">
        {t(titleZh, titleEn)}
      </h2>
      <p className="mt-4 font-text text-[15px] leading-[1.45] text-muted-foreground">
        {t(descriptionZh, descriptionEn)}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={href}
          className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition focus-visible:outline-none"
        >
          {t("登录", "Sign in")}
        </Link>
      </div>
    </article>
  );
}
