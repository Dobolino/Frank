import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { useStore } from './store';
import { Button } from '../components/ui';
import { FrankIcon } from '../components/FrankIcon';
import { YearPicker } from '../components/YearPicker';
import { tabs, activeTab, pageFromHash, type PageId } from './navigation';
import { ExpensesPage } from '../features/ExpensesPage';
import { MorePage } from '../features/MorePage';
import { ContractsPage } from '../features/ContractsPage';
import { Dashboard } from '../features/Dashboard';
import { BudgetPage } from '../features/BudgetPage';
import { SalaryPage } from '../features/SalaryPage';
import { TaxPage } from '../features/TaxPage';
import { InvestPage } from '../features/InvestPage';
import { SavingsPage } from '../features/SavingsPage';
import { DataPage, AccountsPage } from '../features/DataPage';
import { Onboarding } from '../features/Onboarding';
import { haptic } from './haptics';
import { applyUpdate, useUpdateAvailable } from './pwaUpdate';

const DeviceSyncPage = lazy(() => import('../features/DeviceSyncPage'));

const pages = {
  overview: Dashboard, budget: BudgetPage, expenses: ExpensesPage, savings: SavingsPage, more: MorePage,
  invest: InvestPage, salary: SalaryPage, tax: TaxPage, data: DataPage, accounts: AccountsPage, contracts: ContractsPage,
} satisfies Record<Exclude<PageId, 'sync'>, React.ComponentType>;

const tabIndex = (page: PageId) => tabs.findIndex(tab => tab.id === activeTab(page));

interface Swipe {
  x: number;
  y: number;
  started: number;
}

// Text fields, buttons and horizontal tables keep their own touch gestures.
function canSwipeFrom(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, select, textarea, button, label, summary, [role="switch"], [role="slider"], [contenteditable="true"], [data-no-swipe]')) return false;
  for (let element: Element | null = target; element && element.tagName !== 'MAIN'; element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(element).overflowX)) return false;
  }
  return !window.getSelection()?.toString();
}

export function App() {
  const { data, saveError, firstRun } = useStore();
  const updateAvailable = useUpdateAvailable();
  const [{ page, direction }, setNavigation] = useState(() => ({ page: pageFromHash(window.location.hash), direction: 1 }));
  const [drag, setDrag] = useState(0);
  const swipe = useRef<Swipe | null>(null);
  const lastPage = useRef(page);
  const scrollPositions = useRef(new Map<PageId, number>());
  const main = useRef<HTMLElement>(null);
  const section = activeTab(page);
  const index = tabIndex(page);

  useEffect(() => {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const onHash = () => {
      const next = pageFromHash(window.location.hash);
      if (lastPage.current === next) return;
      scrollPositions.current.set(lastPage.current, window.scrollY);
      lastPage.current = next;
      // A swipe/history change does not naturally blur a focused amount field.
      // Commit its draft before unmounting the current page.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches('input, textarea, select, [contenteditable="true"]')) focused.blur();
      setNavigation((previous) => ({
        page: next,
        direction: tabIndex(next) >= tabIndex(previous.page) ? 1 : -1,
      }));
      swipe.current = null;
      setDrag(0);
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      history.scrollRestoration = previousRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, scrollPositions.current.get(page) ?? 0);
  }, [page, firstRun]);

  useEffect(() => {
    const surface = main.current;
    if (!surface) return;
    // React's delegated touch listeners are passive. Only a deliberate horizontal
    // page gesture suppresses browser scrolling; tables and vertical scroll stay native.
    const preventHorizontalScroll = (event: globalThis.TouchEvent) => {
      const start = swipe.current;
      const touch = event.touches[0];
      if (!start || !touch || event.touches.length !== 1) return;
      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      if (dx > 12 && dy < dx * 0.6 && event.cancelable) event.preventDefault();
    };
    surface.addEventListener('touchmove', preventHorizontalScroll, { passive: false });
    return () => surface.removeEventListener('touchmove', preventHorizontalScroll);
  }, [firstRun]);

  const cancelSwipe = () => {
    swipe.current = null;
    setDrag(0);
  };
  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    cancelSwipe();
    const touch = event.touches[0];
    if (!touch || section !== page || event.touches.length !== 1 || window.innerWidth >= 768 || !canSwipeFrom(event.target)) return;
    // Leave the screen edges to the browser's back/forward gestures.
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    swipe.current = { x: touch.clientX, y: touch.clientY, started: performance.now() };
  };
  const onTouchMove = (event: TouchEvent<HTMLElement>) => {
    const start = swipe.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (event.touches.length !== 1 || Math.abs(dy) > Math.max(16, Math.abs(dx) * 0.6)) {
      cancelSwipe();
      return;
    }
    const nextIndex = index + (dx < 0 ? 1 : -1);
    setDrag(nextIndex >= 0 && nextIndex < tabs.length ? Math.max(-54, Math.min(54, dx * 0.25)) : 0);
  };
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = swipe.current;
    const touch = event.changedTouches[0];
    cancelSwipe();
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dy) > Math.abs(dx) * 0.6 || performance.now() - start.started > 900) return;
    const next = tabs[index + (dx < 0 ? 1 : -1)];
    if (next) {
      haptic();
      window.location.hash = next.id;
    }
  };

  const hasVisitedSync = useRef(false);
  if (page === 'sync') hasVisitedSync.current = true;
  const Current = page === 'sync' ? null : pages[page];
  if (firstRun && page !== 'sync') return <Onboarding />;

  return (
    <div className="frank-shell">
      <header className="frank-top">
        <div className="frank-top-inner">
          <a href="#overview" className="frank-logo" aria-label="Frank – Übersicht">Frank<span>.</span></a>
          {page === 'overview'
            ? <span className="frank-location">{data.profile.municipality}</span>
            : page === 'sync' ? null : <YearPicker />}
        </div>
      </header>
      <main
        ref={main}
        id="frank-main" className="frank-main"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={cancelSwipe}
      >
        <div>
          {saveError && <p role="alert" className="mb-3 text-sm text-danger">Speichern fehlgeschlagen. Unter <a className="underline" href="#data">Daten &amp; Backup</a> kannst du deine Eingaben sichern.</p>}
          {updateAvailable && (
            <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
              <span>Neue Version von Frank bereit.</span>
              <Button variant="primary" onClick={applyUpdate}>
                Neu laden
              </Button>
            </div>
          )}
          <div className={drag ? 'page-drag is-dragging' : 'page-drag'} style={{ '--page-drag': `${drag}px`, '--page-opacity': 1 - Math.abs(drag) / 240 } as CSSProperties}>
            <div key={page} className="page-enter" style={{ '--page-direction': direction } as CSSProperties}>
              {section === 'more' && page !== 'more' && (
                <a className="frank-back" href="#more"><FrankIcon name="back" size={15} />Mehr</a>
              )}
              {Current && <Current />}
            </div>
          </div>
        </div>
        {hasVisitedSync.current && <div hidden={page !== 'sync'}>
          <Suspense fallback={<p role="status">Geräteabgleich wird geöffnet …</p>}><DeviceSyncPage /></Suspense>
        </div>}
      </main>

      <nav className="frank-dock" aria-label="Hauptnavigation">
        {tabs.map(tab => (
          <a key={tab.id} href={`#${tab.id}`} aria-current={section === tab.id ? (page === tab.id ? 'page' : 'location') : undefined}
            onClick={() => { if (page !== tab.id) haptic(); else window.scrollTo(0, 0); }}>
            <FrankIcon name={tab.id} />
            <span>{tab.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
