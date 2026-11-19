import { parseSalaryCertificateCsv, type SalaryCertificate } from '../domain/salaryCertificate';

export async function readSalaryCertificate(file: File): Promise<SalaryCertificate> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Bitte einen einzelnen Lohnausweis bis 25 MB wählen.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = new TextDecoder('ascii').decode(bytes.subarray(0, 1024)).includes('%PDF-');
  if (pdf) {
    const { readSalaryCertificatePdf } = await import('./salaryPdf');
    return readSalaryCertificatePdf(bytes);
  }
  if (!/\.csv$/i.test(file.name) && !['text/csv','application/csv'].includes(file.type)) {
    throw new Error('Bitte einen PDF-Lohnausweis oder eine Lohn-CSV wählen.');
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('windows-1252').decode(bytes); }
  return parseSalaryCertificateCsv(text);
}
