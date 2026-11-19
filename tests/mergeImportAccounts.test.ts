import { describe, expect, it } from 'vitest';
import { accountDisplayName } from '../src/domain/importAccounts';
import { mergeImportAccounts, previewAccountMerge } from '../src/domain/mergeImportAccounts';
import { demoData } from '../src/seed/demo';
import { parseAppData } from '../src/storage/storage';
import type { InvestmentTransaction } from '../src/domain/investCsv';

const key = 'e'.repeat(64), cardSource = 'b'.repeat(64), bankSource = 'a'.repeat(64);
function bankAccounts() {
  const data = demoData();
  data.importAccounts = [
    {id:'bank', type:'bank', bankId:'ubs', name:'Lohnkonto', lastFour:'0007'},
    {id:'card', type:'card', bankId:'ubs', name:'Karte', lastFour:'4310'},
    {id:'other', type:'bank', bankId:'yuh', name:'Reisekonto'},
  ];
  data.accountRecognition = {key, bindings:{[bankSource]:'bank', [cardSource]:'card'}};
  const purchase = {date:'2026-11-10', amount:-450, text:'Testkauf'};
  data.transactions = [
    {...purchase, id:'a', accountId:'bank'},
    {...purchase, id:'b', accountId:'card', item:'Mittagessen'},
    {...purchase, id:'c', accountId:'other'},
  ];
  return data;
}

describe('Verwaltung der Importkonten', () => {
  it('zeigt freiwillige Endziffern einschliesslich führender Nullen und lädt alte Konten ohne Nummer', () => {
    const data = bankAccounts();
    expect(accountDisplayName(data.importAccounts![0]!)).toBe('Lohnkonto · •••• 0007');
    expect(accountDisplayName(data.importAccounts![2]!)).toBe('Reisekonto');
    expect(parseAppData(JSON.stringify(data)).importAccounts).toEqual(data.importAccounts);
    data.importAccounts![0]!.lastFour = '1234567';
    expect(() => parseAppData(JSON.stringify(data))).toThrow(/lastFour/);
  });

  it('verschiebt alle Buchungen, Regeln für Quellen und eindeutige Herkunft gemeinsam', () => {
    const data = bankAccounts();
    expect(previewAccountMerge(data,'bank',['card'])).toMatchObject({moves:1,trades:0,links:1});
    mergeImportAccounts(data,'bank',['card']);
    expect(data.transactions?.map(({id,accountId,sourceFingerprint,item}) => [id,accountId,sourceFingerprint,item])).toEqual([
      ['a','bank',bankSource,undefined], ['b','bank',cardSource,'Mittagessen'], ['c','other',undefined,undefined],
    ]);
    expect(data.accountRecognition?.bindings).toEqual({[bankSource]:'bank', [cardSource]:'bank'});
    expect(data.importAccounts?.map(a => a.id)).toEqual(['bank','other']);
    expect(data.importAccounts![0]?.lastFour).toBe('0007');
    expect(parseAppData(JSON.stringify(data)).transactions).toEqual(data.transactions);
  });

  it('löst bei einer Zusammenführung genau die Umbuchungen auf, deren Seiten dasselbe Konto erhalten', () => {
    const data = bankAccounts();
    const outgoing = data.transactions![0]!, incoming = data.transactions![1]!;
    incoming.amount = -outgoing.amount;
    outgoing.transferPeerId = incoming.id;
    incoming.transferPeerId = outgoing.id;
    outgoing.excludedFromSpend = true;
    expect(previewAccountMerge(data, 'bank', ['other']).released.size).toBe(0);
    expect(previewAccountMerge(data, 'bank', ['card']).released).toEqual(new Set([outgoing.id, incoming.id]));
    mergeImportAccounts(data, 'bank', ['card']);
    expect(outgoing.transferPeerId).toBeUndefined();
    expect(incoming.transferPeerId).toBeUndefined();
    expect(outgoing.excludedFromSpend).toBe(true);
    expect(incoming.excludedFromSpend).toBeUndefined();
    expect(parseAppData(JSON.stringify(data)).transactions).toHaveLength(3);
  });

  it('hält nicht belegte Herkunft offen, auch wenn mehrere Quellen zum alten Konto gehören', () => {
    const data = bankAccounts();
    data.accountRecognition!.bindings['c'.repeat(64)] = 'card';
    mergeImportAccounts(data,'bank',['card','other']);
    expect(data.transactions?.map(t => t.sourceFingerprint)).toEqual([bankSource,undefined,undefined]);
  });

  it('konsolidiert eine identische Broker-ID und erhält jede anonyme Ausführung', () => {
    const data = bankAccounts();
    data.importAccounts!.push(
      {id:'a', type:'depot', bankId:'swissquote', name:'Depot'},
      {id:'b', type:'depot', bankId:'swissquote', name:'Depot 2'},
    );
    const trade: InvestmentTransaction = {accountId:'a',date:'2026-05-02',kind:'buy',security:'Test',amount:-200};
    data.investmentTransactions = [trade, {...trade, brokerId:'trade-1'}, {...trade, accountId:'b'}, {...trade,accountId:'b',brokerId:'trade-1'}];
    const original = structuredClone(data);
    expect(() => mergeImportAccounts(data,'a',['bank'])).toThrow();
    expect(data).toEqual(original);
    expect(previewAccountMerge(data,'a',['b']).sharedTrades.size).toBe(1);
    mergeImportAccounts(data,'a',['b']);
    expect(data.investmentTransactions).toHaveLength(3);
    expect(data.investmentTransactions.every(t => t.accountId === 'a')).toBe(true);
    expect(parseAppData(JSON.stringify(data)).investmentTransactions).toEqual(data.investmentTransactions);
    original.investmentTransactions![3]!.amount = -300;
    const before = structuredClone(original);
    expect(() => mergeImportAccounts(original,'a',['b'])).toThrow(/Broker-ID/);
    expect(original).toEqual(before);
  });
});
