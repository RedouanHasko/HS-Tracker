import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { AuthProvider, useAuth } from './lib/AuthContext.tsx';
import { AuthBoard } from './components/Auth.tsx';
import { AppLoader } from './components/ui/AppLoader';

/** Service worker — required for Android “Install app”; enables offline shell cache */
if (import.meta.env.DEV) {
  // Never let an old PWA shell control localhost while UI code is being changed.
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister()))
    );
  }
  if ('caches' in window) {
    void caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.includes('workbox') || key.includes('precache'))
          .map((key) => caches.delete(key))
      )
    );
  }
} else {
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateServiceWorker(true);
    },
    onRegisteredSW(_serviceWorkerUrl, registration) {
      if (!registration) return;
      window.setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    },
  });
}

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
