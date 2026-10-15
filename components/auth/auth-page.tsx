"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { SignInPage, type SignInMode } from "@/components/ui/sign-in";

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


export function AuthPage() {
  const { t } = useLanguage();
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
      setError(t("请输入有效邮箱地址。", "Enter a valid email address."));
      return;
    }
    if (password.length < 8) {
      setError(t("密码至少需要 8 位。", "Password must contain at least 8 characters."));
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError(t("两次输入的密码不一致。", "The passwords do not match."));
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
      setError(submitError instanceof Error ? submitError.message : t("认证失败，请稍后重试。", "Authentication failed. Please retry."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (googleSubmitting || submitting || !isReady) {
      return;
    }
    if (!googleClientId) {
      setError(t("未配置 Google 登录，请设置 NEXT_PUBLIC_GOOGLE_CLIENT_ID。", "Google sign-in is unavailable."));
      return;
    }

    setGoogleSubmitting(true);
    setError("");

    try {
      await loadGoogleIdentityScript();
      const googleApi = window.google?.accounts?.id;
      if (!googleApi) {
        throw new Error(t("Google 登录初始化失败。", "Google sign-in could not initialize."));
      }

      const idToken = await new Promise<string>((resolve, reject) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error(t("Google 登录超时，请重试。", "Google sign-in timed out. Please retry.")));
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
              reject(new Error(t("Google 登录未返回有效令牌。", "Google did not return a valid sign-in token.")));
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
    return <div className="auth-layout"><section><div className="w-full max-w-md"><h1>{t("账号", "Account")}</h1><p className="mt-5 text-muted-foreground">{session.user.displayName || session.user.username}</p><div className="mt-8 flex gap-5"><Link className="text-action" href={redirectTo}>{t("打开笔记", "Open notes")}</Link><button type="button" className="text-action" onClick={logout}>{t("退出登录", "Sign out")}</button></div></div></section></div>;
  }
  return <SignInPage mode={mode} loading={submitting || googleSubmitting || !isReady} errorMessage={error}
    usernameFieldName="email" identifierInputType="email" usernameLabel={t("邮箱", "Email")}
    usernamePlaceholder="name@example.com" displayNameLabel={t("显示名称（可选）", "Display name (optional)")}
    displayNamePlaceholder={t("姓名", "Name")} passwordLabel={t("密码", "Password")}
    passwordPlaceholder={t("至少 8 位", "At least 8 characters")} confirmPasswordLabel={t("确认密码", "Confirm password")}
    confirmPasswordPlaceholder={t("再次输入密码", "Re-enter your password")}
    submitTextLogin={t("登录", "Sign in")} submitTextRegister={t("创建账号", "Create account")}
    showGoogleButton={Boolean(googleClientId)} showRememberMe={false} showResetPasswordLink={false}
    onGoogleSignIn={() => void handleGoogleSignIn()} onSignIn={onSubmit}
    onModeChange={(nextMode) => { setError(""); setMode(nextMode); router.replace(`/auth?mode=${nextMode}&redirect=${encodeURIComponent(redirectTo)}`); }}
    title={mode === "register" ? t("创建账号", "Create account") : t("登录", "Sign in")}
    description={null} />;
}
