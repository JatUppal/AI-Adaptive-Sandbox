import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { api } from "@/lib/api";

export interface ReplayConfig {
  count: number;
  delay: number;
}

export interface ReplayCounts {
  success: number;
  error: number;
  total: number;
}

export interface ReplayResult {
  ok: boolean;
  counts: ReplayCounts;
}

interface ReplayContextValue {
  /** Current config (persists across nav) */
  config: ReplayConfig;
  setConfig: (config: ReplayConfig) => void;

  /** Whether a replay is currently in flight */
  isRunning: boolean;

  /** Result from the last completed replay (null if none) */
  result: ReplayResult | null;

  /** Error message from the last failed replay */
  error: string | null;

  /** Start a new replay with current config */
  startReplay: () => void;
}

const ReplayContext = createContext<ReplayContextValue | null>(null);

export function useReplay() {
  const ctx = useContext(ReplayContext);
  if (!ctx) throw new Error("useReplay must be used within <ReplayProvider>");
  return ctx;
}

export function ReplayProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ReplayConfig>({ count: 50, delay: 200 });
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guard against double-starts
  const runningRef = useRef(false);

  const startReplay = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    setResult(null);
    setError(null);

    try {
      const data = (await api.startReplay(config.count, config.delay)) as ReplayResult;
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Replay failed");
    } finally {
      setIsRunning(false);
      runningRef.current = false;
    }
  }, [config]);

  return (
    <ReplayContext.Provider
      value={{ config, setConfig, isRunning, result, error, startReplay }}
    >
      {children}
    </ReplayContext.Provider>
  );
}
