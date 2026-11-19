import { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { guessColumns, inspectBankRows, type ColumnMap, type CsvTable, type ParsedTransaction } from '../domain/bankCsv';
import { describeAccountSources } from '../domain/accountRecognition';
import { mergeTransactions } from '../domain/actuals';
import { saveImportTargets, targetProblem, useImportTargets } from './useImportTargets';
import { movementType, sourceLabel } from '../domain/importAccounts';
import { AccountTargetSelect } from './AccountTargetSelect';
import { Button, Money, Select } from './shared';

export function BankImportPreview({ table, cancel, confirm, hiddenAmounts = false }: {
  table: CsvTable; hiddenAmounts?: boolean; cancel: () => void; confirm: (rows: ParsedTransaction[], added: number) => void;
}) {
  const [map, setMap] = useState(() => guessColumns(table.header));
  const parsed = useMemo(() => inspectBankRows(table, map), [table, map]);
  const { data, update } = useStore();
  const [omitted, setOmitted] = useState(new Set<string>());
  const [countAsSpending, setCountAsSpending] = useState(new Set<string>());
  const sources = useMemo(() => [...new Set(parsed.entries.map(e => e.source))], [parsed]);
  // Editing an amount or text column keeps the reviewed targets when the source list stays the same.
  const sourceKey = JSON.stringify(sources);
  const descriptions = useMemo(() => describeAccountSources(table, JSON.parse(sourceKey) as string[], 'expenses', map.source),
    [table, sourceKey, map.source]);
  const { targets, recognition, select } = useImportTargets(data, descriptions, 'expenses');
  const enabled = targets.filter(t => !omitted.has(t.source));
  const issue = targetProblem(enabled, data.importAccounts);
  const valid = enabled.length > 0 && !issue && enabled.every(t => t.selected?.name.trim() && t.selected.bankId.trim());
  const accountIds = new Map(enabled.map(t => [t.source, t.selected?.id]));
  const kinds = new Map<string, number>();
  const txs: ParsedTransaction[] = [];
  for (const { source, transaction } of parsed.entries) {
    if (omitted.has(source)) continue;
    const classification = movementType(transaction.category, transaction.text);
    if (classification) kinds.set(classification, (kinds.get(classification) ?? 0) + 1);
    txs.push({ ...transaction, accountId: accountIds.get(source),
      ...(classification && !countAsSpending.has(classification) && { excludedFromSpend: true }) });
  }
  const duplicates = valid && data.transactions?.length ? txs.length - mergeTransactions(data.transactions ?? [], txs, data.rules ?? []).added : 0;
  const finish = () => {
    if (!valid || !recognition || !txs.length) return;
    update(draft => {
      const {list, added} = mergeTransactions(draft.transactions ?? [], txs, draft.rules ?? []);
      saveImportTargets(draft, recognition, enabled);
      draft.transactions = list;
      confirm(txs, added);
    });
  };
  const colOptions = table.header.map((h, i) => ({ value: i, label: h || `Spalte ${i + 1}` }));
  const col = (field: keyof ColumnMap, label: string, optional = false) => (
    <label className="flex flex-wrap items-center justify-between gap-1">
      <span className="text-muted">{label}</span>
      <Select className="max-w-full" value={map[field] ?? -1}
        options={optional ? [{ value: -1, label: 'keine' }, ...colOptions] : colOptions}
        onChange={n => setMap({ ...map, [field]: n < 0 ? undefined : n })} />
    </label>
  );
  return <div className="mb-4 space-y-4 rounded-xl bg-panel-2 p-3 text-sm">
    <details><summary className="cursor-pointer font-medium">CSV-Spalten prüfen</summary><div className="mt-2 space-y-2">
      {col('date', 'Datum')}{col('text', 'Text')}{col('category', 'Kategorie der Bank', true)}
      {col('source', 'Konto- oder Kartenkennung', true)}{col('currency', 'Währung', true)}{col('direction', 'Einnahme / Ausgabe', true)}
      {map.amount !== undefined ? col('amount', 'Betrag (+/−)') : <>{col('debit', 'Belastung', true)}{col('credit', 'Gutschrift', true)}</>}
      <button type="button" className="text-xs text-muted underline" onClick={() => setMap(map.amount !== undefined
        ? { ...map, amount: undefined, debit: map.amount, credit: undefined }
        : { ...map, amount: map.debit ?? 0, debit: undefined, credit: undefined })}>
        {map.amount !== undefined ? 'Belastung und Gutschrift sind getrennte Spalten' : 'Betrag steht in einer Spalte'}</button>
    </div></details>
    <div className="space-y-2">
      {sources.length > 1 && <p>Ordne jede Quelle ihrem Bank- oder Kartenkonto zu. Du kannst einzelne Quellen überspringen.</p>}
      {!recognition && <p role="status" className="text-xs text-muted">Kontokennung wird geprüft …</p>}
      {targets.map((target, i) => { const {source} = target; return <div key={source} className="space-y-1 rounded-lg border border-line p-2.5">
        {!omitted.has(source) && <AccountTargetSelect kind="expenses" label={sourceLabel(source, i)}
          target={target} onChange={account => select(source, account)} />}
        {sources.length > 1 && <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={omitted.has(source)} onChange={e => {
            const next = new Set(omitted); if (e.target.checked) next.add(source); else next.delete(source); setOmitted(next);
          }} />{omitted.has(source) ? sourceLabel(source, i) + ' überspringen' : 'Quelle überspringen'}
        </label>}
      </div>; })}
      {issue && <p role="alert" className="text-warn">{issue}</p>}
    </div>
    {kinds.size > 0 && <fieldset className="space-y-1"><legend className="mb-1 font-medium">Welche Geldbewegungen sollen ins Soll/Ist?</legend>
      <p className="text-xs text-muted">Ohne Häkchen werden diese Buchungen gespeichert und bei den Einnahmen und Ausgaben ausgeklammert.</p>
      {[...kinds].map(([kind, count]) => <label key={kind} className="flex items-center gap-2"><input type="checkbox" checked={countAsSpending.has(kind)}
        onChange={e => { const next = new Set(countAsSpending); if (e.target.checked) next.add(kind); else next.delete(kind); setCountAsSpending(next); }} />
        {kind} einrechnen ({count})</label>)}
    </fieldset>}
    {(parsed.invalid > 0 || parsed.foreign > 0) && <p className="text-xs text-warn">Übersprungen · {parsed.invalid} unlesbare oder leere Buchungen · {parsed.foreign} ohne CHF-Betrag</p>}
    <ul className="divide-y divide-line text-xs">{txs.slice(0, 4).map((t, i) => <li key={i} className="flex justify-between gap-2 py-1">
      <span className="min-w-0 truncate text-muted">{t.date} · {hiddenAmounts ? 'Buchung' : t.text}</span>{hiddenAmounts ? <span>••••</span> : <Money className="shrink-0" value={t.amount} signed />}
    </li>)}</ul>
    {duplicates > 0 && <p className="text-xs text-muted">{duplicates} bereits erfasst · {txs.length - duplicates} neu</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button onClick={cancel} variant="ghost">Abbrechen</Button>
      <button type="button" disabled={!valid || txs.length === 0} onClick={finish} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-bg disabled:opacity-40">
        {txs.length} {txs.length === 1 ? 'Buchung' : 'Buchungen'} übernehmen</button>
    </div>
  </div>;
}
