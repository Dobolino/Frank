import { describe, expect, it } from 'vitest';
import { annualAmountCrops, withAnnualCropAmount } from '../src/imports/annualOcrAmounts';
import { isAnnualSalaryCertificate, parseSalaryCertificateCsv, parseSalaryCertificateText } from '../src/domain/salaryCertificate';

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

describe('Jahresausweis als Scan', () => {
  it('erkennt Titel und Jahrespositionen in den Formularsprachen und unterscheidet einen Verweis auf der Monatsabrechnung', () => {
    for (const [title, label] of [
      ['A |xX Lohnausweis', '8. Bruttolohn total'], ['Certificat de salaire', 'Salaire brut'],
      ['Certificato di salario', '11. Salario netto'], ['Salary certificate', 'Gross salary'],
      ['Schweizer Lohnausweis', 'Bruttolohn'], ['Swiss Salary Certificate', 'Net salary'],
      ['Formular 11: Schweizerischer Lohnausweis', 'Nettolohn'],
    ] as const) expect(isAnnualSalaryCertificate([title, label])).toBe(true);
    for (const reference of ['Siehe Lohnausweis am Jahresende.', 'Lohnausweis folgt im Januar.']) {
      expect(isAnnualSalaryCertificate(['Lohnabrechnung September', 'Bruttolohn', reference])).toBe(false);
    }
    expect(() => parseSalaryCertificateText(['A Lohnausweis', 'B [x] Rentenbescheinigung',
      '11. Nettolohn 58000'])).toThrow(/Rentenbescheinigung/);
  });

  const lines = ['D 2024 E |01.01.2024 31.12.2024 G Kantinenverpflegung',
    '8. Bruttolohn total = 71° 000.00', '9. Beiträge AHV - 4′800.00',
    '10. Berufliche Vorsorge 10.1 Ordentliche Beiträge - 2’200.00', '11. Nettolohn / Rente = 64°000.00'];
  it('liest Druckränder und Tausenderzeichen aus der Texterkennung', () => {
    expect(parseSalaryCertificateText(lines, [], true)).toMatchObject({
      year:2024, period:{from:'2024-01-01',to:'2024-12-31'},
      gross:7100000, social:480000, pension:220000, net:6400000, warnings:[],
    });
  });
  it('liest übereinstimmende Periodendaten, wenn OCR das separate Jahresfeld beschädigt', () => {
    const [header, ...values] = lines;
    const damaged = [header!.replace('D 2024', 'D 2029'), ...values];
    expect(parseSalaryCertificateText(damaged, [], true)).toMatchObject({
      year:2024, period:{from:'2024-01-01',to:'2024-12-31'}, warnings:[expect.stringContaining('Jahresfeld')],
    });
    expect(parseSalaryCertificateText(damaged).period).toBeUndefined();
    expect(parseSalaryCertificateText([header!.replace('D 2024', 'D 7024'), ...values], [], true).period?.to).toBe('2024-12-31');
  });

  it('stellt bei unstimmigen gescannten Hauptbeträgen die betroffenen Felder zur manuellen Eingabe zurück', () => {
    const inconsistent = [...lines.slice(0, -1), '11. Nettolohn 640000.00', '13.2.2 Auto 600'];
    const certificate = parseSalaryCertificateText(inconsistent, [], true);
    for (const key of ['gross', 'net', 'social', 'pension'] as const) expect(certificate[key]).toBeUndefined();
    expect(certificate.flatExpenses).toBe(60000);
    expect(certificate.warnings.join(' ')).toContain('rechnerisch');
    expect(parseSalaryCertificateText(inconsistent).net).toBe(64000000);
  });
  it('liest nur die befüllten Betragsboxen rechts neben unterstützten Jahrespositionen ein zweites Mal', () => {
    const word = (text: string, x0: number, x1: number) => ({ text, bbox:{x0,x1,y0:200,y1:214} });
    const row = (...words: ReturnType<typeof word>[]) => ({ text: words.map(w=>w.text).join(' '), words });
    const lines = [row(word('Salary certificate',60,280)),
      row(word('8. Gross salary',40,200),word('=',700,705),word("71’000.",810,860),word('00',866,890)),
      row(word('10.1 Ordentliche Beiträge',20,320)),
      row(word('15. Bemerkungen',40,230),word('1234',840,900)),
    ];
    const crops = annualAmountCrops(lines,1000);
    expect(crops).toHaveLength(1);
    const crop = crops[0]!;
    expect(crop).toMatchObject({lineIndex:1,prefix:'8. Gross salary =',left:806,top:196,width:88,height:22});
    expect(parseSalaryCertificateText([withAnnualCropAmount(crop,'71° 000. 00')]).gross).toBe(7100000);
    expect(() => parseSalaryCertificateText([withAnnualCropAmount(crop,"7X’000.00")])).toThrow(/Keine eindeutigen/);
    const ambiguousSeparator = { ...crop, pageAmount:'2300.75' };
    expect(withAnnualCropAmount(ambiguousSeparator,'2 30075')).toContain(' = 2300.75');
    expect(withAnnualCropAmount(ambiguousSeparator,'2°‘300.75')).toContain(" = 2'300.75");
    expect(withAnnualCropAmount(ambiguousSeparator,'23°‘00.75')).toContain('[Betrag unlesbar]');
    expect(withAnnualCropAmount(ambiguousSeparator,'2 39075')).toContain('[Betrag unlesbar]');
    expect(withAnnualCropAmount(ambiguousSeparator,'-2 30075')).toContain('[Betrag unlesbar]');
    expect(annualAmountCrops(lines.slice(1),1000)).toHaveLength(0);
  });
});
