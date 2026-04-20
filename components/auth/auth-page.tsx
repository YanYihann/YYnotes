"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInPage, type SignInMode, type Testimonial } from "@/components/ui/sign-in";

function normalizeRedirect(input: string): string {
  const raw = input.trim();
  if (!raw.startsWith("/")) {
    return "/notes";
  }
  if (raw.startsWith("//")) {
    return "/notes";
  }
  return raw;
}

function normalizeMode(input: string | null): SignInMode {
  return input === "register" ? "register" : "login";
}

const authTestimonials: Testimonial[] = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "Sarah Chen",
    handle: "@sarahdigital",
    text: "The bilingual notes structure keeps my math review concise and fast.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "Marcus Johnson",
    handle: "@marcustech",
    text: "I can switch between Chinese and English wording without losing formulas.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "David Martinez",
    handle: "@davidcreates",
    text: "Cloud sync and note organization make weekly revision much easier.",
  },
];

export function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isReady, login, register, logout } = useAuth();
  const [mode, setMode] = useState<SignInMode>(() => normalizeMode(searchParams.get("mode")));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const redirectTo = useMemo(() => normalizeRedirect(searchParams.get("redirect") || "/notes"), [searchParams]);

  useEffect(() => {
    const incomingMode = normalizeMode(searchParams.get("mode"));
    setMode(incomingMode);
  }, [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !isReady) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!username) {
      setError("请输入用户名。");
      return;
    }
    if (password.length < 8) {
      setError("密码至少需要 8 位。");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      if (mode === "register") {
        await register({
          username,
          displayName,
          password,
        });
      } else {
        await login({
          username,
          password,
        });
      }

      router.push(redirectTo);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "认证失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (session) {
    return (
      <div className="section-light py-14">
        <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
          <article className="rounded-apple bg-white p-6 shadow-card dark:bg-[#272729] sm:p-8">
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/58">
              YYNotes Account
            </p>
            <h1 className="mt-3 font-display text-[clamp(1.8rem,4.4vw,2.8rem)] font-semibold leading-[1.1] tracking-tightDisplay text-[#1d1d1f] dark:text-white">
              已登录
              <span className="ui-en mt-1 block text-[0.54em] font-normal text-black/68 dark:text-white/72">
                You are signed in
              </span>
            </h1>
            <p className="mt-4 font-text text-[15px] text-black/78 dark:text-white/80">
              当前账号：{session.user.displayName || session.user.username}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={redirectTo}
                className="inline-flex items-center rounded-apple bg-[#0071e3] px-5 py-2 font-text text-[15px] text-white transition hover:bg-[#0066cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                打开我的笔记
                <span className="ui-en ml-1">Open Notes</span>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center rounded-capsule border border-black/20 px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-black/75 transition hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/22 dark:text-white/78 dark:hover:bg-white/[0.06]"
              >
                切换账号
                <span className="ui-en ml-1">Switch Account</span>
              </button>
            </div>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="section-light">
      <SignInPage
        mode={mode}
        showModeToggle
        loading={submitting || !isReady}
        errorMessage={error}
        usernameFieldName="username"
        usernameLabel={
          <>
            用户名
            <span className="ui-en ml-1">Username</span>
          </>
        }
        usernamePlaceholder="例如：yynotes_user"
        displayNameLabel={
          <>
            显示名称（可选）
            <span className="ui-en ml-1">Display Name</span>
          </>
        }
        displayNamePlaceholder="例如：Yanyihan"
        passwordLabel={
          <>
            密码
            <span className="ui-en ml-1">Password</span>
          </>
        }
        passwordPlaceholder="至少 8 位"
        confirmPasswordLabel={
          <>
            确认密码
            <span className="ui-en ml-1">Confirm Password</span>
          </>
        }
        confirmPasswordPlaceholder="再次输入密码"
        rememberLabel={
          <>
            保持登录
            <span className="ui-en ml-1">Keep me signed in</span>
          </>
        }
        submitTextLogin={
          <>
            登录
            <span className="ui-en ml-1">Sign In</span>
          </>
        }
        submitTextRegister={
          <>
            注册并登录
            <span className="ui-en ml-1">Create Account</span>
          </>
        }
        showGoogleButton={false}
        onResetPassword={() => setError("当前版本暂不支持在线重置密码，请联系管理员。")}
        onModeChange={(nextMode) => {
          setError("");
          setMode(nextMode);
          router.replace(`/auth?mode=${nextMode}&redirect=${encodeURIComponent(redirectTo)}`);
        }}
        onSignIn={onSubmit}
        title={
          <>
            登录后查看你的专属笔记
            <span className="ui-en mt-2 block text-[0.52em] font-normal text-black/70 dark:text-white/72">
              Sign in to access notes bound to your account
            </span>
          </>
        }
        description={
          <>
            登录状态用于云端 API 身份识别，系统只返回当前账号创建的笔记内容。
            <span className="ui-en ml-1">Your token scopes cloud API results to your own notes.</span>
          </>
        }
        heroImageSrc="https://images.unsplash.com/photo-1642615835477-d303d7dc9ee9?w=2160&q=80"
        testimonials={authTestimonials}
      />
    </div>
  );
}
