import type { Metadata } from "next";
import { Suspense } from "react";
import { UiText } from "@/components/ui-text";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Sign in / Register",
  description: "Sign in to view and manage your personal notes.",
};

export default function AuthRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background py-16">
          <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
            <article className="rounded-apple border border-border bg-card px-6 py-8 text-card-foreground shadow-card sm:px-8">
              <p className="font-text text-[15px] text-muted-foreground"><UiText zh="正在加载登录页面…" en="Loading sign-in…" /></p>
            </article>
          </div>
        </div>
      }
    >
      <AuthPage />
    </Suspense>
  );
}

