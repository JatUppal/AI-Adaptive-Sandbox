import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSandbox } from '../contexts/SandboxContext';
import NoSandbox from '../components/NoSandbox';

// ---------------------------------------------------------------------------
// Toxic type definitions
// ---------------------------------------------------------------------------
const toxicTypes = [
  {
    value: 'latency',
    label: 'Latency',
    description: 'Add delay to requests',
    fields: [
      { name: 'latency', label: 'Latency (ms)', default: 1000 },
      { name: 'jitter', label: 'Jitter (ms)', default: 0 },
    ],
    hint: 'Adds latency to proxied requests. Values >5000ms may exceed httpx timeout and cause 502s.',
  },
  {
    value: 'timeout',
    label: 'Timeout',
    description: 'Freeze connection after delay',
    fields: [{ name: 'timeout', label: 'Timeout (ms)', default: 5000 }],
    hint: 'Stops forwarding data after the timeout, keeping the connection open. Simulates hung services.',
  },
  {
    value: 'limit_data',
    label: 'Limit Data',
    description: 'Cut connection after N bytes',
    fields: [{ name: 'bytes', label: 'Bytes (0 = instant cut)', default: 0 }],
    hint: 'Closes connection after sending N bytes. Set bytes=0 for instant 502 — the most reliable failure mode.',
  },
  {
    value: 'reset_peer',
    label: 'Reset Peer',
    description: 'TCP RST after delay',
    fields: [{ name: 'timeout', label: 'Timeout before RST (ms)', default: 0 }],
    hint: 'Sends TCP RST after the timeout. Simulates a crashed or restarting downstream service.',
  },
  {
    value: 'bandwidth',
    label: 'Bandwidth',
    description: 'Limit throughput',
    fields: [{ name: 'rate', label: 'Rate (KB/s)', default: 10 }],
    hint: 'Limits bandwidth to the specified rate. Useful for simulating slow network connections.',
  },
];

