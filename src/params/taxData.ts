import raw from './generated/tax-data.json';
import type { Scale } from '../domain/tax/scales';

/**
 * Steuerdaten aller Kantone und Gemeinden aus dem ESTV-Steuerrechner.
 * Die Datei `generated/tax-data.json` erzeugt `npm run update-tax`. Nicht von Hand ändern.
 */

export type Confession = 'none' | 'protestant' | 'roman' | 'christ';

export const CONFESSION_LABELS: Record<Confession, string> = {
  none: 'Keine / andere',
  protestant: 'Evangelisch-reformiert',
  roman: 'Römisch-katholisch',
  christ: 'Christkatholisch',
};

/** Übrige Berufskosten: Grundbetrag + Prozent vom Nettolohn, begrenzt durch Minimum und Maximum. */
export interface OtherProfessional {
  base: number;
  percent: number;
  min: number;
  max: number | null;
}

export interface Deductions {
  /** null: kein Maximum. */
  commuteMax: number | null;
  otherPro: OtherProfessional | null;
  mealFull: number;
  mealReduced: number;
  pillar3aMax: number;
  /** Versicherungsprämien und Sparzinsen für Ledige mit Pensionskasse. */
  insuranceMax: number | null;
  /** Sozialabzüge für Ledige. */
  personal: { id: string; label: string; amount: number }[];
  /** Entlastung tiefer Einkommen (LU): Prozent der Differenz zur Schwelle. */
  lowIncome?: { threshold: number; percent: number } | null;
  /** Mieterabzug (ZG, VD): Maximum. Den Betrag erfasst die Person selbst. */
  rentMax?: number | null;
}

export interface Calibration {
  /** Indexierter Tarif: Steuer = k · Tarif(Einkommen / k). */
  divisor?: number;
  cantonFactor?: number;
  cityFactor?: number;
  /** Gemeinde mit eigenem Index (VS): Faktor zur Kantonssteuer je steuerbarem Einkommen, dazwischen linear. */
  cityCurve?: [income: number, factor: number][];
  wealthCantonFactor?: number;
  wealthCityFactor?: number;
  /** Personal- oder Kopfsteuer in CHF. */
  personalTax?: number;
  /** Teile, die nur angenähert berechnet werden. */
  approximate?: string[];
}

export interface CantonYear {
  income: Scale;
  wealth: Scale | null;
  deductions: Deductions & { wealthAllowance: number };
  calibration?: Calibration;
}

interface TaxDataFile {
  generatedAt: string;
  source: string;
  years: number[];
  /** BFS-Nummer → [Name, Kanton] */
  municipalities: Record<string, [string, string]>;
  federal: Record<string, { income: Scale; deductions: Deductions }>;
  cantons: Record<string, Record<string, CantonYear>>;
  /** Jahr → BFS-Nummer → Steuerfüsse in %: [Kanton, Gemeinde, ref., kath., christkath.] (+ gleich für Vermögen, falls abweichend) */
  rates: Record<string, Record<string, number[]>>;
}

const DATA = raw as unknown as TaxDataFile;

export const TAX_DATA_INFO = { generatedAt: DATA.generatedAt, source: DATA.source };
export const SUPPORTED_TAX_YEARS = [...DATA.years].sort((a, b) => a - b);

export const CANTON_NAMES: Record<string, string> = {
  AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden', BE: 'Bern', BL: 'Basel-Landschaft',
  BS: 'Basel-Stadt', FR: 'Freiburg', GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern',
  NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen', SH: 'Schaffhausen', SO: 'Solothurn',
  SZ: 'Schwyz', TG: 'Thurgau', TI: 'Tessin', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich',
};

/** Kantonale Pauschalen, die nicht im ESTV-Export stehen. */
const CANTON_EXTRAS: Record<string, { bikeFlat?: number }> = {
  BL: { bikeFlat: 700 },
};

export interface Municipality {
  bfsId: number;
  name: string;
  canton: string;
}

export const MUNICIPALITIES: Municipality[] = Object.entries(DATA.municipalities)
  .map(([bfs, [name, canton]]) => ({ bfsId: Number(bfs), name, canton }))
  .sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));

export function findMunicipality(bfsId: number): Municipality | undefined {
  const hit = DATA.municipalities[String(bfsId)];
  return hit ? { bfsId, name: hit[0], canton: hit[1] } : undefined;
}

