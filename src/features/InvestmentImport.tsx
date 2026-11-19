import { useMemo, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { parseCsv, type CsvTable } from '../domain/bankCsv';
import { investmentKinds, investmentSources, parseInvestmentTable, type InvestmentTransaction } from '../domain/investCsv';
import { AccountTargetSelect, BankMark } from './AccountTargetSelect';
import { bankLabel, sourceLabel } from '../domain/importAccounts';
import { describeAccountSources } from '../domain/accountRecognition';
import { useImportTargets, saveImportTargets, targetProblem } from './useImportTargets';
import type { ImportAccount } from '../domain/types';
import { Button, Card, Money, Select } from './shared';

function Bookings({ entries, accounts }: { entries: InvestmentTransaction[]; accounts: ImportAccount[] }) {
  return <ul className="divide-y divide-line text-sm">
    {entries.map((entry, index) => {
      const account = accounts.find(a => a.id === entry.accountId);
      return <li key={index} className="flex items-center gap-2 py-2">
        {account && <BankMark bankId={account.bankId} size={28} />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{entry.security}</div>
          <div className="text-xs text-muted">{entry.date.split('-').reverse().join('.')} · {investmentKinds[entry.kind]}{entry.quantity !== undefined && ` · ${entry.quantity.toLocaleString('de-CH', { maximumFractionDigits: 8 })} Stk.`}</div>
          {account && <div className="truncate text-xs text-muted">{bankLabel(account.bankId)} · {account.name}</div>}
        </div>
        <div className="shrink-0"><Money value={entry.amount} signed /></div>
      </li>;
    })}
  </ul>;
}

function DepotPreview({ table, close, done }: {
  table: CsvTable; close: () => void; done: (count: number, id?: string) => void;
}) {
  const { data, update } = useStore();
  const sources = useMemo(() => {
    const present = investmentSources(table);
    return present.length ? present : [''];
  }, [table]);
  const descriptions = useMemo(() => describeAccountSources(table, sources, 'invest'), [table, sources]);
  const { targets, select, recognition } = useImportTargets(data, descriptions, 'invest');
  const [omitted, setOmitted] = useState(new Set<string>());
  const enabled = targets.filter(t => !omitted.has(t.source));
  const issue = targetProblem(enabled, data.importAccounts);
  const valid = !issue && enabled.every(t => t.selected?.name.trim() && t.selected.bankId.trim());
  const previews = enabled.map(target => {
    try {
      const result = parseInvestmentTable(table, target.selected?.id ?? '', data.investmentTransactions ?? [], target.source);
      return { target, ...result };
    } catch (e) {
      return { target, rows: [], skipped: new Map<string, number>(), error: e instanceof Error ? e.message : 'Diese CSV konnte nicht gelesen werden.' };
    }
  });
  const rows = previews.flatMap(p => p.rows);
  const skipped = new Map<string, number>();
  for (const preview of previews) {
    for (const [reason, count] of preview.skipped) skipped.set(reason, (skipped.get(reason) ?? 0) + count);
  }
  const error = previews.find(p => p.error)?.error;
  const needsBinding = previews.some(({target, skipped}) => target.canRemember && target.selected
    && target.selected.id !== target.proposed.id && target.matchedId !== target.selected.id
    && (skipped.get('bereits vorhanden') ?? 0) > 0);
  const canConfirm = valid && !error && (rows.length > 0 || needsBinding);

  const confirm = () => {
    if (!recognition || !canConfirm) return;
    update(draft => {
      const booked: typeof targets = [];
      const added: InvestmentTransaction[] = [];
      for (const target of enabled) {
        const parsed = parseInvestmentTable(table, target.selected!.id, draft.investmentTransactions ?? [], target.source);
        const hasExisting = target.selected!.id !== target.proposed.id && (parsed.skipped.get('bereits vorhanden') ?? 0) > 0;
        if (parsed.rows.length || hasExisting) {
          booked.push(target);
          for (const entry of parsed.rows) added.push(entry);
        }
      }
      saveImportTargets(draft, recognition, booked);
      draft.investmentTransactions = [...(draft.investmentTransactions ?? []), ...added];
      done(added.length, booked.length === 1 ? booked[0]?.selected?.id : undefined);
    });
  };
  return <>
    {!recognition && <p className="text-xs text-muted" role="status">Kontokennung wird geprüft …</p>}
    {targets.map((target, i) => <div key={target.source} className="space-y-2 rounded-lg border border-line p-2">
      {!omitted.has(target.source) && <AccountTargetSelect kind="invest" target={target} onChange={account => select(target.source, account)}
        label={target.source ? sourceLabel(target.source, i) : 'Zieldepot'} />}
      {sources.length > 1 && <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={omitted.has(target.source)} onChange={e => {
          const next = new Set(omitted);
          if (e.target.checked) next.add(target.source); else next.delete(target.source);
          setOmitted(next);
        }} />{sourceLabel(target.source, i)} überspringen
      </label>}
    </div>)}
    {issue && <p role="alert" className="text-warn">{issue}</p>}
    {error ? <p role="alert" className="text-warn">{error}</p> : recognition && <div>
      <strong>{rows.length} neue Depotbuchungen</strong>
      <Bookings entries={rows.slice(0, 5)} accounts={enabled.flatMap(t => t.selected ? [t.selected] : [])} />
      {rows.length > 5 && <p className="text-xs text-muted">Vorschau der ersten fünf Buchungen</p>}
      {!!skipped.size && <p className="mt-1 text-xs text-muted">Übersprungen · {[...skipped].map(([reason, count]) => `${count} ${reason}`).join(' · ')}</p>}
    </div>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" onClick={close}>Abbrechen</Button>
      <button type="button" className="rounded-lg bg-accent px-3 py-1.5 text-bg disabled:opacity-40"
        disabled={!canConfirm} onClick={confirm}>{needsBinding && !rows.length ? 'Zuordnung merken' : 'Buchungen übernehmen'}</button>
    </div>
  </>;
}

export function InvestmentImport() {
  const { data } = useStore();
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState('');
  const [file, setFile] = useState<CsvTable | null>(null);
  const [message, setMessage] = useState('');
  const revision = useRef(0);
  const depots = (data.importAccounts ?? []).filter(a => a.type === 'depot');
  const load = async (input: File) => {
    const token = ++revision.current;
    setMessage(''); setFile(null);
    try {
      const bytes = await input.arrayBuffer();
      if (token !== revision.current) return;
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { text = new TextDecoder('windows-1252').decode(bytes); }
      const table = parseCsv(text);
      if (!table.rows.length) throw new Error('Die CSV enthält keine Buchungen.');
      setFile(table);
    } catch (error) {
      if (token === revision.current) setMessage(error instanceof Error ? error.message : 'Datei konnte nicht gelesen werden.');
    }
  };
  const close = () => { revision.current++; setFile(null); setImporting(false); };
  const entries = (data.investmentTransactions ?? []).filter(e => !filter || e.accountId === filter).sort((a, b) => b.date.localeCompare(a.date));
  const totals = { buy: 0, sell: 0, dividend: 0 };
  for (const e of entries) totals[e.kind] += Math.abs(e.amount);
  return <Card className="mt-4" title="Depotbuchungen" action={!importing && <Button onClick={() => { setMessage(''); setImporting(true); }}>Anlage-CSV importieren</Button>}>
    {message && <p role="status" className="mb-2 text-sm text-accent">{message}</p>}
    {importing && <div className="mb-3 space-y-3 rounded-xl bg-panel-2 p-3 text-sm">
      <label className="block">Transaktionsauszug
        <input className="mt-1 block w-full rounded-lg border border-line p-2 text-xs" type="file" accept=".csv,.txt,text/csv" onChange={e => {
          const input = e.target.files?.[0]; if (input) void load(input);
          e.currentTarget.value = '';
        }} />
      </label>
      <details className="text-xs text-muted"><summary className="cursor-pointer py-1">Unterstützte Spalten</summary>
        <p>Datum, Typ (Kauf, Verkauf oder Dividende), Wertpapier/ISIN/Symbol und Betrag. Für Fremdwährungen braucht es den abgerechneten «Betrag CHF». Fehlt eine Währungsangabe, gilt CHF. Broker-ID und Stückzahl sind optional.</p>
      </details>
      {file ? <DepotPreview table={file} close={close} done={(count, id) => {
        setFilter(id ?? ''); setMessage(count === 0 ? 'Depotzuordnung gespeichert.' : `${count} ${count === 1 ? 'Depotbuchung' : 'Depotbuchungen'} übernommen.`); close();
      }} /> : <div className="text-right"><Button variant="ghost" onClick={close}>Abbrechen</Button></div>}
    </div>}
    {depots.length > 0 && (data.investmentTransactions?.length ?? 0) > 0 &&
      <Select ariaLabel="Depotbuchungen filtern" value={filter} onChange={setFilter} options={[{ value: '', label: 'Alle Depots' }, ...depots.map(a => ({ value: a.id, label: `${bankLabel(a.bankId)} · ${a.name}` }))]} />}
    {entries.length > 0 ? <>
      <div className="my-3 grid grid-cols-3 gap-2 text-sm">{(Object.keys(investmentKinds) as (keyof typeof investmentKinds)[]).map(kind =>
        <div key={kind}><div className="text-xs text-muted">{({ buy: 'Käufe', sell: 'Verkäufe', dividend: 'Dividenden' })[kind]}</div><Money value={totals[kind]} /></div>)}</div>
      <Bookings entries={entries.slice(0, 6)} accounts={depots} />
      {entries.length > 6 && <details><summary className="cursor-pointer py-2 text-xs text-muted">Weitere {entries.length - 6} Buchungen</summary><Bookings entries={entries.slice(6)} accounts={depots} /></details>}
      <p className="mt-2 text-xs text-muted">Summen in CHF über alle importierten Jahre. Der aktuelle Depotwert ergibt sich aus den erfassten Positionen und Kursen.</p>
    </> : <p className="text-sm text-muted">Hier erscheinen die Käufe, Verkäufe und Dividenden aus deinem Depot-Auszug.</p>}
  </Card>;
}