// Proxy options are derived dynamically from toxicsData (see component body)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatAttributes(type: string, attrs: Record<string, any>): string {
  switch (type) {
    case 'latency':
      return `${attrs.latency || 0}ms latency${attrs.jitter ? `, ±${attrs.jitter}ms jitter` : ''}`;
    case 'timeout':
      return `${attrs.timeout || 0}ms timeout`;
    case 'limit_data':
      return attrs.bytes === 0 ? 'Instant connection cut' : `${attrs.bytes} bytes then cut`;
    case 'reset_peer':
      return attrs.timeout ? `TCP RST after ${attrs.timeout}ms` : 'Immediate TCP RST';
    case 'bandwidth':
      return `${attrs.rate || 0} KB/s`;
    default:
      return JSON.stringify(attrs);
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function FailureInjection() {
  const { activeSandbox } = useSandbox();
  const sid = activeSandbox?.sandbox_id;
  const queryClient = useQueryClient();

  const [selectedProxy, setSelectedProxy] = useState('');
  const [toxicType, setToxicType] = useState('latency');
  const [fieldValues, setFieldValues] = useState<Record<string, number>>({ latency: 1000, jitter: 0 });

  const activeDef = toxicTypes.find((t) => t.value === toxicType)!;

  // Update field values when toxic type changes
  const handleTypeChange = (newType: string) => {
    setToxicType(newType);
    const def = toxicTypes.find((t) => t.value === newType)!;
    const defaults: Record<string, number> = {};
    def.fields.forEach((f) => (defaults[f.name] = f.default));
    setFieldValues(defaults);
  };

  // Queries
  const { data: toxicsData, isLoading } = useQuery({
    queryKey: ['toxics', sid],
    queryFn: () => api.listToxics(sid!),
    enabled: !!sid,
    refetchInterval: 5000,
  });

  // Derive proxy options dynamically from Toxiproxy
  const proxyOptions = toxicsData
    ? Object.keys(toxicsData).map((name) => {
        const parts = name.split('_to_');
        const label = parts.length === 2 ? `${parts[0]} → ${parts[1]}` : name;
        return { value: name, label };
      })
    : [];

  // Auto-select first proxy when data loads or sandbox changes
  if (proxyOptions.length > 0 && (!selectedProxy || !proxyOptions.find(p => p.value === selectedProxy))) {
    setSelectedProxy(proxyOptions[0].value);
  }

  // Add toxic
  const addMutation = useMutation({
    mutationFn: () =>
      api.addToxic(sid!, selectedProxy, {
        type: toxicType,
        name: `${toxicType}_${Date.now()}`,
        attributes: fieldValues,
        stream: 'downstream',
        toxicity: 1,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['toxics', sid] }),
  });

  // Remove toxic
  const removeMutation = useMutation({
    mutationFn: ({ proxy, name }: { proxy: string; name: string }) =>
      api.removeToxic(sid!, proxy, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['toxics', sid] }),
  });

  if (!activeSandbox) {
    return <NoSandbox title="No sandbox selected" description="Create a sandbox to inject failures into your service mesh." />;
  }

  // Collect all active toxics from all proxies
  const activeToxics: { proxy: string; name: string; type: string; attributes: any }[] = [];
  if (toxicsData) {
    for (const [proxyName, proxyInfo] of Object.entries(toxicsData)) {
      for (const toxic of (proxyInfo as any).toxics || []) {
        activeToxics.push({ proxy: proxyName, name: toxic.name, type: toxic.type, attributes: toxic.attributes });
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Failure Injection</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Inject chaos into <span className="text-emerald-400">{activeSandbox.name}</span>'s service mesh via Toxiproxy
        </p>
      </div>

      {/* Inject form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h3 className="text-white font-semibold">Add Toxic</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Proxy selector */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Target proxy</label>
            <select
              value={selectedProxy}
              onChange={(e) => setSelectedProxy(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {proxyOptions.length > 0 ? (
                proxyOptions.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))
              ) : (
                <option value="">Loading proxies...</option>
              )}
            </select>
          </div>

          {/* Toxic type */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Toxic type</label>
            <select
              value={toxicType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {toxicTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeDef.fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm text-zinc-400 mb-1.5">{field.label}</label>
              <input
                type="number"
                value={fieldValues[field.name] ?? field.default}
                onChange={(e) => setFieldValues({ ...fieldValues, [field.name]: Number(e.target.value) })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          ))}
        </div>

        {/* Hint */}
        <p className="text-xs text-zinc-500 bg-zinc-800/50 rounded-lg px-3 py-2">
          {activeDef.hint}
        </p>

        <button
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending}
          className="bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 text-white text-sm font-medium px-5 py-2
                     rounded-lg transition-colors flex items-center gap-2"
        >
          {addMutation.isPending ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Injecting...
            </>
          ) : (
            'Inject failure'
          )}
        </button>

        {addMutation.isError && (
          <p className="text-red-400 text-sm">{(addMutation.error as Error).message}</p>
        )}
      </div>

      {/* Active toxics */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4">Active Toxics</h3>

        {isLoading ? (
          <p className="text-zinc-500 text-sm">Loading...</p>
        ) : activeToxics.length === 0 ? (
          <p className="text-zinc-500 text-sm">No active toxics. The service mesh is running clean.</p>
        ) : (
          <div className="space-y-2">
            {activeToxics.map((toxic) => (
              <div key={`${toxic.proxy}-${toxic.name}`}
                   className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <code className="text-emerald-400 text-xs bg-emerald-500/10 px-1.5 py-0.5 rounded">{toxic.proxy}</code>
                    <span className="text-white text-sm font-medium">{toxic.type}</span>
                  </div>
                  <p className="text-zinc-400 text-xs mt-1">{formatAttributes(toxic.type, toxic.attributes)}</p>
                </div>
                <button
                  onClick={() => removeMutation.mutate({ proxy: toxic.proxy, name: toxic.name })}
                  disabled={removeMutation.isPending}
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                  title="Remove toxic"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
