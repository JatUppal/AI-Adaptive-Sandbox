import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
  tenant_id: string;
  tenant_name: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, tenantName?: string) => Promise<void>;
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RCA_URL = import.meta.env.VITE_RCA_URL || 'http://localhost:8000';
const TOKEN_KEY = 'prometheon_token';
const USER_KEY = 'prometheon_user';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);

    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as AuthUser;
        setState({ user, token, isLoading: false, isAuthenticated: true });

        // Validate token is still good
        fetch(`${RCA_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => {
            if (!res.ok) {
              // Token expired — clear session
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem(USER_KEY);
              setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
            }
          })
          .catch(() => {
            // Network error — keep local session, don't log out
          });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
      }
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  // ---- Login ----
  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${RCA_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(body.detail || 'Login failed');
    }

    const data = await res.json();
    const { access_token, user } = data;

    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ user, token: access_token, isLoading: false, isAuthenticated: true });
  }, []);

  // ---- Register ----
  const register = useCallback(
    async (email: string, username: string, password: string, tenantName?: string) => {
      const res = await fetch(`${RCA_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          username,
          password,
          tenant_name: tenantName || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Registration failed' }));
        throw new Error(body.detail || 'Registration failed');
      }

      const data = await res.json();
      const { access_token, user } = data;

      localStorage.setItem(TOKEN_KEY, access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      setState({ user, token: access_token, isLoading: false, isAuthenticated: true });
    },
    []
  );

  // ---- Logout ----
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Helper — get stored token for API calls
// ---------------------------------------------------------------------------
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
