import { useSyncExternalStore } from 'react';

/**
 * Service-Worker-Updates für die installierte App.
 * Auf dem iPhone bleibt die App im Standalone-Modus oft tagelang offen. Frank sucht deshalb
 * beim Zurückkehren in die App nach einer neuen Version und bietet «Neu laden» an,
 * statt zu warten, bis die App ganz geschlossen wird.
 */
let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function track(reg: ServiceWorkerRegistration) {
  const offer = (worker: ServiceWorker | null) => {
    // Nur ein Update anbieten, wenn schon eine Version läuft (nicht bei der ersten Installation)
    if (worker && navigator.serviceWorker.controller) {
      waiting = worker;
      emit();
    }
  };
  offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    next?.addEventListener('statechange', () => {
      if (next.state === 'installed') offer(next);
    });
  });
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      track(reg);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      });
    })
    .catch(() => {
      /* ohne Service Worker läuft die App einfach online */
    });
}

/** Wartende Version aktivieren; die Seite lädt danach neu (controllerchange). */
export function applyUpdate(): void {
  waiting?.postMessage('skipWaiting');
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => waiting !== null,
    () => false,
  );
}
