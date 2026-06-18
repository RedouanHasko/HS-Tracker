import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider, useAuth } from './lib/AuthContext.tsx';
import { AuthBoard } from './components/Auth.tsx';

const RootComponent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-8 h-8 rounded-full border-2 border-sky-500/20 border-t-sky-500 animate-spin"></div>
      </div>
    );
  }

  return user ? <App /> : <AuthBoard />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RootComponent />
    </AuthProvider>
  </StrictMode>,
);
