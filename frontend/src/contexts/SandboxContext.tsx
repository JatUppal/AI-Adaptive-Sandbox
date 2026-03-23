import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SandboxInfo {
  sandbox_id: string;
  namespace: string;
  tenant_id: string;
  name: string;
  status: string;
  pods: string;
  created_at: string | null;
}

interface SandboxContextValue {
  activeSandbox: SandboxInfo | null;
  sandboxes: SandboxInfo[];
  isLoading: boolean;
  setActiveSandbox: (sandbox: SandboxInfo) => void;
  clearActiveSandbox: () => void;
  refreshSandboxes: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SANDBOX_URL = import.meta.env.VITE_SANDBOX_URL || 'http://localhost:9000';
const ACTIVE_SANDBOX_KEY = 'prometheon_active_sandbox';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const SandboxContext = createContext<SandboxContextValue | null>(null);

export function SandboxProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [activeSandbox, setActiveSandboxState] = useState<SandboxInfo | null>(null);
  const [sandboxes, setSandboxes] = useState<SandboxInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch sandboxes for the current tenant
  const refreshSandboxes = useCallback(async () => {
    if (!user?.tenant_id) {
      setSandboxes([]);
      setIsLoading(false);
      return;
    }

    try {
      const resp = await fetch(
        `${SANDBOX_URL}/sandboxes?tenant_id=${user.tenant_id}`
      );
      if (resp.ok) {
        const data = await resp.json();
        setSandboxes(data);

        // If active sandbox was deleted, clear it
        if (activeSandbox && !data.find((s: SandboxInfo) => s.sandbox_id === activeSandbox.sandbox_id)) {
          setActiveSandboxState(null);
          localStorage.removeItem(ACTIVE_SANDBOX_KEY);
        }

        // If no active sandbox but sandboxes exist, auto-select first
        if (!activeSandbox && data.length > 0) {
          const stored = localStorage.getItem(ACTIVE_SANDBOX_KEY);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              const found = data.find((s: SandboxInfo) => s.sandbox_id === parsed.sandbox_id);
              if (found) {
                setActiveSandboxState(found);
              } else {
                setActiveSandboxState(data[0]);
                localStorage.setItem(ACTIVE_SANDBOX_KEY, JSON.stringify(data[0]));
              }
            } catch {
              setActiveSandboxState(data[0]);
              localStorage.setItem(ACTIVE_SANDBOX_KEY, JSON.stringify(data[0]));
            }
          } else {
            setActiveSandboxState(data[0]);
            localStorage.setItem(ACTIVE_SANDBOX_KEY, JSON.stringify(data[0]));
          }
        }
      }
    } catch {
      // Network error — keep existing state
    } finally {
      setIsLoading(false);
    }
  }, [user?.tenant_id, activeSandbox]);

  // Load on auth change
  useEffect(() => {
    if (isAuthenticated) {
      refreshSandboxes();
    } else {
      setSandboxes([]);
      setActiveSandboxState(null);
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Poll for sandbox status updates
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(refreshSandboxes, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshSandboxes]);

  const setActiveSandbox = useCallback((sandbox: SandboxInfo) => {
    setActiveSandboxState(sandbox);
    localStorage.setItem(ACTIVE_SANDBOX_KEY, JSON.stringify(sandbox));
  }, []);

  const clearActiveSandbox = useCallback(() => {
    setActiveSandboxState(null);
    localStorage.removeItem(ACTIVE_SANDBOX_KEY);
  }, []);

  return (
    <SandboxContext.Provider
      value={{
        activeSandbox,
        sandboxes,
        isLoading,
        setActiveSandbox,
        clearActiveSandbox,
        refreshSandboxes,
      }}
    >
      {children}
    </SandboxContext.Provider>
  );
}

export function useSandbox(): SandboxContextValue {
  const ctx = useContext(SandboxContext);
  if (!ctx) throw new Error('useSandbox must be used within SandboxProvider');
  return ctx;
}
