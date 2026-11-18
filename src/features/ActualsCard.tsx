import { useMemo, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { Button, Card, Money, Select, cx } from './shared';
import { parseCsv, type ParsedTransaction, type CsvTable } from '../domain/bankCsv';
import { BankImportPreview } from './BankImportPreview';
import { MerchantActivity } from './MerchantActivity';
import { bankLabel } from '../domain/importAccounts';
import { applyRules, compareMonth, merchantKey, mergeTransactions } from '../domain/actuals';
import { MONTH_NAMES, type Transaction } from '../domain/types';
import { CATEGORY_COLORS } from './charts';

const ymLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Soll/Ist: Bank-CSV importieren, Buchungen Budgetposten zuordnen, pro Monat vergleichen. */
export function ActualsCard() {
  const { data, update, model } = useStore();
  const allTransactions = data.transactions ?? [];
  const [accountFilter, setAccountFilter] = useState('all');
  const transactions = allTransactions.filter(t => accountFilter === 'all' || (t.accountId ?? 'legacy') === accountFilter);
  const rules = data.rules ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const revision = useRef(0);
  const [message, setMessage] = useState<string | null>(null);
  const [showOpen, setShowOpen] = useState(false);

  const months = useMemo(() => [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(), [transactions]);
  const [month, setMonth] = useState<string | null>(null);
  const ym = month && months.includes(month) ? month : months[0];
  const itemNames = [...new Set(model.budget.map((b) => b.name))];

  const onFile = async (file: File) => {
    setMessage(null);
    const version = ++revision.current;
    try {
      const bytes = await file.arrayBuffer();
      if (version !== revision.current) return;
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { text = new TextDecoder('windows-1252').decode(bytes); }
      const t = parseCsv(text);
      if (!t.rows.length) { setTable(null); setMessage('In der Datei wurden keine Buchungen gefunden.'); return; }
      setUploadKey(version);
      setTable(t);
    } catch { if (version === revision.current) { setTable(null); setMessage('Die CSV-Datei konnte nicht gelesen werden.'); } }
  };

  const confirmImport = (preview: ParsedTransaction[]) => {
    const { added } = mergeTransactions(allTransactions, preview, rules);
    update(d => { d.transactions = mergeTransactions(d.transactions ?? [], preview, d.rules ?? []).list; });
    setTable(null);
    setMonth(null);
    setAccountFilter('all');
    setMessage(added === 0 ? 'Keine neuen Buchungen. Vorhandene Kontozuordnungen wurden geprüft.' : `${added} Buchungen übernommen.`);
  };

  const assign = (t: Transaction, item: string, remember: boolean) =>
    update((d) => {
      const key = merchantKey(t.text);
      const cat = t.category?.trim().toLowerCase();
      let rules = d.rules ?? [];
      if (remember && key) rules = [...rules.filter((r) => r.field === 'category' || r.match !== key), { match: key, item }];
      // Bank-Kategorie (z. B. «Lebensmittel») nur merken, wenn es dafür noch keine Regel gibt
      if (remember && cat && !rules.some((r) => r.field === 'category' && r.match === cat)) rules = [...rules, { match: cat, item, field: 'category' }];
      d.rules = rules;
      d.transactions = (d.transactions ?? []).map((x) => {
        if (x.id === t.id) return { ...x, item };
        if (!remember || x.excludedFromSpend || x.item || x.amount >= 0) return x;
        const hit = applyRules(x.text, rules, x.category);
        return hit ? { ...x, item: hit } : x;
      });
    });

  const c = ym ? compareMonth(model.budget, transactions, ym) : null;
  const open = ym ? transactions.filter((t) => t.date.startsWith(ym) && t.amount < 0 && !t.item && !t.excludedFromSpend) : [];


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

      {table && <BankImportPreview key={uploadKey} table={table} confirm={confirmImport} cancel={() => setTable(null)} />}
      {allTransactions.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span>Konto</span><Select ariaLabel="Buchungen nach Konto filtern" className="max-w-full" value={accountFilter}
          options={[{ value: 'all', label: 'Alle Konten' }, ...(data.importAccounts ?? []).filter(a => a.type !== 'depot').map(a => ({ value: a.id, label: bankLabel(a.bankId) + ' · ' + a.name })), ...(allTransactions.some(t => !t.accountId) ? [{ value: 'legacy', label: 'Ohne Kontozuordnung' }] : [])]}
          onChange={setAccountFilter} />
      </div>}
      {transactions.length > 0 && <MerchantActivity transactions={transactions} accounts={data.importAccounts ?? []} />}
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
                    <span>
                      {t.date.slice(8, 10)}.{t.date.slice(5, 7)}.{t.category ? ` · ${t.category}` : ''}
                    </span>
                    <Select
                      ariaLabel="Budgetposten"
                      value=""
                      options={[{ value: '', label: 'Posten wählen …' }, ...itemNames.map((n) => ({ value: n, label: n }))]}
                      onChange={(v) => v && assign(t, v, true)}
                    />
                  </div>
                </li>
              ))}
              <li className="pt-2 text-xs text-muted">Frank merkt sich den Händler und die Kategorie der Bank und ordnet gleiche Buchungen künftig selbst zu.</li>
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
