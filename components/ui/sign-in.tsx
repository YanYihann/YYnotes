"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"
    />
  </svg>
);

export interface Testimonial {
  avatarSrc: string;
  name: string;
  handle: string;
  text: string;
}

export type SignInMode = "login" | "register";

interface SignInPageProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  mode?: SignInMode;
  showModeToggle?: boolean;
  loading?: boolean;
  errorMessage?: React.ReactNode;
  usernameFieldName?: string;
  identifierInputType?: "text" | "email";
  usernameLabel?: React.ReactNode;
  usernamePlaceholder?: string;
  displayNameLabel?: React.ReactNode;
  displayNamePlaceholder?: string;
  passwordLabel?: React.ReactNode;
  passwordPlaceholder?: string;
  confirmPasswordLabel?: React.ReactNode;
  confirmPasswordPlaceholder?: string;
  rememberLabel?: React.ReactNode;
  submitTextLogin?: React.ReactNode;
  submitTextRegister?: React.ReactNode;
  showDisplayNameField?: boolean;
  showConfirmPasswordField?: boolean;
  showRememberMe?: boolean;
  showGoogleButton?: boolean;
  showResetPasswordLink?: boolean;
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onResetPassword?: () => void;
  onModeChange?: (mode: SignInMode) => void;
}

const FieldWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-input bg-card transition-colors focus-within:border-ring">
    {children}
  </div>
);

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light tracking-tighter text-foreground">Welcome</span>,
  description = "Access your notes and folders.",
  mode = "login",
  showModeToggle = false,
  loading = false,
  errorMessage,
  usernameFieldName = "email",
  identifierInputType = "email",
  usernameLabel = "Email Address",
  usernamePlaceholder = "Enter your email address",
  displayNameLabel = "Display Name (optional)",
  displayNamePlaceholder = "Enter your display name",
  passwordLabel = "Password",
  passwordPlaceholder = "Enter your password",
  confirmPasswordLabel = "Confirm Password",
  confirmPasswordPlaceholder = "Re-enter your password",
  rememberLabel = "Keep me signed in",
  submitTextLogin = "Sign In",
  submitTextRegister = "Create Account",
  showDisplayNameField = mode === "register",
  showConfirmPasswordField = mode === "register",
  showRememberMe = true,
  showGoogleButton = true,
  showResetPasswordLink = true,
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onModeChange,
}) => {
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);

  const helperText = useMemo(() => {
    return mode === "register"
      ? {
          lead: t("已有账号？", "Already have an account?"),
          action: t("登录", "Sign in"),
          nextMode: "login" as SignInMode,
        }
      : {
          lead: t("没有账号？", "Need an account?"),
          action: t("注册", "Create account"),
          nextMode: "register" as SignInMode,
        };
  }, [mode, t]);

  return (
    <div className="auth-layout">
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-4xl font-semibold leading-tight text-foreground md:text-5xl">
              {title}
            </h1>
            {description ? (
              <p className="font-text text-muted-foreground">{description}</p>
            ) : null}

            {showModeToggle ? (
              <div className="inline-flex w-fit rounded-capsule border border-border bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() => onModeChange?.("login")}
                  className={cn(
                    "rounded-capsule px-4 py-1.5 font-text text-[13px] tracking-tightCaption transition",
                    mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("登录", "Sign in")}
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange?.("register")}
                  className={cn(
                    "rounded-capsule px-4 py-1.5 font-text text-[13px] tracking-tightCaption transition",
                    mode === "register" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("注册", "Register")}
                </button>
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={onSignIn}>
              <div className="">
                <label htmlFor="auth-identifier" className="text-sm font-medium text-muted-foreground">{usernameLabel}</label>
                <FieldWrapper>
                  <input
                    id="auth-identifier"
                    required
                    disabled={loading}
                    name={usernameFieldName}
                    type={identifierInputType}
                    placeholder={usernamePlaceholder}
                    autoComplete={identifierInputType === "email" ? "email" : "username"}
                    className="w-full rounded-2xl bg-transparent p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </FieldWrapper>
              </div>

              {showDisplayNameField ? (
                <div className="">
                  <label htmlFor="auth-display-name" className="text-sm font-medium text-muted-foreground">{displayNameLabel}</label>
                  <FieldWrapper>
                    <input
                      id="auth-display-name"
                      disabled={loading}
                      name="displayName"
                      type="text"
                      placeholder={displayNamePlaceholder}
                      autoComplete="nickname"
                      className="w-full rounded-2xl bg-transparent p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </FieldWrapper>
                </div>
              ) : null}

              <div className="">
                <label htmlFor="auth-password" className="text-sm font-medium text-muted-foreground">{passwordLabel}</label>
                <FieldWrapper>
                  <div className="relative">
                    <input
                      id="auth-password"
                      required
                      minLength={8}
                      maxLength={72}
                      disabled={loading}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={passwordPlaceholder}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className="w-full rounded-2xl bg-transparent p-4 pr-12 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? t("隐藏密码", "Hide password") : t("显示密码", "Show password")}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" />
                      ) : (
                        <Eye className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" />
                      )}
                    </button>
                  </div>
                </FieldWrapper>
              </div>

              {showConfirmPasswordField ? (
                <div className="">
                  <label htmlFor="auth-confirm-password" className="text-sm font-medium text-muted-foreground">{confirmPasswordLabel}</label>
                  <FieldWrapper>
                    <input
                      id="auth-confirm-password"
                      required
                      minLength={8}
                      maxLength={72}
                      disabled={loading}
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder={confirmPasswordPlaceholder}
                      autoComplete="new-password"
                      className="w-full rounded-2xl bg-transparent p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </FieldWrapper>
                </div>
              ) : null}

              {errorMessage ? (
                <p className="rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex items-center justify-between text-sm">
                {showRememberMe ? (
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" name="rememberMe" className="custom-checkbox" />
                    <span className="text-muted-foreground">{rememberLabel}</span>
                  </label>
                ) : (
                  <span />
                )}
                {showResetPasswordLink ? (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onResetPassword?.();
                    }}
                    className="text-primary transition-colors hover:underline"
                  >
                    Reset password
                  </a>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-apple-primary w-full rounded-2xl py-4 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? t("处理中…", "Processing…") : mode === "register" ? submitTextRegister : submitTextLogin}
              </button>
            </form>

            {showGoogleButton && onGoogleSignIn ? (
              <>
                <div className="relative flex items-center justify-center">
                  <span className="w-full border-t border-border" />
                  <span className="absolute bg-background px-4 text-sm text-muted-foreground">
                    {t("或", "or")}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-border py-4 transition-colors hover:bg-accent"
                >
                  <GoogleIcon />
                  {t("使用 Google 登录", "Continue with Google")}
                </button>
              </>
            ) : null}

            {onModeChange ? (
              <p className="text-center text-sm text-muted-foreground">
                {helperText.lead}{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onModeChange(helperText.nextMode);
                  }}
                  className="text-primary transition-colors hover:underline"
                >
                  {helperText.action}
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};
