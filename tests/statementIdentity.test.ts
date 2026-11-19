import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guessColumns, inspectBankRows, parseCsv } from '../src/domain/bankCsv';
import { bankLogoPath, bankOptions, sourceLabel } from '../src/domain/importAccounts';
import { investmentSources, parseInvestmentTable } from '../src/domain/investCsv';

const header = 'Buchungsdatum;Beschreibung;Betrag';

describe('Quellen der Konto- und Depotauszüge', () => {
  it('verwendet nur im Vorspann bezeichnete Instituts- und eigene Kontoangaben', () => {
    const table = parseCsv('Bank:;PostFinance AG\nIBAN:;CH00 9000 0000 0000 0000 0\n' + header + ';IBAN\n01.10.2026;Zahlung an UBS;-10;CH00 1234 0000 0000 0000 0');
    expect(table.statement).toEqual({ bankId: 'postfinance', sourceType: 'bank', source: 'CH0090000000000000000' });
    const map = guessColumns(table.header);
    expect(map.source).toBeUndefined();
    const entry = inspectBankRows(table, map).entries[0]!;
    expect(entry.source).toBe(table.statement?.source);
    expect(entry.transaction).toEqual({ date: '2026-10-01', text: 'Zahlung an UBS', amount: -1000 });
  });

  it('behandelt leere Quellenzeilen neben einer echten Kartennummer separat', () => {
    const table = parseCsv('Konto:;123456\n' + header + ';Eigene IBAN;Gegenkonto\n01.10.2026;A;-3;CH001;999\n02.10.2026;B;-10;;998');
    expect(inspectBankRows(table, guessColumns(table.header)).entries.map(e => e.source)).toEqual(['CH001', '']);
  });

  it('leitet aus Gegenkonten, Buchungstexten oder mehrdeutigem Vorspann kein Konto ab', () => {
    const table = parseCsv('IBAN:;CH00 1000 0000 0000 0000 0\nIBAN:;CH00 2000 0000 0000 0000 0\n' + header + ';IBAN des Empfängers\n01.10.2026;RAIFFEISEN;-12;CH009');
    expect(table.statement).toBeUndefined();
    expect(inspectBankRows(table, guessColumns(table.header)).entries[0]?.source).toBe('');
  });

  it('erkennt den UBS-Ausgabenauszug unabhängig vom Dateinamen und den Spaltenpositionen', () => {
    const table = parseCsv('Beschreibung,Transaktionsdatum,Konto- oder Kartennummer,Einnahmen oder Ausgaben,Kategorie,Betrag,Währung\nShop,01.10.2026,XXXX1111,Ausgaben,,10,CHF');
    expect(table.statement).toEqual({ bankId: 'ubs' });
    expect(inspectBankRows(table, guessColumns(table.header)).entries[0]?.source).toBe('XXXX1111');
  });

  it('liest das Quelldepot vor einem englischen Handelsdatenkopf und trennt alle Buchungen sauber', () => {
    const table = parseCsv('Broker: Swissquote Bank SA\nDepotnummer;D-12345\nTrade date;Type;Symbol;Amount\n2026-10-01;Buy;X;32');
    expect(table.statement).toEqual({ bankId: 'swissquote', source: 'D-12345', sourceType: 'depot' });
    expect(investmentSources(table)).toEqual(['D-12345']);
    expect(parseInvestmentTable(table, 'a', [], 'D-12345').rows[0]).toMatchObject({ accountId: 'a', amount: -3200 });
    expect(parseInvestmentTable(table, 'b', [], 'OTHER').rows).toHaveLength(0);
  });

  it('behandelt unterschiedlich formatierte IBANs im Depotexport als eine Quelle', () => {
    const table = parseCsv('Datum;Typ;Symbol;Betrag;Depot\n01.10.2026;Kauf;X;15;CH00 9000 0000 0000 0000 0\n02.10.2026;Kauf;Y;23;ch0090000000000000000');
    expect(investmentSources(table)).toEqual(['CH0090000000000000000']);
    expect(parseInvestmentTable(table, 'a', [], 'ch00 9000 0000 0000 0000 0').rows).toHaveLength(2);
  });

  it('zeigt nur sichtbare vier Endziffern als maskiertes Quellenlabel', () => {
    expect(sourceLabel('CH12 XXXX XXXX XXXX XXXX X', 0)).toBe('Quelle 1');
    expect(sourceLabel('XXXX 0003', 1)).toBe('Quelle 2 · •••• 0003');
  });

  it('liefert für jedes angebotene Bankbild eine vorhandene lokale Datei', () => {
    for (const bank of bankOptions) {
      const file = bankLogoPath(bank.value);
      expect(file, bank.label).toBeTruthy();
      expect(existsSync(new URL('../public/' + file, import.meta.url)), bank.label).toBe(true);
    }
    expect(bankLogoPath('andere-bank')).toBeUndefined();
  });
});
