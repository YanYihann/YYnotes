"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShadowOverlayBackground } from "@/components/ui/shadow-overlay-background";

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

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-black/15 bg-white/80 backdrop-blur-sm transition-colors focus-within:border-[#0071e3] dark:border-white/20 dark:bg-[#1b1b1d]">
    {children}
  </div>
);

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light tracking-tighter text-[#1d1d1f] dark:text-white">Welcome</span>,
  description = "Access your account and continue your journey with us.",
  heroImageSrc,
  testimonials = [],
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
  const [showPassword, setShowPassword] = useState(false);

  const helperText = useMemo(() => {
    return mode === "register"
      ? {
          lead: "Already have an account?",
          action: "Sign in",
          nextMode: "login" as SignInMode,
        }
      : {
          lead: "New to our platform?",
          action: "Create account",
          nextMode: "register" as SignInMode,
        };
  }, [mode]);

  return (
    <div className="flex min-h-[calc(100vh-3rem)] w-full flex-col md:flex-row">
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <h1 className="animate-element animate-delay-100 font-display text-4xl font-semibold leading-tight text-[#1d1d1f] dark:text-white md:text-5xl">
              {title}
            </h1>
            <p className="animate-element animate-delay-200 font-text text-black/70 dark:text-white/75">{description}</p>

            {showModeToggle ? (
              <div className="animate-element animate-delay-300 inline-flex w-fit rounded-capsule border border-black/15 bg-black/[0.03] p-1 dark:border-white/20 dark:bg-white/[0.06]">
                <button
                  type="button"
                  onClick={() => onModeChange?.("login")}
                  className={cn(
                    "rounded-capsule px-4 py-1.5 font-text text-[13px] tracking-tightCaption transition",
                    mode === "login"
                      ? "bg-[#0071e3] text-white"
                      : "text-black/70 hover:text-black dark:text-white/72 dark:hover:text-white",
                  )}
                >
                  登录
                  <span className="ui-en ml-1">Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange?.("register")}
                  className={cn(
                    "rounded-capsule px-4 py-1.5 font-text text-[13px] tracking-tightCaption transition",
                    mode === "register"
                      ? "bg-[#0071e3] text-white"
                      : "text-black/70 hover:text-black dark:text-white/72 dark:hover:text-white",
                  )}
                >
                  注册
                  <span className="ui-en ml-1">Register</span>
                </button>
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={onSignIn}>
              <div className="animate-element animate-delay-400">
                <label className="text-sm font-medium text-black/65 dark:text-white/70">{usernameLabel}</label>
                <GlassInputWrapper>
                  <input
                    name={usernameFieldName}
                    type={identifierInputType}
                    placeholder={usernamePlaceholder}
                    autoComplete={identifierInputType === "email" ? "email" : "username"}
                    className="w-full rounded-2xl bg-transparent p-4 text-sm text-[#1d1d1f] outline-none placeholder:text-black/45 dark:text-white dark:placeholder:text-white/40"
                  />
                </GlassInputWrapper>
              </div>

              {showDisplayNameField ? (
                <div className="animate-element animate-delay-500">
                  <label className="text-sm font-medium text-black/65 dark:text-white/70">{displayNameLabel}</label>
                  <GlassInputWrapper>
                    <input
                      name="displayName"
                      type="text"
                      placeholder={displayNamePlaceholder}
                      autoComplete="nickname"
                      className="w-full rounded-2xl bg-transparent p-4 text-sm text-[#1d1d1f] outline-none placeholder:text-black/45 dark:text-white dark:placeholder:text-white/40"
                    />
                  </GlassInputWrapper>
                </div>
              ) : null}

              <div className="animate-element animate-delay-600">
                <label className="text-sm font-medium text-black/65 dark:text-white/70">{passwordLabel}</label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={passwordPlaceholder}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className="w-full rounded-2xl bg-transparent p-4 pr-12 text-sm text-[#1d1d1f] outline-none placeholder:text-black/45 dark:text-white dark:placeholder:text-white/40"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-black/45 transition-colors hover:text-black/75 dark:text-white/45 dark:hover:text-white/78" />
                      ) : (
                        <Eye className="h-5 w-5 text-black/45 transition-colors hover:text-black/75 dark:text-white/45 dark:hover:text-white/78" />
                      )}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              {showConfirmPasswordField ? (
                <div className="animate-element animate-delay-700">
                  <label className="text-sm font-medium text-black/65 dark:text-white/70">{confirmPasswordLabel}</label>
                  <GlassInputWrapper>
                    <input
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder={confirmPasswordPlaceholder}
                      autoComplete="new-password"
                      className="w-full rounded-2xl bg-transparent p-4 text-sm text-[#1d1d1f] outline-none placeholder:text-black/45 dark:text-white dark:placeholder:text-white/40"
                    />
                  </GlassInputWrapper>
                </div>
              ) : null}

              {errorMessage ? (
                <p className="rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
                  {errorMessage}
                </p>
              ) : null}

              <div className="animate-element animate-delay-800 flex items-center justify-between text-sm">
                {showRememberMe ? (
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" name="rememberMe" className="custom-checkbox" />
                    <span className="text-black/78 dark:text-white/85">{rememberLabel}</span>
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
                    className="text-[#9c7af2] transition-colors hover:underline"
                  >
                    Reset password
                  </a>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="animate-element animate-delay-900 w-full rounded-2xl bg-[#0071e3] py-4 font-medium text-white transition-colors hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "处理中..." : mode === "register" ? submitTextRegister : submitTextLogin}
              </button>
            </form>

            {showGoogleButton && onGoogleSignIn ? (
              <>
                <div className="animate-element animate-delay-1000 relative flex items-center justify-center">
                  <span className="w-full border-t border-black/12 dark:border-white/15" />
                  <span className="absolute bg-[#f5f5f7] px-4 text-sm text-black/52 dark:bg-[#161617] dark:text-white/60">
                    Or continue with
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  className="animate-element animate-delay-1200 flex w-full items-center justify-center gap-3 rounded-2xl border border-black/15 py-4 transition-colors hover:bg-black/[0.03] dark:border-white/18 dark:hover:bg-white/[0.06]"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
              </>
            ) : null}

            {onModeChange ? (
              <p className="animate-element animate-delay-1400 text-center text-sm text-black/58 dark:text-white/62">
                {helperText.lead}{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onModeChange(helperText.nextMode);
                  }}
                  className="text-[#9c7af2] transition-colors hover:underline"
                >
                  {helperText.action}
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {heroImageSrc || testimonials.length > 0 ? (
        <section className="relative hidden flex-1 p-4 md:block">
          <ShadowOverlayBackground
            className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl"
            color="rgba(128, 128, 128, 1)"
            animation={{ scale: 70, speed: 50 }}
            noise={{ opacity: 0.18, scale: 1 }}
          />
        </section>
      ) : null}
    </div>
  );
};
