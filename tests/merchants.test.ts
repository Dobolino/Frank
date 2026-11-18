import { describe, expect, it } from 'vitest';
import { merchantDirectory, merchantRanking, merchantText } from '../src/domain/merchants';
import type { Transaction } from '../src/domain/types';

const tx = (text: string, amount: number, properties: Partial<Transaction> = {}): Transaction =>
  ({ text, amount, id: 'test', date: '2026-02-01', ...properties });

describe('Händler und Top-Marken', () => {
  it('ordnet Händler auch hinter Zahlungsvermittlern zu und unterscheidet Bank und Supermarkt', () => {
    const { find } = merchantDirectory({});
    expect(find(tx('TWINT · Migros Bank', -100))?.id).toBe('migrosbank');
    expect(find(tx('MIGROS · KASSE 3', -100))?.id).toBe('migros');
    expect(find(tx('KARTENZAHLUNG • McDonald’s', -100))?.id).toBe('mcdonalds');
    expect(find(tx('Private Zahlung', -100))).toBeUndefined();
  });
  it('bewahrt eine explizite Korrektur und den Verzicht auf eine Marke', () => {
    const text = 'Terminal XY';
    const { find } = merchantDirectory({ merchantRules: [{ match: merchantText(text), merchantId: 'migros' }] });
    expect(find(tx(text, -100))?.id).toBe('migros');
    expect(find(tx(text, -100, { merchantId: '' }))).toBeUndefined();
    expect(find(tx(text, -100, { merchantId: 'coop' }))?.id).toBe('coop');
  });
  it('ordnet das eigene Bild auch automatischen Treffern zu und zeigt jede Marke einmal', () => {
    const { find, all } = merchantDirectory({customMerchants:[{id:'migros',name:'Migros',logo:'data:image/png;base64,test'}]});
    expect(find(tx('migros',-100))?.logo).toBe('data:image/png;base64,test');
    expect(all.filter(m=>m.id==='migros')).toHaveLength(1);
  });
  it('wertet Händlerausgaben aus und sortiert nach Betrag oder Häufigkeit', () => {
    const { find } = merchantDirectory({});
    const rows = [tx('Migros', -600),tx('Migros',-250),tx('Coop',-950),tx('Coop',500),tx('Viseca Card Services',-50000),tx('Coop',-10000,{excludedFromSpend:true})]
      .map(transaction => ({transaction, merchant: find(transaction)}));
    expect(merchantRanking(rows,'amount').map(r => [r.merchant.name,r.amount])).toEqual([['Coop',950],['Migros',850]]);
    expect(merchantRanking(rows,'count').map(r => [r.merchant.name,r.count])).toEqual([['Migros',2],['Coop',1]]);
  });
});
