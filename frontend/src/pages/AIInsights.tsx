import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, type RcaAnalysis, type RootCause } from '../lib/api';
import { useSandbox } from '../contexts/SandboxContext';
import NoSandbox from '../components/NoSandbox';

export default function AIInsights() {
  const { activeSandbox } = useSandbox();
  const sid = activeSandbox?.sandbox_id;

  const [service, setService] = useState('');
  const [timeWindow, setTimeWindow] = useState(5);
  const [analysis, setAnalysis] = useState<RcaAnalysis | null>(null);

  // Fetch dynamic service names from sandbox config
  const { data: sandboxConfig } = useQuery({
    queryKey: ['sandbox-config', sid],
    queryFn: () => api.getSandboxConfig(sid!),
    enabled: !!sid,
  });

  const serviceNames = sandboxConfig?.services?.map((s: any) => s.name) || [];

  // Auto-select first service
  if (!service && serviceNames.length > 0) {
    setService(serviceNames[0]);
  }

  const analyzeMutation = useMutation({
    mutationFn: () => api.analyzeFailure(sid!, service, timeWindow),
    onSuccess: (data) => setAnalysis(data),
  });

  if (!activeSandbox) {
    return <NoSandbox title="No sandbox selected" description="Create a sandbox to analyze failure traces with AI-powered root cause analysis." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Insights</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Root cause analysis for <span className="text-emerald-400">{activeSandbox.name}</span>
        </p>
      </div>

      {/* Run analysis */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-1">Run Analysis</h3>
        <p className="text-zinc-500 text-sm mb-4">Analyze recent Jaeger traces to identify failure root causes</p>

        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Service</label>
            <select value={service} onChange={(e) => setService(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              {serviceNames.length > 0 ? (
                serviceNames.map((n: string) => <option key={n} value={n}>{n}</option>)
              ) : (
                <option value="">Loading services...</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Time Window</label>
            <select value={timeWindow} onChange={(e) => setTimeWindow(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
              <option value={2}>Last 2 minutes</option>
              <option value={5}>Last 5 minutes</option>
              <option value={10}>Last 10 minutes</option>
              <option value={30}>Last 30 minutes</option>
            </select>
          </div>
          <button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending || !service}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors flex items-center gap-2">
            {analyzeMutation.isPending ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing...</>
            ) : 'Analyze Traces'}
          </button>
        </div>
        {analyzeMutation.isError && <p className="text-red-400 text-sm mt-3">{(analyzeMutation.error as Error).message}</p>}
      </div>

      {/* Empty state */}
      {!analysis && !analyzeMutation.isPending && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <div className="text-zinc-500 text-sm">No analysis run yet. Select a service and time window, then click Analyze Traces.</div>
        </div>
      )}

      {/* Results */}
      {analysis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-500">Status</div>
              <div className={`text-lg font-bold mt-1 ${analysis.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{analysis.status}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-500">Error rate</div>
              <div className="text-lg font-bold text-white mt-1">{(analysis.error_rate * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-500">Total traces</div>
              <div className="text-lg font-bold text-white mt-1">{analysis.total_traces}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs text-zinc-500">Root causes</div>
              <div className="text-lg font-bold text-amber-400 mt-1">{analysis.root_causes?.length || 0}</div>
            </div>
          </div>

          {analysis.ai_summary && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-2">AI Summary</h3>
              <p className="text-zinc-300 text-sm leading-relaxed">{analysis.ai_summary}</p>
              {analysis._cached && <span className="inline-block mt-2 text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">cached result</span>}
            </div>
          )}

          {analysis.root_causes && analysis.root_causes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-white font-semibold">Root Causes (ranked)</h3>
              {analysis.root_causes.map((rc: RootCause, i: number) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500">#{rc.rank || i + 1}</span>
                      <code className="text-emerald-400 text-sm bg-emerald-500/10 px-2 py-0.5 rounded">{rc.service}</code>
                      <span className="text-white text-sm font-medium">{rc.issue}</span>
                    </div>
                    <span className={`text-sm font-mono font-bold ${rc.confidence >= 0.8 ? 'text-red-400' : rc.confidence >= 0.5 ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {(rc.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm">{rc.evidence}</p>
                </div>
              ))}
            </div>
          )}

          {analysis.recommendations && analysis.recommendations.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3">Recommendations</h3>
              <ul className="space-y-2">
                {analysis.recommendations.map((rec: string, i: number) => (
                  <li key={i} className="text-zinc-300 text-sm flex gap-2"><span className="text-emerald-500 mt-0.5">→</span>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
