import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SandboxSummary, type SandboxDetail, type ServiceInput, type ConnectionInput } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSandbox } from '../contexts/SandboxContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: 'bg-emerald-500/15 text-emerald-400',
    creating: 'bg-amber-500/15 text-amber-400',
  };
  const dots: Record<string, string> = {
    ready: 'bg-emerald-400',
    creating: 'bg-amber-400 animate-pulse',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.creating}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status] || dots.creating}`} />
      {status}
    </span>
  );
}

function formatAge(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Service builder sub-component
// ---------------------------------------------------------------------------
function ServiceBuilder({
  services, setServices,
}: {
  services: ServiceInput[];
  setServices: (s: ServiceInput[]) => void;
}) {
  const addService = () => {
    if (services.length >= 10) return;
    setServices([
      ...services,
      { name: '', image: '', port: 8080, env: {}, entry_point: services.length === 0 },
    ]);
  };

  const updateService = (i: number, field: string, value: any) => {
    const updated = [...services];
    (updated[i] as any)[field] = value;
    // If setting entry_point, unset others
    if (field === 'entry_point' && value) {
      updated.forEach((s, j) => { if (j !== i) s.entry_point = false; });
    }
    setServices(updated);
  };

  const removeService = (i: number) => {
    const updated = services.filter((_, j) => j !== i);
    // Ensure at least one entry point
    if (updated.length > 0 && !updated.some(s => s.entry_point)) {
      updated[0].entry_point = true;
    }
    setServices(updated);
  };

  return (
    <div className="space-y-3">
      {services.map((svc, i) => (
        <div key={i} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Service {i + 1}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="entry_point"
                  checked={svc.entry_point}
                  onChange={() => updateService(i, 'entry_point', true)}
                  className="w-3.5 h-3.5 text-emerald-500 bg-zinc-800 border-zinc-600"
                />
                <span className="text-xs text-zinc-400">Entry point</span>
              </label>
              {services.length > 1 && (
                <button onClick={() => removeService(i)} className="text-zinc-600 hover:text-red-400 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Name</label>
              <input
                type="text" value={svc.name}
                onChange={(e) => updateService(i, 'name', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="api-gateway" maxLength={60}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Docker image</label>
              <input
                type="text" value={svc.image}
                onChange={(e) => updateService(i, 'image', e.target.value)}
                placeholder="nginx:1.25"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Port</label>
              <input
                type="number" value={svc.port || ''}
                onChange={(e) => updateService(i, 'port', e.target.value === '' ? 0 : Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                min={1} max={65535}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={addService}
        disabled={services.length >= 10}
        className="w-full border border-dashed border-zinc-700 rounded-lg py-2.5 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-30"
      >
        + Add service {services.length >= 10 && '(max 10)'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection builder sub-component
// ---------------------------------------------------------------------------
function ConnectionBuilder({
  connections, setConnections, serviceNames,
}: {
  connections: ConnectionInput[];
  setConnections: (c: ConnectionInput[]) => void;
  serviceNames: string[];
}) {
  const addConnection = () => {
    if (serviceNames.length < 2 || connections.length >= 15) return;
    setConnections([...connections, { from_service: serviceNames[0], to_service: serviceNames[1] }]);
  };

  const updateConnection = (i: number, field: string, value: string) => {
    const updated = [...connections];
    (updated[i] as any)[field] = value;
    setConnections(updated);
  };

  const removeConnection = (i: number) => {
    setConnections(connections.filter((_, j) => j !== i));
  };

  if (serviceNames.length < 2) {
    return <p className="text-zinc-500 text-sm">Add at least 2 services to define connections.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-zinc-500 text-xs">Toxiproxy is automatically inserted between connected services for fault injection.</p>
      {connections.map((conn, i) => (
        <div key={i} className="flex items-center gap-3">
          <select value={conn.from_service} onChange={(e) => updateConnection(i, 'from_service', e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            {serviceNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-zinc-500 text-sm">→</span>
          <select value={conn.to_service} onChange={(e) => updateConnection(i, 'to_service', e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            {serviceNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={() => removeConnection(i)} className="text-zinc-600 hover:text-red-400 transition-colors p-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ))}
      <button onClick={addConnection} disabled={connections.length >= 15}
        className="w-full border border-dashed border-zinc-700 rounded-lg py-2.5 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-30">
        + Add connection
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Sandboxes() {
  const { user } = useAuth();
  const { activeSandbox, setActiveSandbox, refreshSandboxes } = useSandbox();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newTier, setNewTier] = useState('small');
  const [useDemo, setUseDemo] = useState(false);
  const [services, setServices] = useState<ServiceInput[]>([
    { name: '', image: '', port: 8080, env: {}, entry_point: true },
  ]);
  const [connections, setConnections] = useState<ConnectionInput[]>([]);

  const resetForm = () => {
    setStep(1);
    setNewName('');
    setNewTier('small');
    setUseDemo(false);
    setServices([{ name: '', image: '', port: 8080, env: {}, entry_point: true }]);
    setConnections([]);
    setShowCreate(false);
  };

  const serviceNames = services.filter(s => s.name).map(s => s.name);

  // Validation
  const step1Valid = newName.length > 0;
  const step2Valid = useDemo || (services.length > 0 && services.every(s => s.name && s.image && s.port > 0));
  const hasDuplicateNames = new Set(serviceNames).size !== serviceNames.length;

  // Queries
  const { data: sandboxes, isLoading, error } = useQuery({
    queryKey: ['sandboxes', user?.tenant_id],
    queryFn: () => api.listSandboxes(user?.tenant_id),
    refetchInterval: 5000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['sandbox-detail', selectedId],
    queryFn: () => api.getSandbox(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 5000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: () =>
      api.createSandbox(user?.tenant_id || 'default', newName, newTier, useDemo ? undefined : services, useDemo ? undefined : connections, useDemo),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sandboxes'] });
      refreshSandboxes();
      setActiveSandbox({
        sandbox_id: data.sandbox_id, namespace: data.namespace,
        tenant_id: data.tenant_id, name: data.name,
        status: data.status, pods: '0/4', created_at: data.created_at,
      });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSandbox(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandboxes'] });
      refreshSandboxes();
      setSelectedId(null);
      setDeleteConfirm(null);
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sandboxes</h1>
          <p className="text-zinc-400 text-sm mt-1">Isolated K8s namespaces with your services and Toxiproxy</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create sandbox
        </button>
      </div>

      {/* Multi-step create form */}
      {showCreate && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step >= s ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500'
                }`}>{s}</div>
                <span className={`text-xs ${step >= s ? 'text-zinc-200' : 'text-zinc-600'}`}>
                  {s === 1 ? 'Basics' : s === 2 ? 'Services' : 'Connections'}
                </span>
                {s < 3 && <div className={`w-8 h-px ${step > s ? 'bg-emerald-600' : 'bg-zinc-700'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Name + Tier */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">Sandbox name</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. staging-test" autoFocus
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">Resource tier</label>
                  <select value={newTier} onChange={(e) => setNewTier(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                    <option value="small">Small — 500m CPU, 512Mi per pod</option>
                    <option value="medium">Medium — 1 CPU, 1Gi per pod</option>
                    <option value="large">Large — 2 CPU, 2Gi per pod</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={resetForm} className="text-zinc-400 hover:text-zinc-200 text-sm px-3 py-2 transition-colors">Cancel</button>
                <button onClick={() => setStep(2)} disabled={!step1Valid}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Services */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Demo toggle */}
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={useDemo} onChange={(e) => setUseDemo(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/40 focus:ring-offset-0" />
                  <div>
                    <span className="text-sm font-medium text-zinc-200">Use demo services</span>
                    <p className="text-xs text-zinc-500 mt-0.5">Quick start with built-in service-a → service-b → service-c chain</p>
                  </div>
                </label>
              </div>

              {!useDemo && (
                <>
                  <h4 className="text-sm font-medium text-zinc-300">Define your services</h4>
                  <ServiceBuilder services={services} setServices={setServices} />
                  {hasDuplicateNames && <p className="text-red-400 text-xs">Service names must be unique</p>}
                </>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="text-zinc-400 hover:text-zinc-200 text-sm px-3 py-2 transition-colors">Back</button>
                <button onClick={() => useDemo ? setStep(3) : setStep(3)} disabled={!step2Valid || hasDuplicateNames}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                  {useDemo ? 'Review' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Connections + Review */}
          {step === 3 && (
            <div className="space-y-4">
              {!useDemo && serviceNames.length >= 2 && (
                <>
                  <h4 className="text-sm font-medium text-zinc-300">Define connections</h4>
                  <ConnectionBuilder connections={connections} setConnections={setConnections} serviceNames={serviceNames} />
                </>
              )}

              {/* Review summary */}
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium text-zinc-200">Review</h4>
                <div className="text-xs text-zinc-400 space-y-1">
                  <p>Name: <span className="text-white">{newName}</span> — Tier: <span className="text-white">{newTier}</span></p>
                  {useDemo ? (
                    <p>Services: <span className="text-emerald-400">Demo (service-a → service-b → service-c)</span></p>
                  ) : (
                    <>
                      <p>Services ({services.length}): {serviceNames.map((n, i) => (
                        <span key={n}><code className="text-emerald-400">{n}</code>{i < serviceNames.length - 1 ? ', ' : ''}</span>
                      ))}</p>
                      {connections.length > 0 && (
                        <p>Connections: {connections.map((c, i) => (
                          <span key={i}>{c.from_service} → {c.to_service}{i < connections.length - 1 ? ', ' : ''}</span>
                        ))}</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(2)} className="text-zinc-400 hover:text-zinc-200 text-sm px-3 py-2 transition-colors">Back</button>
                <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                  {createMutation.isPending ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating sandbox...</>
                  ) : 'Create sandbox'}
                </button>
              </div>
              {createMutation.isError && <p className="text-red-400 text-sm">{(createMutation.error as Error).message}</p>}
            </div>
          )}
        </div>
      )}

      {/* Loading / Error / Empty */}
      {isLoading && <div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4 text-sm">Failed to load sandboxes: {(error as Error).message}</div>}

      {sandboxes && sandboxes.length === 0 && !isLoading && !showCreate && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3h-8l-2 4h12l-2-4z"/></svg>
          </div>
          <p className="text-zinc-300 font-medium mb-1">No sandboxes yet</p>
          <p className="text-zinc-500 text-sm mb-4">Create your first sandbox to deploy an isolated service mesh.</p>
          <button onClick={() => setShowCreate(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            Create your first sandbox
          </button>
        </div>
      )}

      {/* Sandbox list + detail */}
      {sandboxes && sandboxes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {sandboxes.map((sb: SandboxSummary) => (
              <div key={sb.sandbox_id} onClick={() => setSelectedId(sb.sandbox_id)}
                className={`bg-zinc-900 border rounded-xl p-4 cursor-pointer transition-all ${
                  selectedId === sb.sandbox_id ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 hover:border-zinc-700'
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-white font-semibold truncate">{sb.name}</h3>
                      <StatusBadge status={sb.status} />
                      {activeSandbox?.sandbox_id === sb.sandbox_id && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">active</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span className="font-mono">{sb.sandbox_id}</span>
                      <span>{(sb as any).service_count || '?'} services</span>
                      <span>{formatAge(sb.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <div className="text-right">
                      <div className="text-sm font-mono text-zinc-300">{sb.pods}</div>
                      <div className="text-xs text-zinc-500">pods</div>
                    </div>
                    {activeSandbox?.sandbox_id !== sb.sandbox_id && sb.status === 'ready' && (
                      <button onClick={(e) => { e.stopPropagation(); setActiveSandbox(sb); }}
                        className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md transition-colors">Activate</button>
                    )}
                    {deleteConfirm === sb.sandbox_id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(sb.sandbox_id); }}
                          disabled={deleteMutation.isPending}
                          className="text-xs bg-red-600 hover:bg-red-500 text-white px-2.5 py-1 rounded-md transition-colors">{deleteMutation.isPending ? '...' : 'Confirm'}</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                          className="text-xs text-zinc-400 hover:text-zinc-200 px-1.5 py-1 transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(sb.sandbox_id); }}
                        className="text-zinc-600 hover:text-red-400 transition-colors p-1" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            {!selectedId ? (
              <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">Select a sandbox to view details</div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center h-48"><div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : detail ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-white font-semibold text-lg">{detail.name}</h3>
                  <div className="flex items-center gap-2 mt-1"><StatusBadge status={detail.status} /><span className="text-xs text-zinc-500 font-mono">{detail.sandbox_id}</span></div>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Namespace</h4>
                  <code className="text-sm text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">{detail.namespace}</code>
                </div>
                {(detail as any).entry_point && (
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Entry point</h4>
                    <code className="text-sm text-amber-400 bg-amber-500/10 px-2 py-1 rounded">{(detail as any).entry_point}</code>
                  </div>
                )}
                {detail.services && (
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Services</h4>
                    <div className="space-y-1.5">
                      {Object.entries(detail.services).map(([name, endpoint]) => (
                        <div key={name} className="bg-zinc-800/50 rounded-lg px-3 py-2">
                          <div className="text-sm font-medium text-zinc-200">{name}</div>
                          <div className="text-xs text-zinc-500 font-mono truncate">{endpoint}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail.pods && detail.pods.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Pods</h4>
                    <div className="space-y-1.5">
                      {detail.pods.map((pod: any) => (
                        <div key={pod.name} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                          <span className="text-xs text-zinc-300 font-mono truncate flex-1">{pod.name}</span>
                          <div className="flex items-center gap-2 ml-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${pod.ready ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                            <span className={`text-xs ${pod.ready ? 'text-emerald-400' : 'text-amber-400'}`}>{pod.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
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
