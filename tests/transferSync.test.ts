import { expect, it, vi } from 'vitest';
import { mergeImportAccounts } from '../src/domain/mergeImportAccounts';
import { demoData } from '../src/seed/demo';
import { parseAppData } from '../src/storage/storage';
import * as checkpoints from '../src/sync/checkpoint';
import { reconcile } from '../src/sync/reconcile';
import { SyncSession, type SyncView } from '../src/sync/session';

function accountsWithBookings() {
  const data = demoData();
  data.importAccounts = [
    { id: 'checking', bankId: 'ubs', name: 'Privatkonto', type: 'bank' },
    { id: 'savings', bankId: 'yuh', name: 'Sparkonto', type: 'bank' },
  ];
  const shared = { date: '2026-08-19', text: 'Testüberweisung' };
  data.transactions = [
    { ...shared, id: 'out', accountId: 'checking', amount: -4500 },
    { ...shared, id: 'in', accountId: 'savings', amount: 4500 },
    { ...shared, id: 'alternative', accountId: 'savings', amount: 4500 },
  ];
  return data;
}

it('behält beide Verweise bei Backup und Geräteabgleich und überträgt ein späteres Aufheben', () => {
  const base = accountsWithBookings(), phone = structuredClone(base), pc = structuredClone(base);
  phone.transactions![0]!.transferPeerId = 'in';
  phone.transactions![1]!.transferPeerId = 'out';
  pc.importAccounts![1]!.name = 'Mein Sparkonto';

  const confirmed = reconcile(base, phone, pc);
  expect(confirmed.conflicts).toEqual([]);
  expect(confirmed.data.importAccounts![1]!.name).toBe('Mein Sparkonto');
  expect(confirmed.data.transactions).toEqual(phone.transactions);
  expect(parseAppData(JSON.stringify(confirmed.data)).transactions).toEqual(phone.transactions);

  const unlinked = structuredClone(confirmed.data);
  delete unlinked.transactions![0]!.transferPeerId;
  delete unlinked.transactions![1]!.transferPeerId;
  const edited = structuredClone(confirmed.data);
  edited.transactions![1]!.counterparty = 'Beispielperson';
  const afterUndo = reconcile(confirmed.data, edited, unlinked);
  expect(afterUndo.conflicts).toEqual([]);
  expect(afterUndo.data.transactions!.some(t => t.transferPeerId)).toBe(false);
  expect(afterUndo.data.transactions![1]!.counterparty).toBe('Beispielperson');
});

it('bietet bei widersprüchlichen Bestätigungen auf zwei Geräten nur ihre vollständigen Stände an', async () => {
  const base = accountsWithBookings(), phone = structuredClone(base), pc = structuredClone(base);
  phone.transactions![0]!.transferPeerId = 'in';
  phone.transactions![1]!.transferPeerId = 'out';
  pc.transactions![0]!.transferPeerId = 'alternative';
  pc.transactions![2]!.transferPeerId = 'out';

  for (const data of [phone, pc]) expect(parseAppData(JSON.stringify(data)).transactions).toEqual(data.transactions);
  for (const preference of ['local', 'peer'] as const) {
    expect(() => reconcile(base, phone, pc, preference)).toThrow();
  }

  const checkpoint = vi.spyOn(checkpoints, 'getCheckpoint').mockResolvedValue({ id: 'shared', data: base });
  try {
    const sent: string[] = [], views: SyncView[] = [];
    const save = vi.fn();
    const session = new SyncSession(true, {
      current: () => phone, save,
      send: async message => { sent.push(message); },
      change: view => { views.push(view); },
    });
    await session.begin();
    await session.message(JSON.stringify({ type: 'snapshot', round: JSON.parse(sent[0]!).round, base: 'shared', data: pc }));
    expect(views.at(-1)).toMatchObject({ step: 'review', choices: ['local', 'peer'] });
    expect(save).not.toHaveBeenCalled();
  } finally {
    checkpoint.mockRestore();
  }
});

it('verhindert eine geräteübergreifende Bestätigung auf nachträglich zusammengeführten Konten', () => {
  const base = accountsWithBookings(), phone = structuredClone(base), pc = structuredClone(base);
  phone.transactions![0]!.transferPeerId = 'in';
  phone.transactions![1]!.transferPeerId = 'out';
  mergeImportAccounts(pc, 'checking', ['savings']);
  expect(parseAppData(JSON.stringify(pc)).transactions).toEqual(pc.transactions);
  expect(() => reconcile(base, phone, pc)).toThrow();
});
