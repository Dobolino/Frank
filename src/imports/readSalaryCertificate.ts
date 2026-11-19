import { parseSalaryCertificateCsv, type SalaryCertificate } from '../domain/salaryCertificate';
import type { MonthlyPayslip } from '../domain/monthlyPayslip';

export type SalaryDocument = SalaryCertificate | MonthlyPayslip;
export interface SalaryReadOptions {
  signal?: AbortSignal;
  onOcr?: (page: number, total: number) => void;
}

export async function readSalaryCertificate(file: File, options: SalaryReadOptions = {}): Promise<SalaryDocument> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Bitte ein einzelnes Lohndokument bis 25 MB wählen.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  options.signal?.throwIfAborted();
  const pdf = new TextDecoder('ascii').decode(bytes.subarray(0, 1024)).includes('%PDF-');
  if (pdf) {
    const { readSalaryCertificatePdf } = await import('./salaryPdf');
    return readSalaryCertificatePdf(bytes, options);
  }
  if (!/\.csv$/i.test(file.name) && !['text/csv','application/csv'].includes(file.type)) {
    throw new Error('Bitte eine Monatsabrechnung oder einen Lohnausweis als PDF wählen. Jahreswerte können auch als CSV importiert werden.');
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('windows-1252').decode(bytes); }
  return parseSalaryCertificateCsv(text);
}
