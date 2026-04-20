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
        <div className="bg-black py-16 dark">
          <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
            <article className="rounded-apple border border-white/10 bg-[#151516] px-6 py-8 shadow-card sm:px-8">
              <p className="font-text text-[15px] text-white/80">正在加载登录页面...</p>
            </article>
          </div>
        </div>
      }
    >
      <AuthPage />
    </Suspense>
  );
}

