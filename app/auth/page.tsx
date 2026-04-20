import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "登录 / 注册",
  description: "Sign in to view and manage your personal notes.",
};

export default function AuthRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="section-light py-16">
          <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
            <article className="rounded-apple bg-white px-6 py-8 shadow-card dark:bg-[#272729] sm:px-8">
              <p className="font-text text-[15px] text-black/72 dark:text-white/75">正在加载登录页面...</p>
            </article>
          </div>
        </div>
      }
    >
      <AuthPage />
    </Suspense>
  );
}
