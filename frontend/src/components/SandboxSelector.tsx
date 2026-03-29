import { useSandbox, type SandboxInfo } from '../contexts/SandboxContext';

export default function SandboxSelector() {
  const { activeSandbox, sandboxes, setActiveSandbox } = useSandbox();

  if (sandboxes.length === 0) return null;

  return (
    <div className="px-3 pb-3">
      <label className="block text-xs text-sky-500 mb-1.5 px-1">Active sandbox</label>
      <select
        value={activeSandbox?.sandbox_id || ''}
        onChange={(e) => {
          const sb = sandboxes.find((s) => s.sandbox_id === e.target.value);
          if (sb) setActiveSandbox(sb);
        }}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white
                   focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500/60
                   transition-colors cursor-pointer"
      >
        {sandboxes.map((sb: SandboxInfo) => (
          <option key={sb.sandbox_id} value={sb.sandbox_id}>
            {sb.name} ({sb.pods} pods)
          </option>
        ))}
      </select>
    </div>
  );
}
