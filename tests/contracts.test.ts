import { describe, expect, it } from 'vitest';
import { acceptContractSuggestion, plannedContracts, recurringSuggestions } from '../src/domain/contracts';
import { demoData } from '../src/seed/demo';
import { item } from '../src/seed/builders';
import type { Transaction } from '../src/domain/types';

function payment(date: string, props: Partial<Transaction> = {}): Transaction {
  return {id: date, date, text: 'NETFLIX', amount: -1790, accountId: 'karte', ...props};
}
const payments = () => ['2025-12-28','2026-01-29','2026-02-28'].map(date => payment(date));

describe('Vertragsvorschläge', () => {
  it('findet Monatsserien über den Jahreswechsel, zählt nur Zuordnungen des Budgetjahrs', () => {
    const data = demoData();
    data.transactions = payments();
    expect(recurringSuggestions(data, 2026)[0]).toMatchObject({name:'Netflix',count:3,bookingIds:['2026-02-28','2026-01-29']});
  });
  it('behält Konten, Einmalzahlungen, Überträge, Einkäufe und bereits zugeteilte Posten auseinander', () => {
    const data = demoData();
    for (const texts of [
      payments().map(tx => ({...tx,text:'Migros'})),
      payments().map(tx => ({...tx,excludedFromSpend:true})),
      payments().map(tx => ({...tx,amount:1790})),
      payments().map((tx,i) => i === 1 ? {...tx,accountId:'zweites'} : tx),
      payments().map((tx,i) => i === 1 ? {...tx,item:'Streaming'} : tx),
      [...payments(), payment('2026-01-03',{amount:-200})],
    ]) {
      data.transactions = texts;
      expect(recurringSuggestions(data,2026)).toHaveLength(0);
    }
  });
  it('übernimmt einen neuen Posten nur einmal; lässt andere Jahre unberührt', () => {
    const data = demoData();
    data.transactions = payments();
    const proposal = recurringSuggestions(data,2026)[0]!;
    const initial = data.years['2026']!.budget.length;
    expect(acceptContractSuggestion(data,2026,proposal,'new','Netflix')).toBe(true);
    expect(acceptContractSuggestion(data,2026,proposal,'new','Netflix')).toBe(false);
    expect(data.years['2026']!.budget).toHaveLength(initial+1);
    expect(data.transactions[0]!.item).toBeUndefined();
    expect(data.transactions[1]!.item).toBe('Netflix');
    expect(recurringSuggestions(data,2026)).toHaveLength(0);
  });
  it('verwendet vorhandene Posten und summiert zugeordnete Belastungen im letzten Monat', () => {
    const data = demoData();data.transactions = payments();
    const proposal = recurringSuggestions(data,2026)[0]!;
    const streaming = item('fixed','Mein Streamingabo',22);
    data.years['2026']!.budget=[streaming];
    expect(acceptContractSuggestion(data,2026,proposal,'new','Mein Streamingabo')).toBe(false);
    expect(acceptContractSuggestion(data,2026,proposal,streaming.id,'')).toBe(true);
    data.transactions.push(payment('2026-02-15',{text:'Music',item:streaming.name,amount:-410}));
    expect(plannedContracts([streaming],data.transactions,2026)[0]).toMatchObject({latest:'2026-02',paid:2200,expected:2200});
  });
});
