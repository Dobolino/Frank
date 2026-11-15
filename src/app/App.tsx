import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Button, Select, cx } from '../components/ui';
import { emptyYear } from '../seed/builders';
import { Dashboard } from '../features/Dashboard';
import { BudgetPage } from '../features/BudgetPage';
import { SalaryPage } from '../features/SalaryPage';
import { TaxPage } from '../features/TaxPage';
import { GoalsPage } from '../features/GoalsPage';
import { CashflowPage } from '../features/CashflowPage';
import { ComparePage } from '../features/ComparePage';
import { DataPage } from '../features/DataPage';

const PAGES = [
  { id: 'overview', label: 'Übersicht', icon: '◎', Component: Dashboard },
  { id: 'budget', label: 'Budget', icon: '▤', Component: BudgetPage },
  { id: 'salary', label: 'Lohn', icon: '₣', Component: SalaryPage },
  { id: 'tax', label: 'Steuern', icon: '§', Component: TaxPage },
  { id: 'cashflow', label: 'Sparkonto', icon: '⇄', Component: CashflowPage },
  { id: 'goals', label: 'Sparziele', icon: '✈', Component: GoalsPage },
  { id: 'compare', label: 'Jahresvergleich', icon: '▥', Component: ComparePage },
  { id: 'data', label: 'Daten & KI', icon: '⤓', Component: DataPage },
] as const;

type PageId = (typeof PAGES)[number]['id'];

const pageFromHash = (): PageId => {
  const id = window.location.hash.replace('#', '');
  return (PAGES.find((p) => p.id === id)?.id ?? 'overview') as PageId;
};

export function App() {
  const { data, update, saveError } = useStore();
  const [page, setPage] = useState<PageId>(pageFromHash);

  useEffect(() => {
    const onHash = () => {
      setPage(pageFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const years = Object.keys(data.years).map(Number).sort();
  const Current = PAGES.find((p) => p.id === page)!.Component;

  const addYear = () => {
    const last = Math.max(...years);
    update((d) => {
      d.years[String(last + 1)] = emptyYear(last + 1, d.years[String(last)]);
      d.activeYear = last + 1;
    });
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-[env(safe-area-inset-top)] z-20 border-b border-line bg-panel/95 backdrop-blur md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0 md:bg-panel">

        <div className="flex items-center justify-between gap-3 px-5 py-4 md:block">
          <div>
            <div className="text-lg font-semibold tracking-tight">
              Frank<span className="text-accent">.</span>
            </div>
            <div className="text-xs text-muted">Finanzen · {data.profile.municipality}</div>
          </div>
          <div className="flex items-center gap-2 md:mt-5">
            <Select
              ariaLabel="Jahr wählen"
              value={data.activeYear}
              options={years.map((y) => ({ value: y, label: String(y) }))}
              onChange={(y) => update((d) => void (d.activeYear = y))}
              className="md:flex-1"
            />
            <Button variant="ghost" title="Neues Jahr aus dem letzten Jahr anlegen" onClick={addYear}>
              + Jahr
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {PAGES.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              className={cx(
                'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                page === p.id ? 'bg-panel-2 text-text' : 'text-muted hover:bg-panel-2/60 hover:text-text',
              )}
            >
              <span className={cx('w-4 text-center', page === p.id && 'text-accent')} aria-hidden>
                {p.icon}
              </span>
              {p.label}
            </a>
          ))}
        </nav>
        {saveError && <p className="px-5 pb-4 text-xs text-danger">Speichern im Browser fehlgeschlagen – bitte Export nutzen.</p>}
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <div className="mx-auto max-w-6xl">
          <Current />
        </div>
      </main>
    </div>
  );
}
