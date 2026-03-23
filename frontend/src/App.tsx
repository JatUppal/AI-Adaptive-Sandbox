import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Contexts
import { AuthProvider } from './contexts/AuthContext';
import { SandboxProvider } from './contexts/SandboxContext';

// Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages — public
import Login from './pages/Login';
import Register from './pages/Register';

// Pages — protected
import Dashboard from './pages/Dashboard';
import Sandboxes from './pages/Sandboxes';
import FailureInjection from './pages/FailureInjection';
import Replay from './pages/Replay';
import AIInsights from './pages/AIInsights';
import TestHistory from './pages/TestHistory';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SandboxProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected routes */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/sandboxes" element={<Sandboxes />} />
                        <Route path="/injection" element={<FailureInjection />} />
                        <Route path="/replay" element={<Replay />} />
                        <Route path="/insights" element={<AIInsights />} />
                        <Route path="/history" element={<TestHistory />} />
                      </Routes>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </SandboxProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
