import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { AuthProvider, useAuth } from './lib/AuthContext.tsx';
import { AuthBoard } from './components/Auth.tsx';
import { AppLoader } from './components/ui/AppLoader';

/** Service worker — required for Android “Install app”; enables offline shell cache */
registerSW({ immediate: true });

const RootComponent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <AppLoader />;
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
