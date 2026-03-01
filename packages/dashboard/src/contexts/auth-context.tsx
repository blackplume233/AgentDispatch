import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";

const TOKEN_KEY = "dispatch_token";
const BASE = "/api/v1";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authEnabled: boolean | null;
  username: string | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: localStorage.getItem(TOKEN_KEY),
    isAuthenticated: false,
    isLoading: true,
    authEnabled: null,
    username: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const healthRes = await fetch("/health");
        const health = (await healthRes.json()) as { authEnabled?: boolean };

        if (!health.authEnabled) {
          if (!cancelled) {
            setState((s) => ({ ...s, isLoading: false, authEnabled: false, isAuthenticated: true }));
          }
          return;
        }

        const savedToken = localStorage.getItem(TOKEN_KEY);
        if (!savedToken) {
          if (!cancelled) {
            setState((s) => ({ ...s, isLoading: false, authEnabled: true, isAuthenticated: false, token: null }));
          }
          return;
        }

        const meRes = await fetch(`${BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        });

        if (meRes.ok) {
          const me = (await meRes.json()) as { username?: string };
          if (!cancelled) {
            setState({
              token: savedToken,
              isAuthenticated: true,
              isLoading: false,
              authEnabled: true,
              username: me.username ?? null,
            });
          }
        } else {
          localStorage.removeItem(TOKEN_KEY);
          if (!cancelled) {
            setState({ token: null, isAuthenticated: false, isLoading: false, authEnabled: true, username: null });
          }
        }
      } catch {
        if (!cancelled) {
          setState((s) => ({ ...s, isLoading: false }));
        }
      }
    }

    void checkAuth();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: { message: res.statusText } }))) as {
        error?: { message?: string };
      };
      throw new Error(err.error?.message ?? `HTTP ${res.status}`);
    }

    const data = (await res.json()) as { token: string };
    localStorage.setItem(TOKEN_KEY, data.token);
    setState({
      token: data.token,
      isAuthenticated: true,
      isLoading: false,
      authEnabled: true,
      username,
    });
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      await fetch(`${BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setState({ token: null, isAuthenticated: false, isLoading: false, authEnabled: true, username: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
