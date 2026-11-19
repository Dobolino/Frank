import { describe, expect, it } from 'vitest';
import { parseSalaryCertificateCsv, parseSalaryCertificateText } from '../src/domain/salaryCertificate';

describe('Lohnausweis mit Jahreswerten in CHF', () => {
  it('liest amtliche Ziffern und zählt Spesenunterpositionen einmal', () => {
    const data = parseSalaryCertificateText([
      'Jahr 2025', 'von 1.2.2025 bis 30.11.2025', "8. Bruttolohn total = CHF 81'000.–",
      '9. Beiträge AHV/IV/EO/ALV/NBUV – 4 860', '10.1 Ordentliche Beiträge 1500',
      '10.2 Beiträge für den Einkauf 200', '11. Nettolohn 74’440.00',
      '13.1 Effektive Spesen 13.1.1 Reise X', '13.1.2 Übrige 150.50',
      '13.2 Pauschalspesen 13.2.1 Repräsentation 1 200', '13.2.2 Auto 300', '13.2 Total 1 500',
      '13.3 Beiträge an Weiterbildung 800', '15. Bemerkungen Arbeitgeber zahlt Spesen 2300',
    ]);
    expect(data).toMatchObject({ year:2025, period:{from:'2025-02-01',to:'2025-11-30'}, gross:8100000,
      social:486000, pension:150000, pensionPurchase:20000, net:7444000, flatExpenses:150000, actualExpenses:15050 });
    expect(data.warnings.join(' ')).toContain('Kreuz');
  });

  it('liest den D/E-Formularkopf eines flachgedruckten Ausweises', () => {
    const data = parseSalaryCertificateText(['D 2025 E 01.03.2025 31.10.2025 G', '11. Nettolohn 29500',
      'Ort und Datum 10.02.2026']);
    expect(data).toMatchObject({year:2025, period:{from:'2025-03-01',to:'2025-10-31'}, net:2950000});
  });

  it('lässt fehlende oder widersprüchliche Positionen offen', () => {
    const data = parseSalaryCertificateText(['11. Nettolohn 50000', '13.2.1 Repräsentation 500',
      '13.2 Pauschalspesen 300', '13.1.1 Reise X', '12. Quellensteuer 2900', '8. Bruttolohn', '10.1 Ordentliche Beiträge']);
    expect(data.flatExpenses).toBeUndefined();
    expect(data.actualExpenses).toBeUndefined();
    expect(data.gross).toBeUndefined();
    expect(data.pension).toBeUndefined();
    expect(data.warnings.length).toBe(2);
    expect(() => parseSalaryCertificateText(['8. Bruttolohn', '13.1.1 Reise X'])).toThrow(/Keine eindeutigen/);
  });

  it('liest CSV mit Positionszeilen inklusive Jahr und Dezimalkomma', () => {
    const csv = 'Ziffer;Bezeichnung;Betrag CHF;Jahr\n8;Brutto;60000;2024\n9;Abzüge;-3250;2024\n13.2.2;Auto;1000,5;2024';
    expect(parseSalaryCertificateCsv(csv)).toMatchObject({gross:6000000,social:325000,flatExpenses:100050,year:2024});
    expect(() => parseSalaryCertificateCsv(csv+'\n11;Netto;50000;2023')).toThrow(/Mehrere Lohnperioden/);
  });

  it('liest französische oder italienische Spalten für genau einen Ausweis', () => {
    expect(parseSalaryCertificateCsv('Anno,Salario lordo,Salario netto,Spese forfettarie\n2026,58000,53900,"524,60"'))
      .toMatchObject({year:2026,gross:5800000,net:5390000,flatExpenses:52460});
    expect(() => parseSalaryCertificateCsv('Année;Salaire net\n2025;58000\n2025;43000')).toThrow(/einen Lohnausweis/);
  });
});
