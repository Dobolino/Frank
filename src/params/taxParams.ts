import type { BracketTariff, FormulaTariff, SliceTariff } from '../domain/tax/tariff';

/**
 * Steuerparameter pro Steuerjahr – reine Daten, keine Logik.
 *
 * Quellen:
 *  - ESTV Steuerrechner, Export «Steuertarife» und «Abzüge» (swisstaxcalculator.estv.admin.ch),
 *    abgerufen am 15.11.2026 für Aesch BL (BFS 2761), Tarif «ledig, ohne Kinder».
 *  - ESTV Kantonsblatt Basel-Landschaft, Stand Februar 2026 (§§ 29, 34, 50, 51 StG BL).
 *  - Gemeindeversammlung Aesch vom 08.12.2025: Steuerfuss natürliche Personen 56 %.
 *
 * Neues Jahr hinzufügen: Block kopieren, Werte aus denselben Quellen aktualisieren,
 * dann `npm test` (Vergleichswerte in tests/goldenTax.test.ts ergänzen).
 */

export interface FederalParams {
  tariff: BracketTariff;
  /** Steuerbares Einkommen wird auf diesen Betrag abgerundet. */
  roundIncomeTo: number;
  commuteMax: number;
  otherProfessional: { percent: number; min: number; max: number };
  mealFull: number;
  mealReduced: number;
  insuranceSingleWithPillar2: number;
  pillar3aMax: number;
}

export interface CantonParams {
  tariff: FormulaTariff;
  roundIncomeTo: number;
  /** Kantonaler Steuerfuss in % der normalen Staatssteuer (BL: 100 %). */
  cantonRate: number;
  commuteMax: number;
  /** BL: Pauschale für übrige Berufskosten. */
  otherProfessionalFlat: number;
  /** BL: Velo/Mofa-Pauschale für den Arbeitsweg. */
  bikeFlat: number;
  mealFull: number;
  mealReduced: number;
  insuranceSingle: number;
  pillar3aMax: number;
  wealth: { allowanceSingle: number; tariff: SliceTariff };
}

export interface MunicipalityParams {
  name: string;
  bfsId: number;
  /** Gemeindesteuer in % der normalen Staatssteuer (Einkommen und Vermögen). */
  rate: number;
}

export interface TaxYearParams {
  year: number;
  federal: FederalParams;
  canton: CantonParams;
  municipality: MunicipalityParams;
  sources: string[];
}

const BL_WEALTH: CantonParams['wealth'] = {
  allowanceSingle: 90_000,
  tariff: {
    kind: 'slices',
    exemptBelow: 10_000,
    slices: [
      { upTo: 150_000, permille: 1.1 },
      { upTo: 350_000, permille: 2.9 },
      { upTo: null, permille: 3.3 },
    ],
  },
};

const AESCH: MunicipalityParams = { name: 'Aesch BL', bfsId: 2761, rate: 0.56 };

const SOURCES = [
  'ESTV Steuerrechner – Tarife & Abzüge (Export vom 15.11.2026)',
  'ESTV Kantonsblatt Basel-Landschaft, Stand Februar 2026',
  'Gemeinde Aesch: Steuerfuss 56 % (Gemeindeversammlung 08.12.2025)',
];

function cantonBase(tariff: FormulaTariff, pillar3aMax: number): CantonParams {
  return {
    tariff,
    roundIncomeTo: 1,
    cantonRate: 1,
    commuteMax: 6_000,
    otherProfessionalFlat: 500,
    bikeFlat: 700,
    mealFull: 3_200,
    mealReduced: 1_600,
    insuranceSingle: 2_000,
    pillar3aMax,
    wealth: BL_WEALTH,
  };
}

function federalBase(
  tariff: BracketTariff,
  commuteMax: number,
  pillar3aMax: number,
): FederalParams {
  return {
    tariff,
    roundIncomeTo: 100,
    commuteMax,
    otherProfessional: { percent: 3, min: 2_000, max: 4_000 },
    mealFull: 3_200,
    mealReduced: 1_600,
    insuranceSingleWithPillar2: 1_800,
    pillar3aMax,
  };
}

const fed = (rows: [number, number, number][], flatFrom: number): BracketTariff => ({
  kind: 'brackets',
  brackets: rows.map(([from, baseTax, ratePercent]) => ({ from, baseTax, ratePercent })),
  flat: { from: flatFrom, ratePercent: 11.5 },
  minTax: 25,
});

