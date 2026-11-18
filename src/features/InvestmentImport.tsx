import { useMemo, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { parseCsv, type CsvTable } from '../domain/bankCsv';
import { investmentKinds, investmentSources, parseInvestmentTable, type InvestmentTransaction } from '../domain/investCsv';
import { AccountTargetSelect, BankMark } from './AccountTargetSelect';
import { bankLabel } from '../domain/importAccounts';
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

export function InvestmentImport() {
  const { data, update } = useStore();
  const [importing, setImporting] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [filter, setFilter] = useState('');
  const [source, setSource] = useState<string | undefined>();
  const [file, setFile] = useState<{ table: CsvTable; sources: string[] } | null>(null);
  const [message, setMessage] = useState('');
  const revision = useRef(0);
  const depots = (data.importAccounts ?? []).filter(a => a.type === 'depot');
  const selected = depots.find(a => a.id === accountId);
  const preview = useMemo(() => {
    if (!file || (file.sources.length > 1 && source === undefined)) return null;
    try { return parseInvestmentTable(file.table, accountId, data.investmentTransactions ?? [], source); }
    catch (error) { return error instanceof Error ? error.message : 'Diese CSV konnte nicht gelesen werden.'; }
  }, [file, accountId, data.investmentTransactions, source]);
  const load = async (input: File) => {
    const token = ++revision.current;
    setMessage(''); setFile(null); setSource(undefined);
    try {
      const bytes = await input.arrayBuffer();
      if (token !== revision.current) return;
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { text = new TextDecoder('windows-1252').decode(bytes); }
      const table = parseCsv(text);
      if (!table.rows.length) throw new Error('Die CSV enthält keine Buchungen.');
      const sources = investmentSources(table);
      setFile({ table, sources });
      if (sources.length === 1) setSource(sources[0]);
    } catch (error) {
      if (token === revision.current) setMessage(error instanceof Error ? error.message : 'Datei konnte nicht gelesen werden.');
    }
  };
  const close = () => { revision.current++; setFile(null); setImporting(false); setSource(undefined); };
  const confirm = () => {
    if (!file || !selected || !preview || typeof preview === 'string' || !preview.rows.length) return;
    update(d => {
      if (!d.importAccounts?.some(a => a.id === accountId && a.type === 'depot')) return;
      const { rows } = parseInvestmentTable(file.table, accountId, d.investmentTransactions ?? [], source);
      d.investmentTransactions = [...(d.investmentTransactions ?? []), ...rows];
    });
    setFilter(accountId); setMessage(`${preview.rows.length} Buchungen für ${selected.name} übernommen.`); close();
  };
  const entries = (data.investmentTransactions ?? []).filter(e => !filter || e.accountId === filter).sort((a, b) => b.date.localeCompare(a.date));
  const totals = { buy: 0, sell: 0, dividend: 0 };
  for (const e of entries) totals[e.kind] += Math.abs(e.amount);
  return <Card className="mt-4" title="Depotbuchungen" action={!importing && <Button onClick={() => { setMessage(''); setAccountId(filter); setImporting(true); }}>Anlage-CSV importieren</Button>}>
    {message && <p role="status" className="mb-2 text-sm text-accent">{message}</p>}
    {importing && <div className="mb-3 space-y-3 rounded-xl bg-panel-2 p-3 text-sm">
      <AccountTargetSelect kind="invest" value={accountId} onChange={setAccountId} label="Zieldepot" />
      <label className="block">Transaktionsauszug
        <input className="mt-1 block w-full rounded-lg border border-line p-2 text-xs" type="file" accept=".csv,.txt,text/csv" onChange={e => {
          const input = e.target.files?.[0]; if (input) void load(input);
          e.currentTarget.value = '';
        }} />
      </label>
      <details className="text-xs text-muted"><summary className="cursor-pointer py-1">Unterstützte Spalten</summary>
        <p>Datum, Typ (Kauf, Verkauf oder Dividende), Wertpapier/ISIN/Symbol und Betrag. Für Fremdwährungen braucht es den abgerechneten «Betrag CHF». Fehlt eine Währungsangabe, gilt CHF. Broker-ID und Stückzahl sind optional.</p>
      </details>
      {file && file.sources.length > 1 && <label className="block">Quelldepot in dieser Datei
        <Select ariaLabel="Quelldepot" value={source === undefined ? -1 : file.sources.indexOf(source)} onChange={i => setSource(file.sources[i])}
          options={[{ value: -1, label: 'Quelldepot wählen …' }, ...file.sources.map((value, i) => ({ value: i, label: `${i + 1} · ${value ? '…' + value.slice(-4) : 'Ohne Kennung'}` }))]} />
      </label>}
      {typeof preview === 'string' && <p role="alert" className="text-warn">{preview}</p>}
      {preview && typeof preview !== 'string' && <div><strong>{preview.rows.length} neue Depotbuchungen</strong>
        <Bookings entries={preview.rows.slice(0, 5)} accounts={depots} />
        {preview.rows.length > 5 && <p className="text-xs text-muted">Vorschau der ersten fünf Buchungen</p>}
        {!!preview.skipped.size && <p className="mt-1 text-xs text-muted">Übersprungen · {[...preview.skipped].map(([reason, count]) => `${count} ${reason}`).join(' · ')}</p>}
      </div>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={close}>Abbrechen</Button>
        {selected && preview && typeof preview !== 'string' && preview.rows.length > 0 && <Button variant="primary" onClick={confirm}>Buchungen übernehmen</Button>}
      </div>
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
