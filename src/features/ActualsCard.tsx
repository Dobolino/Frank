import { useMemo, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { Button, Card, Money, Select, cx } from './shared';
import { guessColumns, parseCsv, toTransactions, type ColumnMap, type CsvTable } from '../domain/bankCsv';
import { applyRules, compareMonth, merchantKey, mergeTransactions } from '../domain/actuals';
import { MONTH_NAMES, type Transaction } from '../domain/types';
import { CATEGORY_COLORS } from './charts';

const ymLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Soll/Ist: Bank-CSV importieren, Buchungen Budgetposten zuordnen, pro Monat vergleichen. */
export function ActualsCard() {
  const { data, update, model } = useStore();
  const transactions = data.transactions ?? [];
  const rules = data.rules ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showOpen, setShowOpen] = useState(false);

  const months = useMemo(() => [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(), [transactions]);
  const [month, setMonth] = useState<string | null>(null);
  const ym = month && months.includes(month) ? month : months[0];
  const itemNames = [...new Set(model.budget.map((b) => b.name))];

  const onFile = async (file: File) => {
    setMessage(null);
    const t = parseCsv(await file.text());
    if (t.rows.length === 0) {
      setMessage('In der Datei wurden keine Buchungen gefunden.');
      return;
    }
    setTable(t);
    setMap(guessColumns(t.header));
  };

  const preview = table && map ? toTransactions(table, map) : [];

  const confirmImport = () => {
    const { added } = mergeTransactions(transactions, preview, rules);
    update((d) => void (d.transactions = mergeTransactions(d.transactions ?? [], preview, d.rules ?? []).list));
    setTable(null);
    setMap(null);
    setMonth(null);
    setMessage(added === 0 ? 'Keine neuen Buchungen, alle waren schon importiert.' : `${added} Buchungen übernommen.`);
  };

  const assign = (t: Transaction, item: string, remember: boolean) =>
    update((d) => {
      const key = merchantKey(t.text);
      if (remember && key) d.rules = [...(d.rules ?? []).filter((r) => r.match !== key), { match: key, item }];
      d.transactions = (d.transactions ?? []).map((x) =>
        x.id === t.id ? { ...x, item } : remember && key && !x.item && x.amount < 0 && applyRules(x.text, [{ match: key, item }]) ? { ...x, item } : x,
      );
    });

  const c = ym ? compareMonth(model.budget, transactions, ym) : null;
  const open = ym ? transactions.filter((t) => t.date.startsWith(ym) && t.amount < 0 && !t.item) : [];
  const colOptions = (table?.header ?? []).map((h, i) => ({ value: i, label: h || `Spalte ${i + 1}` }));

  return (
    <Card
      title="Soll / Ist"
      action={
        <div className="flex items-center gap-2">
          {months.length > 0 && ym && (
            <Select ariaLabel="Monat" value={ym} options={months.map((m) => ({ value: m, label: ymLabel(m) }))} onChange={setMonth} />
          )}
          <Button onClick={() => fileRef.current?.click()}>CSV importieren</Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
        </div>
      }
    >
      {message && <p className="mb-3 text-sm text-accent">{message}</p>}

      {table && map && (
        <div className="mb-4 space-y-2 rounded-xl bg-panel-2 p-3 text-sm">
          <div className="font-medium">Spalten prüfen</div>
          <label className="flex items-center justify-between gap-3">
            <span className="text-muted">Datum</span>
            <Select value={map.date} options={colOptions} onChange={(v) => setMap({ ...map, date: v })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-muted">Text</span>
            <Select value={map.text} options={colOptions} onChange={(v) => setMap({ ...map, text: v })} />
          </label>
          {map.amount !== undefined ? (
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted">Betrag (+/−)</span>
              <Select value={map.amount} options={colOptions} onChange={(v) => setMap({ ...map, amount: v })} />
            </label>
          ) : (
            <>
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted">Belastung</span>
                <Select value={map.debit ?? 0} options={colOptions} onChange={(v) => setMap({ ...map, debit: v })} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted">Gutschrift</span>
                <Select value={map.credit ?? 0} options={colOptions} onChange={(v) => setMap({ ...map, credit: v })} />
              </label>
            </>
          )}
          <button
            className="text-xs text-muted underline"
            onClick={() =>
              setMap(map.amount !== undefined ? { date: map.date, text: map.text, debit: map.amount, credit: map.amount } : { date: map.date, text: map.text, amount: map.debit ?? 0 })
            }
          >
            {map.amount !== undefined ? 'Belastung und Gutschrift sind getrennte Spalten' : 'Betrag steht in einer Spalte'}
          </button>
          <ul className="divide-y divide-line text-xs">
            {preview.slice(0, 4).map((t, i) => (
              <li key={i} className="flex justify-between gap-2 py-1">
                <span className="truncate text-muted">{t.date} · {t.text}</span>
                <span className={cx('num shrink-0', t.amount < 0 ? 'text-text' : 'text-accent')}><Money value={t.amount} /></span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setTable(null)}>Abbrechen</Button>
            <Button variant="primary" onClick={confirmImport}>{preview.length} Buchungen übernehmen</Button>
          </div>
        </div>
      )}

      {!c ? (
        <p className="text-sm text-muted">
          Exportiere im E-Banking die Kontobewegungen als CSV und importiere sie hier. Frank ordnet sie deinen Budgetposten zu und zeigt pro Monat, wo du darüber liegst. Die Datei bleibt auf dem Gerät.
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted">Budget</div>
              <div className="num font-semibold"><Money value={c.planTotal} decimals={false} /></div>
            </div>
            <div>
              <div className="text-xs text-muted">Ausgegeben</div>
              <div className={cx('num font-semibold', c.actualTotal > c.planTotal ? 'text-danger' : 'text-accent')}><Money value={c.actualTotal} decimals={false} /></div>
            </div>
            <div>
              <div className="text-xs text-muted">Eingänge</div>
              <div className="num font-semibold"><Money value={c.income} decimals={false} /></div>
            </div>
          </div>
          <ul className="space-y-2.5">
            {c.rows
              .slice()
              .sort((a, b) => b.actual - b.plan - (a.actual - a.plan))
              .map((r) => {
                const over = r.actual > r.plan;
                const scale = Math.max(r.plan, r.actual, 1);
                return (
                  <li key={r.name} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      <span className="num shrink-0">
                        <span className={over ? 'text-danger' : ''}><Money value={r.actual} decimals={false} /></span>
                        <span className="text-muted"> / <Money value={r.plan} decimals={false} /></span>
                      </span>
                    </div>
                    <div className="relative mt-1 h-1.5 rounded-full bg-panel-2">
                      <div className="h-1.5 rounded-full" style={{ width: `${(r.actual / scale) * 100}%`, background: over ? 'var(--color-danger)' : CATEGORY_COLORS[r.category] }} />
                      {r.plan > 0 && <div aria-hidden className="absolute top-[-2px] h-2.5 w-0.5 bg-text/70" style={{ left: `calc(${(r.plan / scale) * 100}% - 1px)` }} />}
                    </div>
                  </li>
                );
              })}
          </ul>
          {c.unassignedCount > 0 && (
            <button className="mt-4 w-full rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-left text-sm" onClick={() => setShowOpen(!showOpen)}>
              <span className="text-warn">{c.unassignedCount === 1 ? '1 Buchung' : `${c.unassignedCount} Buchungen`} ohne Posten</span> · <Money value={c.unassigned} decimals={false} />
              <span className="float-right text-muted">{showOpen ? 'zuklappen' : 'zuordnen'}</span>
            </button>
          )}
          {showOpen && open.length > 0 && (
            <ul className="mt-2 divide-y divide-line text-sm">
              {open.map((t) => (
                <li key={t.id} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{t.text || 'ohne Text'}</span>
                    <span className="num shrink-0"><Money value={-t.amount} /></span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{t.date.slice(8, 10)}.{t.date.slice(5, 7)}.</span>
                    <Select
                      ariaLabel="Budgetposten"
                      value=""
                      options={[{ value: '', label: 'Posten wählen …' }, ...itemNames.map((n) => ({ value: n, label: n }))]}
                      onChange={(v) => v && assign(t, v, true)}
                    />
                  </div>
                </li>
              ))}
              <li className="pt-2 text-xs text-muted">Frank merkt sich die Zuordnung und ordnet gleiche Händler künftig selbst zu.</li>
            </ul>
          )}
          <div className="mt-4 flex justify-between text-xs text-muted">
            <span>{transactions.length} Buchungen · {rules.length} Regeln</span>
            <button
              className="underline"
              onClick={() => {
                if (window.confirm('Alle importierten Buchungen und Regeln löschen?')) update((d) => void ((d.transactions = undefined), (d.rules = undefined)));
              }}
            >
              Buchungen löschen
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
