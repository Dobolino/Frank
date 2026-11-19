import { useState } from 'react';
import { useStore } from '../app/store';
import { bankLabel, bankOptions, accountTypeLabel } from '../domain/importAccounts';
import type { ImportAccount } from '../domain/types';
import { Button, Select, TextInput } from './shared';

export function BankMark({ bankId, size = 28 }: { bankId: string; size?: number }) {
  const style = { width: size, height: size };
  if (bankOptions.some(bank => bank.value === bankId)) {
    return <img alt="" style={style} className="inline-block shrink-0 rounded-lg bg-white object-contain" src={`${import.meta.env.BASE_URL}banks/${bankId}.png`} />;
  }
  return <span aria-hidden style={style} className="inline-grid shrink-0 place-items-center rounded-lg bg-panel-2 text-xs font-semibold">{bankLabel(bankId).slice(0, 2).toLocaleUpperCase()}</span>;
}
export function AccountTargetSelect({ kind, value, onChange, label = 'Importkonto' }: {
  kind: 'expenses' | 'invest'; value: string; onChange: (id: string) => void; label?: string;
}) {
  const { data } = useStore();
  const accounts = (data.importAccounts ?? []).filter(a => kind === 'invest' ? a.type === 'depot' : a.type !== 'depot');
  const [creating, setCreating] = useState(false);
  const selected = accounts.find(a => a.id === value);
  return <div className="space-y-2 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span>{label}</span>
      {selected && <BankMark bankId={selected.bankId} />}
      <Select ariaLabel={label} value={value} className="max-w-full" onChange={id => {
        if (id === 'new') setCreating(true); else { setCreating(false); onChange(id); }
      }} options={[{ value: '', label: 'Konto wählen …' }, ...accounts.map(a => ({ value: a.id, label: `${bankLabel(a.bankId)} · ${a.name} (${accountTypeLabel(a.type)})` })), { value: 'new', label: '+ Konto anlegen' }]} />
    </div>
    {creating && <AccountEditor kind={kind} onCancel={() => setCreating(false)} onCreated={id => {setCreating(false); onChange(id);}} />}
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
