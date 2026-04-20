"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

export function AuthNavControls() {
  const pathname = usePathname();
  const { session, isReady, logout } = useAuth();

  if (!isReady) {
    return (
      <span className="font-text text-[12px] tracking-[0.02em] text-white/70">
        Loading...
      </span>
    );
  }

  if (!session) {
    return (
      <Link
        href={`/auth?redirect=${encodeURIComponent(pathname || "/")}`}
        className="rounded-capsule border border-white/35 px-3 py-1 font-text text-[12px] tracking-[0.02em] text-white/90 transition hover:border-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        登录
        <span className="ui-en ml-1">Sign In</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-capsule border border-white/24 bg-white/[0.06] px-3 py-1 font-text text-[12px] font-medium tracking-[0.02em] text-white">
        {session.user.displayName || session.user.username}
      </span>
      <button
        type="button"
        onClick={logout}
        className="rounded-capsule border border-white/35 px-3 py-1 font-text text-[12px] tracking-[0.02em] text-white/90 transition hover:border-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        退�?        <span className="ui-en ml-1">Sign Out</span>
      </button>
    </div>
  );
}
