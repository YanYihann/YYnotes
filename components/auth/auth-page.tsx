"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

type AuthMode = "login" | "register";

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

export function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isReady, login, register, logout } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const redirectTo = useMemo(() => normalizeRedirect(searchParams.get("redirect") || "/notes"), [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername) {
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
          username: trimmedUsername,
          displayName: displayName.trim(),
          password,
        });
      } else {
        await login({
          username: trimmedUsername,
          password,
        });
      }

      router.push(redirectTo);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="section-dark">
        <div className="mx-auto flex min-h-[44vh] w-full max-w-[1100px] flex-col justify-center px-4 py-16 text-center sm:px-6">
          <p className="mx-auto mb-4 rounded-capsule border border-white/30 px-4 py-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/75">
            YYNotes Account
          </p>
          <h1 className="mx-auto max-w-[900px] font-display text-[clamp(2rem,6.4vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-white">
            登录后查看属于你的笔记
            <span className="ui-en mt-2 block text-[0.52em] font-normal text-white/82">Sign in to access your personal notes only</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[760px] font-text text-[17px] leading-[1.47] tracking-tightBody text-white/82">
            登录状态将用于云端 API 身份识别，系统只返回当前账号创建的笔记。
            <span className="ui-en ml-1">Your account token is used to scope API results to your own notes.</span>
          </p>
        </div>
      </section>

      <section className="section-light py-14">
        <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
          <article className="rounded-apple bg-white p-6 shadow-card dark:bg-[#272729] sm:p-8">
            {session ? (
              <div className="space-y-4">
                <h2 className="font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-[#1d1d1f] dark:text-white">
                  已登录
                  <span className="ui-en mt-1 block text-[0.56em] font-normal text-black/70 dark:text-white/75">You are signed in</span>
                </h2>
                <p className="font-text text-[15px] leading-[1.45] text-black/78 dark:text-white/80">
                  当前账号：{session.user.displayName || session.user.username}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={redirectTo}
                    className="inline-flex items-center rounded-apple bg-[#0071e3] px-5 py-2 font-text text-[15px] text-white transition hover:bg-[#0066cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  >
                    进入我的笔记
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
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="inline-flex rounded-capsule border border-black/15 bg-black/[0.03] p-1 dark:border-white/20 dark:bg-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`rounded-capsule px-4 py-1.5 font-text text-[13px] tracking-tightCaption transition ${
                      mode === "login"
                        ? "bg-[#0071e3] text-white"
                        : "text-black/70 hover:text-black dark:text-white/72 dark:hover:text-white"
                    }`}
                  >
                    登录
                    <span className="ui-en ml-1">Login</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className={`rounded-capsule px-4 py-1.5 font-text text-[13px] tracking-tightCaption transition ${
                      mode === "register"
                        ? "bg-[#0071e3] text-white"
                        : "text-black/70 hover:text-black dark:text-white/72 dark:hover:text-white"
                    }`}
                  >
                    注册
                    <span className="ui-en ml-1">Register</span>
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
                      用户名
                      <span className="ui-en ml-1">Username</span>
                    </span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      placeholder="例如：yynotes_user"
                      className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[15px] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
                    />
                  </label>

                  {mode === "register" ? (
                    <label className="space-y-1 sm:col-span-2">
                      <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
                        显示名称（可选）
                        <span className="ui-en ml-1">Display Name</span>
                      </span>
                      <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        autoComplete="nickname"
                        placeholder="例如：Yanyihan"
                        className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[15px] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
                      />
                    </label>
                  ) : null}

                  <label className="space-y-1">
                    <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
                      密码
                      <span className="ui-en ml-1">Password</span>
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      placeholder="至少 8 位"
                      className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[15px] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
                    />
                  </label>

                  {mode === "register" ? (
                    <label className="space-y-1">
                      <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
                        确认密码
                        <span className="ui-en ml-1">Confirm</span>
                      </span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        placeholder="再次输入密码"
                        className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[15px] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
                      />
                    </label>
                  ) : null}
                </div>

                {error ? (
                  <p className="rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !isReady}
                    className="inline-flex items-center rounded-apple bg-[#0071e3] px-5 py-2 font-text text-[15px] text-white transition hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  >
                    {submitting ? "处理中..." : mode === "register" ? "注册并登录" : "登录"}
                  </button>
                  <Link
                    href="/"
                    className="inline-flex items-center rounded-capsule border border-[#0066cc] px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]"
                  >
                    返回首页
                    <span className="ui-en ml-1">Home</span>
                  </Link>
                </div>
              </form>
            )}
          </article>
        </div>
      </section>
    </>
  );
}
