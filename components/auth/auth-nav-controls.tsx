"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, User } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/language-provider";

export function AuthNavControls() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { session, isReady, logout } = useAuth();
  if (!isReady) return <span className="auth-placeholder" aria-label={t("正在检查登录状态", "Checking account")} />;
  if (!session) return <Link href={`/auth?redirect=${encodeURIComponent(pathname || "/")}`} className="header-signin">{t("登录", "Sign in")}</Link>;
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="header-account" type="button" aria-label={t("账号菜单", "Account menu")}><User size={16} /><span>{session.user.displayName || session.user.username}</span><ChevronDown size={13} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="account-menu" sideOffset={8} align="end"><DropdownMenu.Label>{session.user.displayName || session.user.username}</DropdownMenu.Label><DropdownMenu.Item onSelect={logout}><LogOut size={15} />{t("退出登录", "Sign out")}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}