/** Suche nach Name oder BFS-Nummer, Treffer am Wortanfang zuerst. */
export function searchMunicipalities(query: string, limit = 12): Municipality[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: Municipality[] = [];
  const contains: Municipality[] = [];
  for (const m of MUNICIPALITIES) {
    const n = normalize(`${m.name} ${m.canton}`);
    if (n.startsWith(q) || String(m.bfsId) === q) starts.push(m);
    else if (n.includes(q)) contains.push(m);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface Rates {
  incomeCanton: number;
  incomeCity: number;
  incomeChurch: number;
  wealthCanton: number;
  wealthCity: number;
  wealthChurch: number;
}

const CHURCH_INDEX: Record<Confession, number | null> = { none: null, protestant: 2, roman: 3, christ: 4 };

function toRates(r: number[], church: Confession): Rates {
  const w = r.length > 5 ? r.slice(5) : r;
  const i = CHURCH_INDEX[church];
  return {
    incomeCanton: r[0]! / 100,
    incomeCity: r[1]! / 100,
    incomeChurch: i === null ? 0 : r[i]! / 100,
    wealthCanton: w[0]! / 100,
    wealthCity: w[1]! / 100,
    wealthChurch: i === null ? 0 : w[i]! / 100,
  };
}

export interface TaxYearParams {
  /** Jahr, aus dem die Tarife stammen. */
  year: number;
  federal: { income: Scale; deductions: Deductions };
  canton: CantonYear & { code: string; name: string; bikeFlat?: number };
  municipality: Municipality & { ratesYear: number };
  rates: Rates;
  church: Confession;
}

export interface TaxParamsLookup {
  params: TaxYearParams | null;
  /** true, wenn für genau dieses Jahr Daten vorliegen. */
  exact: boolean;
  /** Hinweis, falls ein anderes Jahr verwendet wird oder die Gemeinde fehlt. */
  note?: string;
}

const nearest = (years: number[], year: number): number | undefined =>
  years.length === 0 ? undefined : years.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) || (Math.abs(b - year) === Math.abs(a - year) && b < a) ? b : a));

/** Parameter für Jahr und Wohnort. Fehlt das Jahr, gelten die Werte des nächstliegenden Jahres (mit Hinweis). */
export function taxParamsFor(year: number, bfsId: number, church: Confession = 'none'): TaxParamsLookup {
  const muni = findMunicipality(bfsId);
  if (!muni) return { params: null, exact: false, note: 'Die gewählte Gemeinde ist in den Steuerdaten nicht vorhanden. Bitte Wohnort neu wählen.' };
  const cantonYears = Object.keys(DATA.cantons[muni.canton] ?? {}).map(Number);
  const ratesYears = SUPPORTED_TAX_YEARS.filter((y) => DATA.rates[String(y)]?.[String(bfsId)]);
  const useYear = cantonYears.includes(year) ? year : nearest(cantonYears, year);
  const useRatesYear = ratesYears.includes(year) ? year : nearest(ratesYears, year);
  if (useYear === undefined || useRatesYear === undefined) return { params: null, exact: false, note: `Für ${muni.name} fehlen Steuerdaten.` };

  const canton = DATA.cantons[muni.canton]![String(useYear)]!;
  const federalYear = DATA.federal[String(useYear)] ? useYear : nearest(Object.keys(DATA.federal).map(Number), year)!;
  const exact = useYear === year && useRatesYear === year;
  let note: string | undefined;
  if (!exact) {
    note =
      year > useYear
        ? `Für ${year} hat die ESTV noch keine beschlossenen Steuerfüsse und Tarife publiziert. Frank rechnet provisorisch mit den Werten ${useYear}.`
        : `Für ${year} fehlen Steuerdaten. Frank rechnet mit den Werten ${useYear}.`;
  }

  return {
    exact,
    note,
    params: {
      year: useYear,
      federal: DATA.federal[String(federalYear)]!,
      canton: { ...canton, code: muni.canton, name: CANTON_NAMES[muni.canton] ?? muni.canton, ...CANTON_EXTRAS[muni.canton] },
      municipality: { ...muni, ratesYear: useRatesYear },
      rates: toRates(DATA.rates[String(useRatesYear)]![String(bfsId)]!, church),
      church,
    },
  };
}

/** Steuerfüsse einer Gemeinde für die Anzeige (in Prozent). */
export function ratesFor(year: number, bfsId: number): { year: number; rates: Rates } | null {
  const lookup = taxParamsFor(year, bfsId);
  return lookup.params ? { year: lookup.params.municipality.ratesYear, rates: lookup.params.rates } : null;
}

/** Gemeinde zum Profil: BFS-Nummer, sonst Suche nach Name und Kanton (ältere Daten ohne BFS-Nummer). */
export function resolveBfsId(profile: { bfsId?: number; municipality?: string; canton?: string }): number | undefined {
  if (profile.bfsId !== undefined && findMunicipality(profile.bfsId)) return profile.bfsId;
  if (!profile.municipality) return undefined;
  const hits = searchMunicipalities(profile.municipality, 50).filter((m) => !profile.canton || m.canton === profile.canton);
  const exact = hits.find((m) => normalize(m.name) === normalize(profile.municipality!) || normalize(`${m.name}`) === normalize(`${profile.municipality} ${profile.canton ?? ''}`));
  return (exact ?? hits[0])?.bfsId;
}
