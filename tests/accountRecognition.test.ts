import { describe, expect, it } from 'vitest';
import { describeAccountSources, hasAccountBinding, prepareAccountRecognition, rememberAccountSources } from '../src/domain/accountRecognition';
import type { AccountSource } from '../src/domain/accountRecognition';
import { parseCsv, type CsvTable } from '../src/domain/bankCsv';
import { demoData } from '../src/seed/demo';
import { parseAppData } from '../src/storage/storage';

const source = (source: string, type: 'bank' | 'card' | 'depot' = 'card', bankId: string | undefined = 'ubs'): AccountSource =>
  ({ source, bankId, type });
const dataWithAccounts = () => ({
  ...demoData(),
  importAccounts: [
    { id: 'c1', type: 'card' as const, bankId: 'ubs', name: 'Einkäufe' },
    { id: 'c2', type: 'card' as const, bankId: 'ubs', name: 'Reisen' },
    { id: 'd', type: 'depot' as const, bankId: 'swissquote', name: 'Depot' },
    { id: 'b', type: 'bank' as const, bankId: 'ubs', name: 'Privat' },
  ],
});

function fakeSwissIban(iid: string) {
  const bban = iid + '000000000019';
  const checksum = 98 - Number(BigInt(bban + '121700') % 97n);
  return 'CH' + String(checksum).padStart(2, '0') + bban;
}

describe('Lokale Wiedererkennung der CSV-Quelle', () => {
  it('merkt zwei Karten derselben Bank erst mit ihrer bestätigten Zuordnung', async () => {
    const data = dataWithAccounts();
    const sources = [source('****1234'), source('****5678')];
    const preview = await prepareAccountRecognition(data, sources);
    expect(preview.sources.every(s => s.fingerprint && !s.accountId)).toBe(true);
    expect(data.accountRecognition).toBeUndefined();
    rememberAccountSources(data, preview, new Map([['****1234', 'c1'], ['****5678', 'c2']]));
    expect(hasAccountBinding(data, 'c1')).toBe(true);
    const restored = parseAppData(JSON.stringify(data));
    const next = await prepareAccountRecognition(restored, [source('XXXX 1234'), source('•••• 5678')]);
    expect(next.sources.map(s => s.accountId)).toEqual(['c1', 'c2']);
    expect(JSON.stringify(restored.accountRecognition)).not.toContain('****');
    expect(Object.keys(restored.accountRecognition!.bindings).every(str => /^[a-f0-9]{64}$/.test(str))).toBe(true);
    const unrelated = await prepareAccountRecognition(dataWithAccounts(), sources);
    expect(unrelated.sources[0]!.fingerprint).not.toBe(preview.sources[0]!.fingerprint);
  });

  it('ordnet beim Korrigieren nur die ausgewählte Quelle neu zu', async () => {
    const data = dataWithAccounts(), sources = [source('****3287'), source('****1111')];
    const preview = await prepareAccountRecognition(data, sources);
    rememberAccountSources(data, preview, new Map([['****3287', 'c2']]));
    const next = await prepareAccountRecognition(data, sources);
    expect(next.sources.map(s => s.accountId)).toEqual(['c2', undefined]);
    rememberAccountSources(data, next, new Map([['****3287', 'c1']]));
    expect((await prepareAccountRecognition(data, sources)).sources[0]?.accountId).toBe('c1');
  });

  it('überträgt Teilkennungen weder auf eine andere Bank noch auf ein Depot', async () => {
    const data = dataWithAccounts();
    const preview = await prepareAccountRecognition(data, [source('****1000')]);
    rememberAccountSources(data, preview, new Map([['****1000', 'c1']]));
    const other = await prepareAccountRecognition(data, [
      source('****1000','card','yuh'), source('****1000','depot'), {source:'****1000',type:'card'},
    ]);
    expect(other.sources.map(s => s.accountId)).toEqual([undefined, undefined, undefined]);
    expect(other.sources[2]!.fingerprint).toBeUndefined();
  });

  it('leere, vollständig maskierte oder allgemeine Angaben bleiben manuell', async () => {
    const data = dataWithAccounts();
    const sources = ['', 'Kontonummer', 'CH00 XXXX XXXX XXXX XXXX X', 'CH00 0023 0XXX XXXX XXXX X', 'CH00 0000 0000 0000 0000 0', '****', 'N/A'].map(v => source(v));
    const preview = await prepareAccountRecognition(data, sources);
    expect(preview.sources.every(v => !v.fingerprint && !v.accountId)).toBe(true);
    rememberAccountSources(data, preview, new Map(sources.map(v => [v.source, 'b'])));
    expect(data.accountRecognition).toBeUndefined();
  });

  it('merkt sich einen vollständigen IBAN auch ohne Angabe der Bank und unabhängig vom Abstand', async () => {
    const data = dataWithAccounts();
    const iban = fakeSwissIban('12345');
    const preview = await prepareAccountRecognition(data, [{ source:iban, type:'bank'}]);
    rememberAccountSources(data, preview, new Map([[iban, 'b']]));
    const next = await prepareAccountRecognition(data, [source(iban.match(/.{1,4}/g)!.join(' '), 'bank', 'ubs')]);
    expect(next.sources[0]?.accountId).toBe('b');
    expect(JSON.stringify(data)).not.toContain(iban);
  });

  it('unterscheidet bekannte Clearingnummern, unbekannte IBANs und kombinierte Konto-/Kartenfelder', () => {
    const table = parseCsv('Transaktionsdatum;Konto- oder Kartennummer;Beschreibung;Einnahmen oder Ausgaben;Betrag;Währung;Kategorie\n01.01.2026;****0123;Kauf;Ausgaben;-3;CHF;Reise');
    expect(describeAccountSources(table, ['****1111', fakeSwissIban('00230')], 'expenses',1)).toMatchObject([
      {type:'card',bankId:'ubs',masked:true}, {type:'bank',bankId:'ubs',masked:false},
    ]);
    const generic: CsvTable = {header:['Datum','IBAN','Beschreibung'],rows:[]};
    expect(describeAccountSources(generic,[fakeSwissIban('09000'), fakeSwissIban('12345')],'expenses',1)
      .map(s => s.bankId)).toEqual(['postfinance', undefined]);
    expect(describeAccountSources(generic,[fakeSwissIban('00230')],'invest',1)[0]!.type).toBe('depot');
    // Common public Visa test number; an explicit bank-account field wins.
    expect(describeAccountSources(table,['4111111111111111'],'expenses',1)[0]!.type).toBe('card');
    expect(describeAccountSources(generic,['4111111111111111'],'expenses',1)[0]!.type).toBe('bank');
  });

  it('prüft die gespeicherte Zuordnung beim Backup-Import und akzeptiert bestehende Backups', async () => {
    const data = dataWithAccounts();
    expect(parseAppData(JSON.stringify(data))).toEqual(data);
    const preview = await prepareAccountRecognition(data, [source('****1000')]);
    rememberAccountSources(data, preview, new Map([['****1000', 'c1']]));
    for (const [key, bindings] of [
      ['', {}], [data.accountRecognition!.key, { '****1000': 'c1' }],
      [data.accountRecognition!.key, { [preview.sources[0]!.fingerprint!]: 'missing' }],
    ]) {
      expect(() => parseAppData(JSON.stringify({...data, accountRecognition:{key,bindings}}))).toThrow(/accountRecognition/);
    }
  });
});
