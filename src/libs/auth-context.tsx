import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { AuthUser } from "~/libs/auth.server";

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  signout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const t = localStorage.getItem("routesage_token");
    if (!t) {
      setLoading(false);
      return;
    }
    try {
      const { getUserFromToken } = await import("~/libs/auth.server");
      const u = await getUserFromToken(t);
      if (u) {
        setUser(u);
        setToken(t);
      } else {
        localStorage.removeItem("routesage_token");
      }
    } catch {
      // Offline or error
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const signout = async () => {
    try {
      const { logout } = await import("~/libs/auth.server");
      if (token) await logout(token);
    } catch {}
    localStorage.removeItem("routesage_token");
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Hook to check if user is authenticated, redirect if not
export function useRequireAuth() {
  const auth = useAuth();
  return auth;
}