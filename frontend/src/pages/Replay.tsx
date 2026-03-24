import { useSandbox } from '../contexts/SandboxContext';
import { useReplay } from '../contexts/ReplayContext';
import NoSandbox from '../components/NoSandbox';

export default function Replay() {
  const { activeSandbox } = useSandbox();
  const sid = activeSandbox?.sandbox_id;
  const { config, setConfig, isRunning, result, error, startReplay, clearResult } = useReplay();

  if (!activeSandbox) {
    return <NoSandbox title="No sandbox selected" description="Create a sandbox to replay traffic through your service mesh." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Replay</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Send traffic to <span className="text-emerald-400">{activeSandbox.name}</span>'s entry point
        </p>
      </div>

      {/* Config */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h3 className="text-white font-semibold">Traffic Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Request count</label>
            <input
              type="number"
              value={config.count || ''}
              onChange={(e) => setConfig({ ...config, count: e.target.value === '' ? 0 : Number(e.target.value) })}
              onFocus={(e) => e.target.select()}
              min={1}
              max={500}
              disabled={isRunning}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm
                         disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Delay between requests (ms)</label>
            <input
              type="number"
              value={config.delay || ''}
              onChange={(e) => setConfig({ ...config, delay: e.target.value === '' ? 0 : Number(e.target.value) })}
              onFocus={(e) => e.target.select()}
              min={0}
              max={5000}
              disabled={isRunning}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm
                         disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>

        <button
          onClick={() => {
            clearResult();
            startReplay(sid!);
          }}
          disabled={isRunning}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium px-5 py-2.5
                     rounded-lg transition-colors flex items-center gap-2"
        >
          {isRunning ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending {config.count} requests...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Start replay
            </>
          )}
        </button>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Replay Results</h3>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-zinc-800/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white font-mono">{result.total}</div>
              <div className="text-xs text-zinc-500 mt-1">Total</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400 font-mono">{result.success}</div>
              <div className="text-xs text-zinc-500 mt-1">Successful</div>
            </div>
            <div className={`rounded-lg p-4 text-center ${
              result.failed > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-zinc-800/50'
            }`}>
              <div className={`text-2xl font-bold font-mono ${result.failed > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                {result.failed}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Failed</div>
            </div>
          </div>

          {/* Success rate bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Success rate</span>
              <span>{result.total > 0 ? ((result.success / result.total) * 100).toFixed(1) : 0}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${result.total > 0 ? (result.success / result.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          {result.errors && result.errors.length > 0 && (
            <div>
              <h4 className="text-sm text-zinc-400 mb-2">Sample errors</h4>
              <div className="space-y-1">
                {result.errors.map((err: string, i: number) => (
                  <p key={i} className="text-xs text-red-400 bg-red-500/5 rounded px-2 py-1 font-mono">{err}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Running indicator when on page */}
      {isRunning && !result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Sending requests to your sandbox...</p>
          <p className="text-zinc-500 text-xs mt-1">You can navigate to other pages — results will be here when you come back.</p>
        </div>
      )}
    </div>
  );
}
