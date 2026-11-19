import { useState } from 'react';
import { useStore } from '../app/store';
import { bankLabel, bankOptions, accountTypeLabel, bankLogoPath, accountDisplayName } from '../domain/importAccounts';
import type { ImportAccount } from '../domain/types';
import { Button, Select, TextInput } from './shared';
import { compatibleAccount, unknownBank, type ImportKind, type ImportTarget } from './useImportTargets';

export function BankMark({ bankId, size = 28 }: { bankId: string; size?: number }) {
  const style = { width: size, height: size };
  const path = bankLogoPath(bankId);
  if (path) {
    return <img alt="" style={style} className="inline-block shrink-0 rounded-lg bg-white object-contain" src={`${import.meta.env.BASE_URL}${path}`} />;
  }
  return <span aria-hidden style={style} className="inline-grid shrink-0 place-items-center rounded-lg bg-panel-2 text-xs font-semibold">{bankId && bankId !== unknownBank ? bankLabel(bankId).slice(0, 2).toLocaleUpperCase() : '?'}</span>;
}
export function AccountTargetSelect({ kind, target, onChange, label, otherDrafts = [] }: {
  kind: ImportKind; target: ImportTarget; onChange: (account?: ImportAccount) => void; label: string; otherDrafts?: ImportAccount[];
}) {
  const { data } = useStore();
  const existing = (data.importAccounts ?? []).filter(a => compatibleAccount(a, kind));
  const accounts = [...existing, ...otherDrafts.filter(a => a.id !== target.proposed.id && !existing.some(item => item.id === a.id))];
  const { proposed, selected } = target;
  const [editing, setEditing] = useState(false);
  const isNew = selected?.id === proposed.id;
  const bank = selected?.bankId;
  const registeredBank = bankOptions.some(option => option.value === bank);
  const bankChoice = registeredBank ? bank! : bank === unknownBank ? 'unknown' : 'other';
  const change = (fields: Partial<ImportAccount>) => onChange({ ...proposed, ...fields });
  return <div className="space-y-2 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      {bank && <BankMark bankId={bank} />}
      <span className="font-medium">{label}</span>
      <Select ariaLabel={label} value={isNew ? 'new' : selected?.id ?? ''} className="max-w-full" onChange={id => {
        setEditing(id === 'new');
        onChange(id === 'new' ? proposed : accounts.find(a => a.id === id));
      }} options={[
        { value: '', label: 'Konto wählen …' },
        ...accounts.map(a => ({ value: a.id, label: `${bankLabel(a.bankId)} · ${accountDisplayName(a)} (${accountTypeLabel(a.type)})` })),
        { value: 'new', label: '+ Beim Import neu anlegen' },
      ]} />
    </div>
    {target.suggestion && <p className="text-xs text-muted">{target.suggestion}</p>}
    {!selected && <p className="text-xs text-muted">{target.manualReason ?? 'Wähle ein Zielkonto für die Buchungen.'}</p>}
    {selected && !isNew && <p className="text-xs text-muted">{selected.id === target.matchedId ? 'Aus früherem Import wiedererkannt.' : 'Die Buchungen werden diesem Konto zugeordnet.'}</p>}
    {isNew && selected && <label className="block text-xs text-muted">Kontoname
      <TextInput ariaLabel="Kontoname" className="mt-1 w-full" value={selected.name} onChange={name => change({name})} />
    </label>}
    {isNew && selected && <details open={editing} onToggle={e => setEditing(e.currentTarget.open)} className="rounded-lg border border-line p-2">
      <summary className="flex cursor-pointer flex-wrap justify-between gap-1 text-xs">
        <strong>{bankLabel(selected.bankId || unknownBank)} · {selected.name || accountTypeLabel(selected.type)}</strong>
        <span className="text-accent">Bearbeiten</span>
      </summary>
      <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select ariaLabel="Institut" value={bankChoice} onChange={value => change({ bankId: value === 'unknown' ? unknownBank : value === 'other' ? '' : value })}
          options={[{value: 'unknown', label: 'Institut unbekannt'}, ...bankOptions, {value: 'other', label: 'Anderes Institut'}]} />
        {kind === 'expenses' && <Select ariaLabel="Kontoart" value={selected.type} onChange={value => change({ type: value })}
          options={(['bank', 'card'] as const).map(value => ({ value, label: accountTypeLabel(value) }))} />}
      </div>
      {bankChoice === 'other' && <TextInput ariaLabel="Name des Instituts" className="w-full" placeholder="Name des Instituts" value={bank ?? ''} onChange={bankId => change({bankId})} />}
      </div>
    </details>}
    {target.masked && <p className="text-xs text-warn">Die Kennung ist teilweise verdeckt. Bitte die Zuordnung prüfen.</p>}
  </div>;
}

export function AccountEditor({ kind = 'all', onCancel, onCreated }: {
  kind?: 'all' | 'expenses' | 'invest'; onCancel: () => void; onCreated: (id: string) => void;
}) {
  const { data, update } = useStore();
  const accounts = data.importAccounts ?? [];
  const types: ImportAccount['type'][] = kind === 'all' ? ['bank', 'card', 'depot'] : ['bank', 'card'];
  const [bank, setBank] = useState('ubs');
  const [customBank, setCustomBank] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<ImportAccount['type']>(kind === 'invest' ? 'depot' : 'bank');
  const bankId = bank === 'other' ? customBank.trim() : bank;
  const create = () => {
    if (!bankId || !name.trim()) return;
    const duplicate = accounts.find(a => a.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase() && a.bankId === bankId && a.type === type);
    const account = duplicate ?? { id: crypto.randomUUID(), name: name.trim(), type, bankId };
    if (!duplicate) update(d => { (d.importAccounts ??= []).push(account); });
    onCreated(account.id);
  };
  return <div className="space-y-3 rounded-lg border border-line bg-bg p-3">
      <div className="flex flex-wrap items-center gap-2">
        <BankMark bankId={bankId} />
        <Select ariaLabel="Institut" value={bank} onChange={setBank} options={[...bankOptions, { value: 'other', label: 'Anderes Institut' }]} />
        {kind !== 'invest' && <Select ariaLabel="Kontoart" value={type} onChange={setType} options={types.map(value => ({value, label: accountTypeLabel(value)}))} />}
      </div>
      {bank === 'other' && <TextInput className="w-full" ariaLabel="Name des Instituts" value={customBank} onChange={setCustomBank} placeholder="Name des Instituts" />}
      <TextInput ariaLabel="Kontoname" className="w-full" placeholder={type === 'depot' ? 'z. B. Mein Depot' : 'z. B. Privatkonto oder Kreditkarte'} value={name} onChange={setName} />
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
      <button className="rounded-lg bg-accent px-3 py-1.5 text-bg disabled:opacity-40" disabled={!bankId || !name.trim()} onClick={create} type="button">Konto anlegen</button></div>
    </div>;
}
