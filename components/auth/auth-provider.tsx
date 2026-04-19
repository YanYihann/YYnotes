"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthSession, AuthUser } from "@/lib/auth-session";
import { getStoredAuthSession, normalizeAuthSession, setStoredAuthSession } from "@/lib/auth-session";

type AuthCredentials = {
  username: string;
  password: string;
};

type RegisterPayload = AuthCredentials & {
  displayName?: string;
};

type AuthContextValue = {
  session: AuthSession | null;
  isReady: boolean;
  isAuthenticated: boolean;
  login: (payload: AuthCredentials) => Promise<AuthSession>;
  register: (payload: RegisterPayload) => Promise<AuthSession>;
  logout: () => void;
  setSession: (session: AuthSession | null) => void;
};

type AuthApiResponse = {
  success?: boolean;
  user?: unknown;
  token?: unknown;
  error?: string;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";
const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function buildApiUrl(path: string): string {
  if (!CLOUD_API_BASE) {
    throw new Error("未配置 NEXT_PUBLIC_NOTES_API_BASE，无法使用登录服务。");
  }

  return `${normalizeApiBase(CLOUD_API_BASE)}${path}`;
}

function normalizeSessionFromApi(json: AuthApiResponse | null): AuthSession | null {
  return normalizeAuthSession({
    token: json?.token,
    user: json?.user,
  });
}

async function requestAuth(path: string, body: Record<string, unknown>): Promise<AuthSession> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as AuthApiResponse | null;
  const session = normalizeSessionFromApi(json);
  if (!response.ok || !json?.success || !session) {
    throw new Error(json?.error || "认证失败，请稍后重试。");
  }

  return session;
}

async function verifySession(session: AuthSession): Promise<AuthUser | null> {
  const response = await fetch(buildApiUrl("/auth/me"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as AuthApiResponse | null;
  if (!response.ok || !json?.success) {
    return null;
  }

  const normalized = normalizeSessionFromApi({
    token: session.token,
    user: json?.user,
  });

  return normalized?.user ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [isReady, setIsReady] = useState(false);

  const setSession = useCallback((next: AuthSession | null) => {
    setSessionState(next);
    setStoredAuthSession(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const stored = getStoredAuthSession();
      if (!stored || !CLOUD_API_BASE) {
        if (!cancelled) {
          setSessionState(stored);
          setIsReady(true);
        }
        return;
      }

      const user = await verifySession(stored).catch(() => null);
      if (cancelled) {
        return;
      }

      if (!user) {
        setSessionState(null);
        setStoredAuthSession(null);
        setIsReady(true);
        return;
      }

      const refreshed: AuthSession = {
        token: stored.token,
        user,
      };
      setSessionState(refreshed);
      setStoredAuthSession(refreshed);
      setIsReady(true);
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async ({ username, password }: AuthCredentials) => {
    const sessionFromApi = await requestAuth("/auth/login", {
      username,
      password,
    });
    setSession(sessionFromApi);
    return sessionFromApi;
  }, [setSession]);

  const register = useCallback(async ({ username, password, displayName }: RegisterPayload) => {
    const sessionFromApi = await requestAuth("/auth/register", {
      username,
      password,
      displayName,
    });
    setSession(sessionFromApi);
    return sessionFromApi;
  }, [setSession]);

  const logout = useCallback(() => {
    setSession(null);
  }, [setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isReady,
      isAuthenticated: Boolean(session?.token),
      login,
      register,
      logout,
      setSession,
    }),
    [session, isReady, login, register, logout, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
