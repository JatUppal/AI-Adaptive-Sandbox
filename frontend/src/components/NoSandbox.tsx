import { useNavigate } from 'react-router-dom';

interface Props {
  title: string;
  description: string;
}

export default function NoSandbox({ title, description }: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.5" className="text-zinc-500">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 3h-8l-2 4h12l-2-4z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
        <p className="text-zinc-400 text-sm mb-6">{description}</p>
        <button
          onClick={() => navigate('/sandboxes')}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-6 py-2.5
                     rounded-lg transition-colors inline-flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create a sandbox
        </button>
      </div>
    </div>
  );
}
