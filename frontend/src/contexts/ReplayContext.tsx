import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { api } from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ReplayConfig {
  count: number;
  delay: number;
}

export interface ReplayResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
  entry_point?: string;
  path?: string;
}

interface ReplayContextValue {
  config: ReplayConfig;
  setConfig: (c: ReplayConfig) => void;
  isRunning: boolean;
  result: ReplayResult | null;
  error: string | null;
  startReplay: (sandboxId: string) => void;
  clearResult: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const ReplayContext = createContext<ReplayContextValue | null>(null);

export function ReplayProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ReplayConfig>({ count: 20, delay: 500 });
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const startReplay = useCallback(
    async (sandboxId: string) => {
      if (runningRef.current) return; // prevent double-starts
      runningRef.current = true;
      setIsRunning(true);
      setResult(null);
      setError(null);

      try {
        const data = await api.startReplay(sandboxId, config.count, config.delay);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Replay failed');
      } finally {
        setIsRunning(false);
        runningRef.current = false;
      }
    },
    [config]
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return (
    <ReplayContext.Provider
      value={{ config, setConfig, isRunning, result, error, startReplay, clearResult }}
    >
      {children}
    </ReplayContext.Provider>
  );
}

export function useReplay(): ReplayContextValue {
  const ctx = useContext(ReplayContext);
  if (!ctx) throw new Error('useReplay must be used within ReplayProvider');
  return ctx;
}
