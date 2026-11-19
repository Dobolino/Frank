import { describe, expect, it } from 'vitest';
import { demoData } from '../src/seed/demo';
import { reconcile } from '../src/sync/reconcile';
import { mergeTransactions } from '../src/domain/actuals';
import type { InvestmentTransaction } from '../src/domain/investCsv';
import { assertDistinctImportSources, ImportSourceConflict, investmentSyncKeys } from '../src/sync/importConflicts';

const spend = { text: 'Einkauf', date: '2026-03-04', amount: -400 };
const trade: InvestmentTransaction = { date: '2026-02-01', kind: 'buy', amount: -12300, security: 'Test', accountId: 'depot' };
const base = demoData();
const fp = (c: string) => c.repeat(64);
function imported(accountId: string, bankId = 'ubs', secret = '1', fingerprint = 'a') {
  const d = structuredClone(base);
  d.importAccounts = [{ id: accountId, bankId, type:'bank', name:'Privat' }];
  d.transactions = mergeTransactions([], [{...spend,accountId}], []).list;
  d.accountRecognition = {key:fp(secret), bindings:{[fp(fingerprint)]:accountId}};
  return d;
}

describe('Parallele CSV-Importe', () => {
  it('verhindert eine Verdopplung bei neu angelegten Konten für denselben Auszug', () => {
    const left = imported('pc'), right = imported('mobile');
    expect(() => assertDistinctImportSources(base,left,right)).toThrow(ImportSourceConflict);
    expect(() => reconcile(base,left,right)).toThrow(ImportSourceConflict);
    // The same identifiers yield different HMACs with independent initial secrets.
    right.accountRecognition = {key:fp('2'), bindings:{[fp('b')]:'mobile'}};
    expect(() => assertDistinctImportSources(base,left,right)).toThrow(ImportSourceConflict);
    delete left.accountRecognition;
    delete right.accountRecognition;
    expect(() => assertDistinctImportSources(base,left,right)).toThrow(ImportSourceConflict);
  });

  it('verbindet disjunkte Quellen auch bei einer identischen Buchung', () => {
    const left = imported('pc'), right = imported('mobile','ubs','1','c');
    expect(() => assertDistinctImportSources(base,left,right)).not.toThrow();
    const result = reconcile(base,left,right);
    expect(result.conflicts).toEqual([]);
    expect(result.data.transactions).toHaveLength(2);
    const foreign = imported('elsewhere','zkb','2','f');
    expect(() => assertDistinctImportSources(base,left,foreign)).not.toThrow();
  });

  it('unterschiedliche neue Buchungen, einseitiger Import oder bekannte verschiedene Konten bleiben zusammenführbar', () => {
    const left = imported('pc'), right = imported('mobile','ubs','2','c');
    const shared = structuredClone(base);
    shared.importAccounts = [...left.importAccounts!, ...right.importAccounts!];
    expect(() => assertDistinctImportSources(shared,left,right)).not.toThrow();
    right.transactions = [{...right.transactions![0]!,amount:800}];
    expect(() => assertDistinctImportSources(base,left,right)).not.toThrow();
    expect(() => assertDistinctImportSources(base,left,base)).not.toThrow();
  });

  it('verwechselt getrennte Broker-IDs nicht mit zwei anonymen Ausführungen', () => {
    const anonymous = {...trade};
    const rows = [anonymous, anonymous, {...trade,brokerId:'first'}, {...trade,brokerId:'second'}, {...trade,accountId:'other',brokerId:'first'}];
    const ids = investmentSyncKeys(rows)!;
    expect(new Set(ids).size).toBe(rows.length);
    expect(investmentSyncKeys([...rows,rows[2]!])).toBeUndefined();
    expect(investmentSyncKeys(rows.slice(0,2))).toEqual(ids.slice(0,2));
  });

  it('erkennt auf zwei Geräten unter unterschiedlichen Depot-IDs doppelt erfasste Trades', () => {
    const left = structuredClone(base),right = structuredClone(base);
    left.investmentTransactions = [{...trade, accountId:'new1'}];
    right.investmentTransactions = [{...trade, accountId:'new2',brokerId:'ref1'}];
    expect(() => assertDistinctImportSources(base,left,right)).toThrow(ImportSourceConflict);
    left.investmentTransactions![0]!.brokerId = 'ref2';
    expect(() => assertDistinctImportSources(base,left,right)).not.toThrow();
  });

  it('führt unabhängige Trades zusammen und bewahrt die Zahl identischer Ausführungen', () => {
    const shared = structuredClone(base);
    shared.importAccounts = [{ id:'depot', type:'depot', name:'Depot', bankId:'swissquote' }];
    shared.investmentTransactions = [trade];
    const left = structuredClone(shared), right = structuredClone(shared);
    left.investmentTransactions!.push(trade, {...trade,brokerId:'first'});
    right.investmentTransactions!.push(trade, {...trade,brokerId:'second'});
    const {data,conflicts} = reconcile(shared,left,right);
    expect(conflicts).toEqual([]);
    expect(data.investmentTransactions).toHaveLength(4);
    expect(data.investmentTransactions!.filter(tx=>!tx.brokerId)).toHaveLength(2);
  });

  it('meldet die unklare Mischung von Broker-ID und anonymem Fill im selben Depot', () => {
    const left = structuredClone(base),right = structuredClone(base);
    left.investmentTransactions = [trade]; right.investmentTransactions = [{...trade,brokerId:'ref'}];
    expect(() => assertDistinctImportSources(base,left,right)).toThrow(ImportSourceConflict);
    // Both devices imported an export containing two real equal fills, one with a reference.
    left.investmentTransactions.push({...trade,brokerId:'ref'}); right.investmentTransactions.push(trade);
    expect(() => assertDistinctImportSources(base,left,right)).not.toThrow();
  });
});
