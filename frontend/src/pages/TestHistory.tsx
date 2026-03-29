import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type TestResultSummary, type RcaAnalysis } from '../lib/api';

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status === 'success';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isSuccess
          ? 'bg-sky-500/15 text-sky-400'
          : 'bg-red-500/15 text-red-400'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-sky-400' : 'bg-red-400'}`} />
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TestHistory() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    data: results,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['test-results'],
    queryFn: () => api.listTestResults(50),
    refetchInterval: 30000,
  });

  const {
    data: detail,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ['test-result', selectedId],
    queryFn: () => api.getTestResult(selectedId!),
    enabled: !!selectedId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4">
        Failed to load test history: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: "'Orbitron', sans-serif" }}>Test history</h1>
        <p className="text-zinc-400 text-sm mt-1">
          All RCA analyses are persisted automatically. Click a row to view full details.
        </p>
      </div>

      {!results || results.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <div className="text-zinc-500 text-sm">
            No test results yet. Run an analysis from the AI Insights page to see results here.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Results list */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Error rate</th>
                    <th className="px-4 py-3 font-medium text-right">Traces</th>
                    <th className="px-4 py-3 font-medium text-right">Root causes</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r: TestResultSummary) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={`border-b border-zinc-800/50 cursor-pointer transition-colors ${
                        selectedId === r.id
                          ? 'bg-sky-500/5'
                          : 'hover:bg-zinc-800/50'
                      }`}
                    >
                      <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                        {r.created_at ? formatDate(r.created_at) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-sky-400 text-xs bg-sky-500/10 px-1.5 py-0.5 rounded">
                          {r.service}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300 font-mono">
                        {(r.error_rate * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400">
                        {r.total_traces}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono ${r.root_cause_count > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                          {r.root_cause_count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail panel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            {!selectedId ? (
              <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
                Select a test result to view details
              </div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : detail ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white font-semibold text-lg">Analysis details</h3>
                  <p className="text-zinc-500 text-xs font-mono mt-1">{detail.test_id}</p>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Error rate</div>
                    <div className="text-lg font-bold text-white mt-0.5">
                      {(detail.error_rate * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Root causes</div>
                    <div className="text-lg font-bold text-white mt-0.5">
                      {detail.root_causes?.length || 0}
                    </div>
                  </div>
                </div>

                {/* AI Summary */}
                {detail.ai_summary && (
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300 mb-1">AI summary</h4>
                    <p className="text-zinc-400 text-sm leading-relaxed">{detail.ai_summary}</p>
                  </div>
                )}

                {/* Root causes */}
                {detail.root_causes && detail.root_causes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300 mb-2">Root causes</h4>
                    <div className="space-y-2">
                      {detail.root_causes.map((rc: any, i: number) => (
                        <div key={i} className="bg-zinc-800/50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <code className="text-sky-400 text-xs">{rc.service}</code>
                            <span className="text-amber-400 text-xs font-mono">
                              {(rc.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-zinc-400 text-xs">{rc.evidence}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {detail.recommendations && detail.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300 mb-1">Recommendations</h4>
                    <ul className="space-y-1">
                      {detail.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="text-zinc-400 text-xs flex gap-2">
                          <span className="text-sky-500 mt-0.5">→</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
