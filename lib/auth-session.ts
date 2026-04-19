export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

const AUTH_STORAGE_KEY = "yynotes.auth.session.v1";

function normalizeUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = Number((raw as { id?: unknown }).id);
  const username = String((raw as { username?: unknown }).username ?? "").trim();
  const displayName = String((raw as { displayName?: unknown }).displayName ?? "").trim();

  if (!Number.isInteger(id) || id <= 0 || !username) {
    return null;
  }

  return {
    id,
    username,
    displayName,
  };
}

export function normalizeAuthSession(raw: unknown): AuthSession | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const token = String((raw as { token?: unknown }).token ?? "").trim();
  const user = normalizeUser((raw as { user?: unknown }).user);
  if (!token || !user) {
    return null;
  }

  return { token, user };
}

export function getStoredAuthSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeAuthSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function setStoredAuthSession(session: AuthSession | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function authHeaderFromSession(session: AuthSession | null): Record<string, string> {
  if (!session?.token) {
    return {};
  }

  return {
    Authorization: `Bearer ${session.token}`,
  };
}
