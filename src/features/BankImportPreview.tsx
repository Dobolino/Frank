import { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { guessColumns, inspectBankRows, type ColumnMap, type CsvTable, type ParsedTransaction } from '../domain/bankCsv';
import { describeAccountSources } from '../domain/accountRecognition';
import { mergeTransactions } from '../domain/actuals';
import { saveImportTargets, targetProblem, useImportTargets, unknownBank, type ImportTarget } from './useImportTargets';
import { accountDisplayName, movementType, sourceLabel } from '../domain/importAccounts';
import type { ImportAccount, Transaction } from '../domain/types';
import { AccountTargetSelect } from './AccountTargetSelect';
import { Button, Money, Select } from './shared';

// Old imports without a source fingerprint can only safely move when their original
// account was identified. Let the user resolve or acknowledge remaining overlaps.
function hasUnclearOverlap(existing: Transaction[], after: Transaction[], targets: ImportTarget[], accounts: ImportAccount[]) {
  const oldIds = new Set(existing.map(row=>row.id));
  const bank = new Map([...accounts, ...targets.flatMap(t=>t.selected ? [t.selected] : [])].map(a=>[a.id,a.bankId]));
  const identity = (t: Transaction) => JSON.stringify([t.date,t.amount,t.text]);
  const old = new Map<string, Transaction[]>();
  for (const row of existing) {
    if (!row.accountId) continue;
    const key = identity(row);
    const rows = old.get(key);
    if (rows) rows.push(row); else old.set(key,[row]);
  }
  return after.some(row => !oldIds.has(row.id) && !!row.accountId && old.get(identity(row))?.some(prev => {
    if (prev.accountId === row.accountId || (row.sourceFingerprint && prev.sourceFingerprint)) return false;
    const oldBank = bank.get(prev.accountId!), newBank = bank.get(row.accountId!);
    return oldBank === newBank || oldBank === unknownBank || newBank === unknownBank ||
      (newBank === 'yuh' && !row.sourceFingerprint && !prev.sourceFingerprint);
  }));
}

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
  const { targets, shared, recognition, select } = useImportTargets(data, descriptions, 'expenses');
  const [choice, setChoice] = useState<{ key: string; mode: 'one' | 'separate' }>();
  const [acceptedOverlap, setAcceptedOverlap] = useState('');
  const many = sources.length > 1;
  // Opening a mixed-source export must not silently create several accounts.
  const needsChoice = many && targets.filter(t => !t.matchedId).length > 1;
  const mode = many && choice?.key === sourceKey ? choice.mode : needsChoice ? undefined : 'separate';
  const included = targets.filter(target => !omitted.has(target.source));
  const enabled = mode === 'one' && shared
    ? included.map(t => ({ ...t, selected: shared.selected, proposed: shared.proposed }))
    : included;
  const drafts = targets.map(t=>t.proposed).filter(a => targets.some(t=>t.selected?.id === a.id));
  const issue = targetProblem(enabled, data.importAccounts);
  const valid = !!mode && enabled.length > 0 && !issue && enabled.every(t => t.selected?.name.trim() && t.selected.bankId.trim());
  const selectedIds = new Set(enabled.flatMap(t=>t.selected ? [t.selected.id] : []));
  const newCount = [...selectedIds].filter(id => !data.importAccounts?.some(a=>a.id === id)).length;
  const accountIds = new Map(enabled.map(t => [t.source, t.selected?.id]));
  const fingerprints = new Map<string, string>();
  const fingerprintTargets = new Map<string, Set<string>>();
  for (const hint of recognition?.sources ?? []) {
    const id = accountIds.get(hint.source);
    if (!id || !hint.fingerprint) continue;
    const ids = fingerprintTargets.get(hint.fingerprint) ?? new Set<string>();
    ids.add(id);
    fingerprintTargets.set(hint.fingerprint, ids);
    fingerprints.set(hint.source, hint.fingerprint);
  }
  const kinds = new Map<string, number>();
  const txs: ParsedTransaction[] = [];
  const reviewedMovements = new Map<ParsedTransaction, boolean>();
  for (const { source, transaction, movement } of parsed.entries) {
    if (omitted.has(source)) continue;
    const classification = movement ?? movementType(transaction.category, transaction.text);
    if (classification) kinds.set(classification, (kinds.get(classification) ?? 0) + 1);
    const fp = fingerprints.get(source);
    const booking = { ...transaction, accountId: accountIds.get(source),
      ...(fp && fingerprintTargets.get(fp)?.size === 1 && {sourceFingerprint: fp}),
      ...(classification && !countAsSpending.has(classification) && { excludedFromSpend: true }) };
    txs.push(booking);
    if (classification) reviewedMovements.set(booking, !countAsSpending.has(classification));
  }
  const existing = data.transactions ?? [];
  const result = valid ? mergeTransactions(existing, txs, data.rules ?? [], data.accountRecognition?.bindings, reviewedMovements) : null;
  const duplicates = result ? txs.length - result.added : 0;
  const moved = enabled.some(t=> t.matchedId && t.selected && t.matchedId !== t.selected.id);
  const overlap = !!result?.added && hasUnclearOverlap(existing, result.list, enabled, data.importAccounts ?? []);
  const selectionKey = JSON.stringify(enabled.map(t => [t.source,t.selected?.id]));
  const ready = valid && (!overlap || acceptedOverlap === selectionKey);
  const finish = () => {
    if (!ready || !recognition || !txs.length) return;
    update(draft => {
      const {list, added} = mergeTransactions(draft.transactions ?? [], txs, draft.rules ?? [], draft.accountRecognition?.bindings, reviewedMovements);
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
    {table.statement?.format === 'yuh-activities' ? <p className="text-sm font-medium">Yuh-Aktivitäten · CHF aus Belastung oder Gutschrift</p> : <details><summary className="cursor-pointer font-medium">CSV-Spalten prüfen</summary><div className="mt-2 space-y-2">
      {col('date', 'Datum')}{col('text', 'Text')}{col('category', 'Kategorie der Bank', true)}
      {col('source', 'Konto- oder Kartenkennung', true)}{col('currency', 'Währung', true)}{col('direction', 'Einnahme / Ausgabe', true)}
      {map.amount !== undefined ? col('amount', 'Betrag (+/−)') : <>{col('debit', 'Belastung', true)}{col('credit', 'Gutschrift', true)}</>}
      <button type="button" className="text-xs text-muted underline" onClick={() => setMap(map.amount !== undefined
        ? { ...map, amount: undefined, debit: map.amount, credit: undefined }
        : { ...map, amount: map.debit ?? 0, debit: undefined, credit: undefined })}>
        {map.amount !== undefined ? 'Belastung und Gutschrift sind getrennte Spalten' : 'Betrag steht in einer Spalte'}</button>
    </div></details>}
    <div className="space-y-2">
      {many && recognition && <fieldset className="space-y-2">
        <legend className="font-medium">Wie gehören diese {sources.length} Quellen zu deinen Konten?</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={mode === 'one'} className="min-h-11 rounded-lg border border-line px-3 aria-pressed:border-accent aria-pressed:text-accent"
            onClick={()=>setChoice({ key:sourceKey, mode:'one' })}>Gemeinsam auf ein Konto buchen</button>
          <button type="button" aria-pressed={mode === 'separate'} className="min-h-11 rounded-lg border border-line px-3 aria-pressed:border-accent aria-pressed:text-accent"
            onClick={()=>setChoice({ key:sourceKey, mode:'separate' })}>Quellen einzeln zuordnen</button>
        </div>
      </fieldset>}
      {!recognition && <p role="status" className="text-xs text-muted">Kontokennung wird geprüft …</p>}
      {mode === 'one' && shared && <AccountTargetSelect kind="expenses" label="Gemeinsames Zielkonto" target={shared} onChange={account=>select(null,account)}/>}
      {mode && targets.map((target, i) => { const {source} = target; return <div key={source} className="space-y-1 rounded-lg border border-line p-2.5">
        {!omitted.has(source) && mode === 'separate' && <AccountTargetSelect kind="expenses" label={sourceLabel(source, i)}
          target={target} otherDrafts={drafts} onChange={account => select(source, account)} />}
        {mode === 'one' && <span className="text-xs">{sourceLabel(source, i)}</span>}
        {many && <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={omitted.has(source)} onChange={e => {
            const next = new Set(omitted); if (e.target.checked) next.add(source); else next.delete(source); setOmitted(next);
          }} />{mode === 'separate' && omitted.has(source) ? sourceLabel(source, i) + ' überspringen' : 'Quelle überspringen'}
        </label>}
      </div>; })}
      {valid && <p className="text-xs font-medium">{selectedIds.size === 1 ? 'Zielkonto · ' + accountDisplayName(enabled[0]!.selected!) : selectedIds.size + ' Zielkonten'} · {newCount === 1 ? '1 Konto wird neu angelegt' : newCount > 0 ? newCount + ' Konten werden neu angelegt' : 'vorhanden'}</p>}
      {moved && valid && <p className="text-xs text-muted">Bereits erfasste Buchungen aus diesem Auszug werden dem gewählten Ziel zugeordnet. Weitere Buchungen eines alten Kontos kannst du unter <a href="#accounts" className="underline">Konten &amp; Karten</a> zusammenführen.</p>}
      {overlap && <div className="rounded-lg border border-warn/40 p-2 text-sm">
        <p>Gleichlautende Buchungen sind bereits unter einem anderen Konto vorhanden. Falls es dasselbe Konto ist, führe die Konten unter <a href="#accounts" className="underline">Konten &amp; Karten</a> zusammen.</p>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={acceptedOverlap === selectionKey}
          onChange={e=>setAcceptedOverlap(e.target.checked ? selectionKey : '')}/>Das sind separate Buchungen. Ergänzen.</label>
      </div>}
      {issue && <p role="alert" className="text-warn">{issue}</p>}
    </div>
    {kinds.size > 0 && <fieldset className="space-y-1"><legend className="mb-1 font-medium">Welche Geldbewegungen sollen ins Soll/Ist?</legend>
      <p className="text-xs text-muted">Ohne Häkchen werden diese Buchungen gespeichert und bei den Einnahmen und Ausgaben ausgeklammert.</p>
      {[...kinds].map(([kind, count]) => <label key={kind} className="flex items-center gap-2"><input type="checkbox" checked={countAsSpending.has(kind)}
        onChange={e => { const next = new Set(countAsSpending); if (e.target.checked) next.add(kind); else next.delete(kind); setCountAsSpending(next); }} />
        {kind} einrechnen ({count})</label>)}
    </fieldset>}
    {(parsed.nonCash > 0 || parsed.unbooked > 0) && <p className="text-xs text-muted">Übersprungen · {[
      parsed.nonCash && parsed.nonCash + ' ohne Geldbewegung',
      parsed.unbooked && parsed.unbooked + ' nicht gebucht',
    ].filter(Boolean).join(' · ')}</p>}
    {(parsed.invalid > 0 || parsed.foreign > 0) && <p className="text-xs text-warn">Übersprungen · {parsed.invalid} unlesbare oder leere Buchungen · {parsed.foreign} ohne CHF-Betrag</p>}
    <ul className="divide-y divide-line text-xs">{txs.slice(0, 4).map((t, i) => <li key={i} className="flex justify-between gap-2 py-1">
      <span className="min-w-0 truncate text-muted">{t.date} · {hiddenAmounts ? 'Buchung' : t.text}</span>{hiddenAmounts ? <span>••••</span> : <Money className="shrink-0" value={t.amount} signed />}
    </li>)}</ul>
    {duplicates > 0 && <p className="text-xs text-muted">{duplicates} bereits erfasst · {txs.length - duplicates} neu</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button onClick={cancel} variant="ghost">Abbrechen</Button>
      <button type="button" disabled={!ready || txs.length === 0} onClick={finish} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-bg disabled:opacity-40">
        {txs.length} {txs.length === 1 ? 'Buchung' : 'Buchungen'} übernehmen</button>
    </div>
  </div>;
}
