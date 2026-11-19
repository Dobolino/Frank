import { describe, expect, it } from 'vitest';
import { guessColumns, inspectBankRows, parseCsv } from '../src/domain/bankCsv';
import { investmentSources, parseInvestmentTable } from '../src/domain/investCsv';

const header = ['DATE', 'ACTIVITY TYPE', 'ACTIVITY NAME', 'DEBIT', 'DEBIT CURRENCY', 'CREDIT', 'CREDIT CURRENCY',
  'CARD NUMBER', 'LOCALITY', 'RECIPIENT', 'SENDER', 'FEES/COMMISSION', 'BUY/SELL', 'QUANTITY', 'ASSET', 'PRICE PER UNIT'];
// Invented transactions following the field names of the Yuh activity statement.
type Example = Record<string,string>;
function statement(examples: Example[]) {
  return parseCsv([header.join(';'), ...examples.map(example => {
    const row: Example = { DATE: '13/05/2026', ...example };
    return header.map(key => {
      const value = row[key] ?? '';
      return /[";\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
    }).join(';');
  })].join('\r\n'));
}

describe('Yuh-Aktivitäten', () => {
  it('erkennt eine einzige Kontoquelle ohne Nummer für Kartenkäufe, Zahlungen und Anlagen', () => {
    const t = statement([
      { 'ACTIVITY TYPE': 'CARD_TRANSACTION_OUT', 'ACTIVITY NAME': 'Musterladen', DEBIT: '-1.23', 'DEBIT CURRENCY': 'CHF', 'CARD NUMBER': '****1111' },
      { 'ACTIVITY TYPE': 'CARD_TRANSACTION_OUT', 'ACTIVITY NAME': 'Beispielladen', DEBIT: '-2.50', 'DEBIT CURRENCY': 'CHF', 'CARD NUMBER': '****2222' },
      { 'ACTIVITY TYPE': 'PAYMENT_TRANSACTION_IN', 'ACTIVITY NAME': 'Eingang', CREDIT: '10.20', 'CREDIT CURRENCY': 'CHF', SENDER: 'Testfirma' },
    ]);
    expect(t.statement).toMatchObject({ format: 'yuh-activities', bankId: 'yuh' });
    expect(t.statement?.source).toBeUndefined();
    expect(guessColumns(t.header).source).toBeUndefined();
    const { entries } = inspectBankRows(t,guessColumns(t.header));
    expect(entries.map(e => e.source)).toEqual(['','','']);
    expect(entries.map(e => e.transaction.amount)).toEqual([-123,-250,1020]);
    expect(entries[0]?.transaction).toEqual({date:'2026-05-13',text:'Musterladen',amount:-123});
    expect(investmentSources(t)).toEqual([]);
    expect(JSON.stringify(entries)).not.toContain('****');
  });

  it('verwendet nur die gebuchte CHF-Seite und kennzeichnet ausgeschlossene Bewegungen', () => {
    const t = statement([
      { 'ACTIVITY TYPE': 'GOAL_DEPOSIT', 'ACTIVITY NAME': 'Sparen', CREDIT: '15', 'CREDIT CURRENCY': 'CHF' },
      { 'ACTIVITY TYPE': 'GOAL_WITHDRAWAL', 'ACTIVITY NAME': 'Sparen', DEBIT: '-8', 'DEBIT CURRENCY': 'CHF' },
      { 'ACTIVITY TYPE': 'BANK_AUTO_ORDER_EXECUTED', 'ACTIVITY NAME': 'Automatischer Wechsel', DEBIT: '-95', 'DEBIT CURRENCY': 'CHF', CREDIT: '100', 'CREDIT CURRENCY': 'EUR', 'FEES/COMMISSION': '1.40' },
      { 'ACTIVITY TYPE': 'BANK_ORDER_EXECUTED', 'ACTIVITY NAME': '"Umtausch von Schweizer Franken"', CREDIT: '-10', 'CREDIT CURRENCY': 'CHF', QUANTITY: '11', ASSET: 'USD' },
      { 'ACTIVITY TYPE': 'BANK_AUTO_ORDER_EXECUTED', 'ACTIVITY NAME': 'Automatischer Wechsel', DEBIT: '-100', 'DEBIT CURRENCY': 'EUR', CREDIT: '95', 'CREDIT CURRENCY': 'CHF' },
      { 'ACTIVITY TYPE': 'PAYMENT_ORDER_REJECTED', DEBIT: '-25', 'DEBIT CURRENCY': 'CHF' },
      { 'ACTIVITY TYPE': 'CARD_TRANSACTION_OUT', DEBIT: '-30', 'DEBIT CURRENCY': 'USD' },
      { 'ACTIVITY TYPE': 'REWARD_RECEIVED', QUANTITY:'1', ASSET:'SWQ' },
      { 'ACTIVITY TYPE': 'PAYMENT_TRANSACTION_IN', CREDIT:'4', 'CREDIT CURRENCY':'' },
    ]);
    const result = inspectBankRows(t,guessColumns(t.header));
    expect(result).toMatchObject({foreign:1, invalid:1, nonCash:1, unbooked:1});
    expect(result.entries.map(e=>[e.transaction.amount,e.movement])).toEqual([
      [1500,'Sparziel-Überträge'],[-800,'Sparziel-Überträge'],[-9500,'Währungswechsel'],[-1000,'Währungswechsel'],[9500,'Währungswechsel'],
    ]);
  });

  it('liest belegte CHF-Käufe, Verkäufe und Dividenden, ohne aus Prämien oder Umtausch einen Kauf abzuleiten', () => {
    const t = statement([
      { 'ACTIVITY TYPE': 'BANK_ORDER_EXECUTED', 'BUY/SELL':'BUY', ASSET:'Testfonds', QUANTITY:'2.5', DEBIT:'-120.30', 'DEBIT CURRENCY':'CHF' },
      { 'ACTIVITY TYPE': 'BANK_ORDER_EXECUTED', 'BUY/SELL':'SELL', ASSET:'Testfonds', QUANTITY:'-1', CREDIT:'60', 'CREDIT CURRENCY':'CHF' },
      { 'ACTIVITY TYPE': 'DIVIDEND_RECEIVED', ASSET:'Testfonds', CREDIT:'4', 'CREDIT CURRENCY':'CHF' },
      { 'ACTIVITY TYPE': 'BANK_ORDER_EXECUTED', 'BUY/SELL':'BUY', ASSET:'Testfonds', QUANTITY:'1', DEBIT:'-50', 'DEBIT CURRENCY':'USD' },
      { 'ACTIVITY TYPE': 'BANK_ORDER_EXECUTED', 'ACTIVITY NAME':'Umtausch', ASSET:'USD', QUANTITY:'15', CREDIT:'-20', 'CREDIT CURRENCY':'CHF' },
      { 'ACTIVITY TYPE': 'REWARD_RECEIVED', QUANTITY:'1', ASSET:'SWQ' },
    ]);
    const result = parseInvestmentTable(t,'depot',[],'');
    expect(result.rows.map(r=>[r.security,r.kind,r.amount,r.quantity])).toEqual([
      ['Testfonds','buy',-12030,2.5],['Testfonds','sell',6000,1],['Testfonds','dividend',400,undefined],
    ]);
    expect(result.skipped.get('kein CHF-Betrag')).toBe(1);
    expect(result.skipped.get('anderer Geschäftstyp')).toBe(2);
    expect(parseInvestmentTable(t,'depot',result.rows).rows).toHaveLength(0);
  });
});
