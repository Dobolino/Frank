import { describe, expect, it } from 'vitest';
import { taxParamsFor } from '../src/params/taxData';
import { applyScale } from '../src/domain/tax/scales';

/** Aesch BL: unabhängige Vergleichswerte aus der ersten Version von Frank (vor den ESTV-Exporten). */
const AESCH_BL = 2761;
const paramsFor = (year: number) => {
  const { params, exact } = taxParamsFor(year, AESCH_BL);
  if (!params || !exact) throw new Error(`Keine Daten für ${year}`);
  return params;
};

/**
 * Vergleichswerte aus dem offiziellen ESTV-Steuerrechner (abgerufen 15.11.2026),
 * Aesch BL, ledig, ohne Kinder, ohne Konfession, Eingabe = steuerbares Einkommen/Vermögen.
 * Spalten: [Jahr, steuerbares Einkommen, Bund, Kanton, Gemeinde]
 */
const INCOME: [number, number, number, number, number][] = [
  [2023, 16000, 0, 0, 0],
  [2023, 20000, 40, 286, 160],
  [2023, 30000, 117, 1118, 626],
  [2023, 40000, 203, 2254, 1262],
  [2023, 45000, 296, 2909, 1629],
  [2023, 50000, 428, 3594, 2013],
  [2023, 55000, 560, 4301, 2409],
  [2023, 60000, 704, 5027, 2815],
  [2023, 65000, 853, 5772, 3232],
  [2023, 70000, 1001, 6532, 3658],
  [2023, 80000, 1482, 8099, 4536],
  [2023, 100000, 2802, 11389, 6378],
  [2023, 120000, 4441, 14832, 8306],
  [2023, 150000, 7363, 20075, 11242],
  [2023, 250000, 19916, 37956, 21255],
  [2024, 16000, 0, 0, 0],
  [2024, 20000, 39, 270, 151],
  [2024, 30000, 116, 1086, 608],
  [2024, 40000, 200, 2208, 1236],
  [2024, 45000, 281, 2857, 1600],
  [2024, 50000, 413, 3538, 1981],
  [2024, 55000, 545, 4241, 2375],
  [2024, 60000, 687, 4964, 2780],
  [2024, 65000, 835, 5704, 3194],
  [2024, 70000, 984, 6461, 3618],
  [2024, 80000, 1423, 8021, 4492],
  [2024, 100000, 2737, 11296, 6326],
  [2024, 120000, 4334, 14731, 8249],
  [2024, 150000, 7203, 19969, 11183],
  [2024, 250000, 19685, 37832, 21186],
  [2025, 16000, 0, 0, 0],
  [2025, 20000, 37, 257, 144],
  [2025, 30000, 114, 1062, 595],
  [2025, 40000, 198, 2172, 1216],
  [2025, 45000, 269, 2815, 1576],
  [2025, 50000, 401, 3494, 1956],
  [2025, 55000, 533, 4194, 2349],
  [2025, 60000, 671, 4914, 2752],
  [2025, 65000, 820, 5651, 3165],
  [2025, 70000, 968, 6406, 3587],
  [2025, 80000, 1381, 7960, 4458],
  [2025, 100000, 2688, 11224, 6285],
  [2025, 120000, 4254, 14651, 8205],
  [2025, 150000, 7081, 19885, 11136],
  [2025, 250000, 19514, 37735, 21131],
  [2026, 16000, 0, 0, 0],
  [2026, 20000, 37, 256, 143],
  [2026, 30000, 114, 1060, 594],
  [2026, 40000, 198, 2169, 1215],
  [2026, 45000, 269, 2812, 1575],
  [2026, 50000, 401, 3491, 1955],
  [2026, 55000, 533, 4191, 2347],
  [2026, 60000, 671, 4910, 2750],
  [2026, 65000, 820, 5648, 3163],
  [2026, 70000, 968, 6402, 3585],
  [2026, 80000, 1378, 7956, 4455],
  [2026, 100000, 2684, 11219, 6283],
  [2026, 120000, 4249, 14646, 8202],
  [2026, 150000, 7076, 19880, 11133],
  [2026, 250000, 19503, 37728, 21128],
];
const WEALTH: [number, number, number, number][] = [
  [2023, 50000, 55, 31],
  [2023, 100000, 110, 62],
  [2023, 150000, 165, 92],
  [2023, 300000, 600, 336],
  [2023, 500000, 1240, 694],
  [2024, 50000, 55, 31],
  [2024, 100000, 110, 62],
  [2024, 150000, 165, 92],
  [2024, 300000, 600, 336],
  [2024, 500000, 1240, 694],
  [2025, 50000, 55, 31],
  [2025, 100000, 110, 62],
  [2025, 150000, 165, 92],
  [2025, 300000, 600, 336],
  [2025, 500000, 1240, 694],
  [2026, 50000, 55, 31],
  [2026, 100000, 110, 62],
  [2026, 150000, 165, 92],
  [2026, 300000, 600, 336],
  [2026, 500000, 1240, 694],
];

const TOLERANCE_CHF = 1;

describe('Einkommenssteuer gegen ESTV-Rechner', () => {
  it.each(INCOME)('%i: Einkommen %i → Bund %i, Kanton %i, Gemeinde %i', (year, income, fed, canton, city) => {
    const p = paramsFor(year);
    const fedRaw = applyScale(p.federal.income, Math.floor(income / 100) * 100);
    const fedTax = fedRaw < 25 ? 0 : fedRaw;
    const simple = applyScale(p.canton.income, income);
    expect(Math.abs(fedTax - fed)).toBeLessThanOrEqual(TOLERANCE_CHF);
    expect(Math.abs(simple * p.rates.incomeCanton - canton)).toBeLessThanOrEqual(TOLERANCE_CHF);
    expect(Math.abs(simple * p.rates.incomeCity - city)).toBeLessThanOrEqual(TOLERANCE_CHF);
  });
});

describe('Vermögenssteuer gegen ESTV-Rechner', () => {
  it.each(WEALTH)('%i: steuerbares Vermögen %i → Kanton %i, Gemeinde %i', (year, wealth, canton, city) => {
    const p = paramsFor(year);
    const simple = applyScale(p.canton.wealth!, wealth);
    expect(Math.abs(simple * p.rates.wealthCanton - canton)).toBeLessThanOrEqual(TOLERANCE_CHF);
    expect(Math.abs(simple * p.rates.wealthCity - city)).toBeLessThanOrEqual(TOLERANCE_CHF);
  });
});
