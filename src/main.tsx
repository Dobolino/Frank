import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { StoreProvider } from './app/store';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

// iOS Safari ignoriert user-scalable=no: Pinch-Zoom-Gesten direkt abfangen
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

// Offline-Unterstützung (nur im Build, nicht während der Entwicklung)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
      /* ohne Service Worker läuft die App einfach online */
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
