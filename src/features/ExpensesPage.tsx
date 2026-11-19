import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { applyRules, merchantKey } from '../domain/actuals';
import { parseCsv, type ParsedTransaction, type CsvTable } from '../domain/bankCsv';
import { expensePeriod } from '../domain/expensePeriod';
import { accountDisplayName, bankLabel } from '../domain/importAccounts';
import { MONTHS, type Transaction } from '../domain/types';
import { ExpenseChart, periodLabel, type ExpenseChartMode } from './ExpenseChart';
import { MerchantActivity } from './MerchantActivity';
import { Select, todayYm, usePref } from './shared';
import './expenses.css';

const BankImportPreview = lazy(() => import('./BankImportPreview').then(m => ({ default: m.BankImportPreview })));

function ExpenseIcon({ type }: { type: 'visible' | 'hidden' | 'import' }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === 'import' ? (
        <path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" />
      ) : type === 'visible' ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.6" />
        </>
      ) : (
        <path d="m3 3 18 18M10 5.3l2-.3c6.5 0 10 7 10 7a20 20 0 0 1-2.5 3.5M6.5 6.5A18 18 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 4.6-1" />
      )}
    </svg>
  );
}
const empty: Transaction[] = [];
export function ExpensesPage() {
  const { data } = useStore();
  return <ExpensePeriodView key={data.activeYear} />;
}
function ExpensePeriodView() {
  const { data, update, modelFor } = useStore();
  const all = data.transactions ?? empty;
  const currentMonth = todayYm();
  const calendarYear = currentMonth.slice(0, 4);
  const years = [...new Set([calendarYear, ...Object.keys(data.years), ...all.map((t) => t.date.slice(0, 4))])].sort().reverse();
  const currentYear = String(data.activeYear);
  const latest = all
    .filter((t) => !t.excludedFromSpend && t.date.startsWith(currentYear))
    .map((t) => t.date.slice(0, 7))
    .sort()
    .at(-1);
  const [period, setPeriod] = useState(
    latest || (calendarYear === currentYear ? currentMonth : currentYear),
  );
  const [account, setAccount] = useState('');
  const [mask, setMask] = usePref('expenses.mask', 'show', ['show', 'hide'] as const);
  const hidden = mask === 'hide';
  const [hours, setHours] = useState('42');
  const [chartMode, setChartMode] = useState<ExpenseChartMode>('budget');
  const [table, setTable] = useState<CsvTable | null>(null);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const model = modelFor(Number(period.slice(0, 4)));
  const scoped = useMemo(() => all.filter((t) => !account || (t.accountId ?? 'legacy') === account), [all, account]);
  const summary = useMemo(() => expensePeriod(model?.budget ?? [], scoped, period), [model, scoped, period]);
  const hrs = Number(hours.replace(',', '.'));
  const wage = model ? Math.max(0, model.salary.regularNet - (model.plan.salary.expenseAllowance?.monthly ?? 0)) : 0;
  const hourly = hrs > 0 && hrs <= 168 ? (wage * 12) / (52 * hrs) : 0;

  async function loadFile(file: File) {
    const version = ++revision.current;
    setMessage('');
    setTable(null);
    try {
      const bytes = await file.arrayBuffer();
      if (version !== revision.current) return;
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        text = new TextDecoder('windows-1252').decode(bytes);
      }
      const parsed = parseCsv(text);
      setTable(parsed.rows.length ? parsed : null);
      if (!parsed.rows.length) setMessage('In der Datei wurden keine Buchungen gefunden.');
    } catch {
      if (version === revision.current) {
        setTable(null);
        setMessage('Die CSV-Datei konnte nicht gelesen werden.');
      }
    }
  }
  function confirmImport(preview: ParsedTransaction[], added: number) {
    const importedYears = preview.map((t) => t.date.slice(0, 4)).sort();
    setPeriod(importedYears.includes(currentYear) ? currentYear : (importedYears.at(-1) ?? currentYear));
    setTable(null);
    setAccount('');
    setMessage(
      added === 0
        ? 'Keine neuen Buchungen. Vorhandene Kontozuordnungen wurden geprüft.'
        : added + (added === 1 ? ' Buchung übernommen.' : ' Buchungen übernommen.'),
    );
  }
  function assign(t: Transaction, item: string) {
    update((d) => {
      const key = merchantKey(t.text),
        cat = t.category?.trim().toLowerCase();
      let rules = d.rules ?? [];
      if (key) rules = [...rules.filter((r) => r.field === 'category' || r.match !== key), { match: key, item }];
      if (cat && !rules.some((r) => r.field === 'category' && r.match === cat))
        rules = [...rules, { field: 'category', match: cat, item }];
      d.rules = rules;
      d.transactions = (d.transactions ?? []).map((row) => {
        if (row.id === t.id) return { ...row, item };
        if (row.excludedFromSpend || row.item || row.amount >= 0) return row;
        const hit = applyRules(row.text, rules, row.category);
        return hit ? { ...row, item: hit } : row;
      });
    });
  }
  const periods = years.flatMap((y) => [
    { value: y, label: 'Ganzes Jahr ' + y },
    ...MONTHS.map((m) => {
      const key = y + '-' + String(m).padStart(2, '0');
      return { value: key, label: periodLabel(key) };
    }),
  ]);
  return (
    <div className="expense-page">
      <header className="ex-pagehead">
        <h1>Ausgaben</h1>
        <div className="ex-actions">
          <button
            type="button"
            className="ex-iconbutton"
            aria-pressed={hidden}
            aria-label={hidden ? 'Beträge anzeigen' : 'Beträge verbergen'}
            onClick={() => setMask(hidden ? 'show' : 'hide')}
          >
            <ExpenseIcon type={hidden ? 'hidden' : 'visible'} />
          </button>
          <button
            type="button"
            className="ex-import"
            aria-label="CSV importieren"
            onClick={() => fileInput.current?.click()}
          >
            <ExpenseIcon type="import" />
            CSV
          </button>
          <input
            className="hidden"
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      {message && (
        <p role="status" className="ex-message">
          {message}
        </p>
      )}
      {table && (
        <Suspense fallback={<p role="status" className="text-sm text-muted">Importvorschau wird geladen …</p>}>
          <BankImportPreview
            key={revision.current}
            table={table}
            hiddenAmounts={hidden}
            confirm={confirmImport}
            cancel={() => setTable(null)}
          />
        </Suspense>
      )}
      <div className="ex-filters">
        <div className="ex-period-controls">
          <Select ariaLabel="Zeitraum der Ausgaben" value={period} onChange={setPeriod} options={periods} />
          <button type="button" className="ex-current-month" aria-pressed={period === currentMonth}
            onClick={() => setPeriod(todayYm())}>Diesen Monat</button>
        </div>
        {(data.importAccounts?.some((a) => a.type !== 'depot') || all.length > 0) && (
          <Select
            ariaLabel="Buchungen nach Konto filtern"
            value={account}
            onChange={setAccount}
            options={[
              { value: '', label: 'Alle Konten' },
              ...(data.importAccounts ?? [])
                .filter((a) => a.type !== 'depot')
                .map((a) => ({ value: a.id, label: bankLabel(a.bankId) + ' · ' + accountDisplayName(a) })),
              ...(all.some((t) => !t.accountId) ? [{ value: 'legacy', label: 'Ohne Kontozuordnung' }] : []),
            ]}
          />
        )}
      </div>
      <MerchantActivity
        key={period + '|' + account}
        transactions={summary.entries}
        accounts={data.importAccounts ?? []}
        hidden={hidden}
        hourly={hourly}
        budgetNames={[...new Set((model?.budget ?? []).map((b) => b.name))]}
        assign={assign}
        chart={
          <ExpenseChart
            mode={chartMode}
            setMode={setChartMode}
            period={period}
            summary={summary}
            hasPlan={Boolean(model)}
            hidden={hidden}
            singleAccount={Boolean(account)}
            setPeriod={setPeriod}
          />
        }
      />
      {all.length > 0 && (
        <details className="ex-tools">
          <summary>Darstellung &amp; Importdaten</summary>
          <div>
            <label>
              Arbeitszeit pro Woche{' '}
              <input
                aria-label="Arbeitszeit pro Woche"
                type="number"
                min="1"
                max="168"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />{' '}
              h
            </label>
            <p>
              Die Arbeitszeit je Buchung basiert auf deinem regulären Nettolohn ohne Spesen und dieser
              Wochenarbeitszeit.
            </p>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Alle importierten Bankbuchungen und Budget-Zuordnungsregeln löschen?')) return;
                update((d) => {
                  delete d.transactions;
                  delete d.rules;
                });
                setAccount('');
                setPeriod(currentYear);
                setMessage('Bankbuchungen und Budgetregeln gelöscht.');
              }}
            >
              Alle Bankbuchungen und Budgetregeln löschen
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
