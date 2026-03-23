import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSandbox } from '../contexts/SandboxContext';
import SandboxSelector from './SandboxSelector';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

const icons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  sandboxes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 3h-8l-2 4h12l-2-4z" />
    </svg>
  ),
  injection: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  replay: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  insights: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  history: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

const navItems = [
  { path: '/', label: 'Dashboard', icon: icons.dashboard },
  { path: '/sandboxes', label: 'Sandboxes', icon: icons.sandboxes },
  { path: '/injection', label: 'Failure injection', icon: icons.injection },
  { path: '/replay', label: 'Replay', icon: icons.replay },
  { path: '/insights', label: 'AI insights', icon: icons.insights },
  { path: '/history', label: 'Test history', icon: icons.history },
];

export default function Layout({ children }: Props) {
  const { user, logout } = useAuth();
  const { activeSandbox } = useSandbox();

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              {icons.injection}
            </div>
            <span className="text-lg font-bold text-white tracking-tight">Prometheon</span>
          </div>
        </div>

        {/* Sandbox selector */}
        <div className="pt-3 border-b border-zinc-800 pb-3">
          <SandboxSelector />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`
              }
            >
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="border-t border-zinc-800 px-4 py-4">
          {user && (
            <div className="mb-3">
              <div className="text-sm font-medium text-zinc-200 truncate">{user.username}</div>
              <div className="text-xs text-zinc-500 truncate">{user.tenant_name}</div>
              <div className="text-xs text-zinc-600 mt-0.5">
                {user.role === 'owner' ? 'Owner' : user.role === 'admin' ? 'Admin' : 'Member'}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full ${activeSandbox ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-xs text-zinc-500">
              {activeSandbox ? `${activeSandbox.name}` : 'No sandbox'}
            </span>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400
                       hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            {icons.logout}
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
