"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInPage, type SignInMode, type Testimonial } from "@/components/ui/sign-in";

type GoogleCredentialResponse = {
  credential?: string;
};

type GooglePromptMomentNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          prompt: (listener?: (notification: GooglePromptMomentNotification) => void) => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_ID = "google-identity-services";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let googleIdentityScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google 登录仅支持浏览器环境。"));
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise;
  }

  googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google 登录脚本加载失败。")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google 登录脚本加载失败。"));
    document.head.appendChild(script);
  });

  return googleIdentityScriptPromise;
}

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

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

const authTestimonials: Testimonial[] = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "Sarah Chen",
    handle: "@sarahdigital",
    text: "The bilingual note structure keeps my course review concise and fast.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "Marcus Johnson",
    handle: "@marcustech",
    text: "I can switch between Chinese and English wording without losing key details.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "David Martinez",
    handle: "@davidcreates",
    text: "Cloud sync and folder organization make long-term review much easier.",
  },
];

export function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isReady, login, register, loginWithGoogle, logout } = useAuth();
  const [mode, setMode] = useState<SignInMode>(() => normalizeMode(searchParams.get("mode")));
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState("");

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
  const redirectTo = useMemo(() => normalizeRedirect(searchParams.get("redirect") || "/notes"), [searchParams]);

  useEffect(() => {
    const incomingMode = normalizeMode(searchParams.get("mode"));
    setMode(incomingMode);
  }, [searchParams]);

  useEffect(() => {
    if (!googleClientId) {
      return;
    }
    void loadGoogleIdentityScript().catch(() => null);
  }, [googleClientId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || googleSubmitting || !isReady) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = normalizeEmail(formData.get("email"));
    const displayName = String(formData.get("displayName") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!isValidEmail(email)) {
      setError("请输入有效邮箱地址。");
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
          email,
          displayName,
          password,
        });
      } else {
        await login({
          email,
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

  async function handleGoogleSignIn() {
    if (googleSubmitting || submitting || !isReady) {
      return;
    }
    if (!googleClientId) {
      setError("未配置 Google 登录，请设置 NEXT_PUBLIC_GOOGLE_CLIENT_ID。");
      return;
    }

    setGoogleSubmitting(true);
    setError("");

    try {
      await loadGoogleIdentityScript();
      const googleApi = window.google?.accounts?.id;
      if (!googleApi) {
        throw new Error("Google 登录初始化失败。");
      }

      const idToken = await new Promise<string>((resolve, reject) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("Google 登录超时，请重试。"));
          }
        }, 60000);

        googleApi.initialize({
          client_id: googleClientId,
          callback: (response: GoogleCredentialResponse) => {
            if (settled) {
              return;
            }
            settled = true;
            window.clearTimeout(timeoutId);
            const credential = String(response?.credential ?? "").trim();
            if (!credential) {
              reject(new Error("Google 登录未返回有效令牌。"));
              return;
            }
            resolve(credential);
          },
        });

        googleApi.prompt((notification) => {
          if (settled) {
            return;
          }
          const failed =
            Boolean(notification?.isNotDisplayed?.()) ||
            Boolean(notification?.isSkippedMoment?.()) ||
            Boolean(notification?.isDismissedMoment?.());

          if (failed) {
            settled = true;
            window.clearTimeout(timeoutId);
            reject(new Error("Google 登录已取消，或浏览器阻止了登录弹窗。"));
          }
        });
      });

      await loginWithGoogle(idToken);
      router.push(redirectTo);
      router.refresh();
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : "Google 登录失败，请稍后重试。");
    } finally {
      setGoogleSubmitting(false);
    }
  }

  if (session) {
    return (
      <div className="bg-background py-14">
        <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
          <article className="rounded-apple border border-border bg-card p-6 text-card-foreground shadow-card sm:p-8">
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              YYNotes Account
            </p>
            <h1 className="mt-3 font-display text-[clamp(1.8rem,4.4vw,2.8rem)] font-semibold leading-[1.1] tracking-tightDisplay text-foreground">
              已登录
              <span className="ui-en mt-1 block text-[0.54em] font-normal text-muted-foreground">
                You are signed in
              </span>
            </h1>
            <p className="mt-4 font-text text-[15px] text-muted-foreground">
              当前账号：{session.user.displayName || session.user.username}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={redirectTo}
                className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition focus-visible:outline-none"
              >
                打开我的笔记
                <span className="ui-en ml-1">Open Notes</span>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center rounded-capsule border border-border px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <div className="bg-background">
      <SignInPage
        mode={mode}
        showModeToggle
        loading={submitting || googleSubmitting || !isReady}
        errorMessage={error}
        usernameFieldName="email"
        identifierInputType="email"
        usernameLabel={
          <>
            邮箱
            <span className="ui-en ml-1">Email</span>
          </>
        }
        usernamePlaceholder="例如：name@example.com"
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
        showGoogleButton
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onResetPassword={() => setError("当前版本暂不支持在线重置密码，请联系管理员。")}
        onModeChange={(nextMode) => {
          setError("");
          setMode(nextMode);
          router.replace(`/auth?mode=${nextMode}&redirect=${encodeURIComponent(redirectTo)}`);
        }}
        onSignIn={onSubmit}
        title={
          <span className="font-display text-[clamp(2.8rem,7vw,5.2rem)] font-extrabold leading-[1.02] tracking-[0.01em] text-white drop-shadow-[0_10px_32px_rgba(0,0,0,0.45)]">
            Welcome Back
          </span>
        }
        description={null}
        heroImageSrc="https://images.unsplash.com/photo-1642615835477-d303d7dc9ee9?w=2160&q=80"
        testimonials={authTestimonials}
      />
    </div>
  );
}
