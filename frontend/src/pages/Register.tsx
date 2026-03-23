import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [createTenant, setCreateTenant] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(
        email,
        username,
        password,
        createTenant ? tenantName : undefined,
      );
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="text-emerald-400">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">Prometheon</span>
          </div>
          <p className="text-zinc-400 text-sm">Create your account to get started</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white
                           placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                           focus:border-emerald-500/60 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                autoComplete="username"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white
                           placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                           focus:border-emerald-500/60 transition-colors"
                placeholder="Choose a username"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white
                             placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                             focus:border-emerald-500/60 transition-colors"
                  placeholder="Min 6 chars"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Confirm
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white
                             placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                             focus:border-emerald-500/60 transition-colors"
                  placeholder="Confirm"
                />
              </div>
            </div>

            {/* Tenant toggle */}
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createTenant}
                  onChange={(e) => setCreateTenant(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500
                             focus:ring-emerald-500/40 focus:ring-offset-0"
                />
                <div>
                  <span className="text-sm font-medium text-zinc-200">Create a new team</span>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Otherwise you'll join the default workspace
                  </p>
                </div>
              </label>

              {createTenant && (
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  required={createTenant}
                  className="mt-3 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white
                             placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                             focus:border-emerald-500/60 transition-colors"
                  placeholder="Team name (e.g. Acme Engineering)"
                />
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !email || !username || !password || !confirmPassword}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500
                         text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
            <p className="text-zinc-400 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