export const TAX_PARAMS: Record<number, TaxYearParams> = {
  2023: {
    year: 2023,
    federal: federalBase(
      fed(
        [
          [14_800, 0, 0.77], [32_200, 133.95, 0.88], [42_200, 221.95, 2.64], [56_200, 591.55, 2.97],
          [73_900, 1_117.2, 5.94], [79_600, 1_455.75, 6.6], [105_500, 3_165.15, 8.8],
          [137_200, 5_954.75, 11], [179_400, 10_596.75, 13.2],
        ],
        769_700,
      ),
      3_200,
      7_056,
    ),
    canton: cantonBase(
      {
        kind: 'formula',
        segments: [
          { from: 16_226, b: -0.824789, c: 0.089721, d: 805.15759 },
          { from: 43_269, b: -0.327186, c: 0.043108, d: -1_211.75331 },
          { from: 108_173, b: 0.051473, c: 0.010441, d: -4_745.428983 },
        ],
        top: { from: 1_243_990, base: 228_576.4, ratePercent: 18.62 },
      },
      7_056,
    ),
    municipality: AESCH,
    sources: SOURCES,
  },
  2024: {
    year: 2024,
    federal: federalBase(
      fed(
        [
          [15_000, 0, 0.77], [32_800, 137.05, 0.88], [42_900, 225.9, 2.64], [57_200, 603.4, 2.97],
          [75_200, 1_138, 5.94], [81_000, 1_482.5, 6.6], [107_400, 3_224.9, 8.8],
          [139_600, 6_058.5, 11], [182_600, 10_788.5, 13.2],
        ],
        783_300,
      ),
      3_200,
      7_056,
    ),
    canton: cantonBase(
      {
        kind: 'formula',
        segments: [
          { from: 16_500, b: -0.826281, c: 0.08972, d: 818.725099 },
          { from: 44_000, b: -0.327919, c: 0.043109, d: -1_232.14815 },
          { from: 110_000, b: 0.051298, c: 0.010441, d: -4_825.535525 },
        ],
        top: { from: 1_265_000, base: 232_436.77, ratePercent: 18.62 },
      },
      7_056,
    ),
    municipality: AESCH,
    sources: SOURCES,
  },
  2025: {
    year: 2025,
    federal: federalBase(
      fed(
        [
          [15_200, 0, 0.77], [33_200, 138.6, 0.88], [43_500, 229.2, 2.64], [58_000, 612, 2.97],
          [76_100, 1_149.55, 5.94], [82_000, 1_500, 6.6], [108_800, 3_268.8, 8.8],
          [141_500, 6_146.4, 11], [184_900, 10_920.4, 13.2],
        ],
        793_400,
      ),
      3_300,
      7_258,
    ),
    canton: cantonBase(
      {
        kind: 'formula',
        segments: [
          { from: 16_716, b: -0.827429, c: 0.089718, d: 829.41877 },
          { from: 44_577, b: -0.328481, c: 0.043109, d: -1_248.266121 },
          { from: 111_442, b: 0.051162, c: 0.010441, d: -4_888.819148 },
        ],
        top: { from: 1_281_587, base: 235_484.5479, ratePercent: 18.62 },
      },
      7_258,
    ),
    municipality: AESCH,
    sources: SOURCES,
  },
  2026: {
    year: 2026,
    federal: federalBase(
      fed(
        [
          [15_200, 0, 0.77], [33_200, 138.6, 0.88], [43_500, 229.2, 2.64], [58_000, 612, 2.97],
          [76_200, 1_152.5, 5.94], [82_100, 1_502.95, 6.6], [108_900, 3_271.75, 8.8],
          [141_500, 6_140.55, 11], [185_100, 10_936.55, 13.2],
        ],
        794_000,
      ),
      3_300,
      7_258,
    ),
    canton: cantonBase(
      {
        kind: 'formula',
        segments: [
          { from: 16_731, b: -0.827548, c: 0.089722, d: 830.223746 },
          { from: 44_615, b: -0.328507, c: 0.043108, d: -1_249.444454 },
          { from: 111_538, b: 0.051153, c: 0.010441, d: -4_893.077017 },
        ],
        top: { from: 1_282_692, base: 235_687.541, ratePercent: 18.62 },
      },
      7_258,
    ),
    municipality: AESCH,
    sources: SOURCES,
  },
};

export const SUPPORTED_TAX_YEARS = Object.keys(TAX_PARAMS).map(Number).sort();

/** Parameter für ein Jahr; fehlt das Jahr, wird das nächstliegende verwendet (mit Hinweis). */
export function taxParamsFor(year: number): { params: TaxYearParams; exact: boolean } {
  const exact = TAX_PARAMS[year];
  if (exact) return { params: exact, exact: true };
  const nearest = SUPPORTED_TAX_YEARS.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) ? b : a));
  return { params: TAX_PARAMS[nearest]!, exact: false };
}
