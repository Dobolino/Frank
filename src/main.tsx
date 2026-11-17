import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { StoreProvider } from './app/store';
import { App } from './app/App';
import { registerServiceWorker } from './app/pwaUpdate';
import { FontTest } from './app/FontTest';

// Vorübergehend: Schrifttest für die Diagnose des unscharfen Schriftzugs auf dem iPhone
const fontTest = window.location.hash === '#schrifttest';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {fontTest ? (
      <FontTest />
    ) : (
      <StoreProvider>
        <App />
      </StoreProvider>
    )}
  </StrictMode>,
);

// iOS Safari ignoriert user-scalable=no: Pinch-Zoom-Gesten direkt abfangen
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

// Offline-Unterstützung (nur im Build, nicht während der Entwicklung)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => registerServiceWorker();
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
