import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "./supabase";
import type { Profile } from "../types";

interface Session {
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
  access_token: string;
  refresh_token: string;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  token: string | null;
  apiKey: string | null;
  loading: boolean;
  getValidToken: () => Promise<string | null>;
  setApiKey: (key: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function loadStored<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadStored("cuota_session"));
  const [profile, setProfile] = useState<Profile | null>(() => loadStored("cuota_profile"));
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("cuota_access_token"));
  const [apiKey, setApiKeyState] = useState<string | null>(() => localStorage.getItem("cuota_api_key"));
  const [loading] = useState(false);

  // Persist session changes
  useEffect(() => {
    if (session) {
      localStorage.setItem("cuota_session", JSON.stringify(session));
      localStorage.setItem("cuota_access_token", session.access_token);
      setToken(session.access_token);
      // Sync API key from user metadata
      const meta = session.user?.user_metadata;
      if (meta?.api_key && typeof meta.api_key === "string") {
        localStorage.setItem("cuota_api_key", meta.api_key);
        setApiKeyState(meta.api_key);
      }
    } else {
      localStorage.removeItem("cuota_session");
      localStorage.removeItem("cuota_access_token");
    }
  }, [session]);

  const refreshSessionToken = useCallback(async (): Promise<string | null> => {
    const stored = loadStored<Session>("cuota_session");
    if (!stored?.refresh_token) return null;
    try {
      const data = await supabase.refreshToken(stored.refresh_token);
      if (data.access_token && data.user) {
        const newSession: Session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token || stored.refresh_token,
          user: data.user,
        };
        setSession(newSession);
        return data.access_token;
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    const stored = loadStored<Session>("cuota_session");
    if (!stored?.access_token) return null;
    // Check expiry with a 2-min buffer
    try {
      const payload = JSON.parse(atob(stored.access_token.split(".")[1]));
      const expiresAt: number = payload.exp * 1000;
      if (Date.now() < expiresAt - 120_000) return stored.access_token;
    } catch { /* malformed */ }
    return refreshSessionToken();
  }, [refreshSessionToken]);

  // Auto-refresh every 50 min
  useEffect(() => {
    const id = setInterval(refreshSessionToken, 50 * 60 * 1000);
    return () => clearInterval(id);
  }, [refreshSessionToken]);

  const setApiKey = useCallback((key: string) => {
    localStorage.setItem("cuota_api_key", key);
    setApiKeyState(key);
  }, []);

  const signOut = useCallback(() => {
    ["cuota_session", "cuota_access_token", "cuota_profile"].forEach(k =>
      localStorage.removeItem(k)
    );
    setSession(null);
    setProfile(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, profile, token, apiKey, loading, getValidToken, setApiKey, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Separate setter exported for use inside AuthProvider children that need to login
export function useAuthSetter() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthSetter must be inside AuthProvider");
  return ctx;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

// Hook used by login page to write session
export function useSessionWriter() {
  const [, setSession] = useState<Session | null>(null);
  const [, setProfile] = useState<Profile | null>(null);

  return {
    writeSession: (s: Session) => {
      localStorage.setItem("cuota_session", JSON.stringify(s));
      localStorage.setItem("cuota_access_token", s.access_token);
      setSession(s);
    },
    writeProfile: (p: Profile) => {
      localStorage.setItem("cuota_profile", JSON.stringify(p));
      setProfile(p);
    },
  };
}
