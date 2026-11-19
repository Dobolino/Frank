import { isAnnualSalaryCertificate, salaryPosition } from '../domain/salaryCertificate';

type Bounds = { x0: number; y0: number; x1: number; y1: number };
type OcrLine = { text: string; words: { text: string; bbox: Bounds }[] };
type AnnualAmountCrop = {
  lineIndex: number; left: number; top: number; width: number; height: number;
  prefix: string; pageAmount: string;
};

// The amount box is at the far right of the official form. Only re-read an
// amount which already has digit-like ink on the same line as a supported position.
export function annualAmountCrops(lines: readonly OcrLine[], pageWidth: number): AnnualAmountCrop[] {
  if (!isAnnualSalaryCertificate(lines.map(line => line.text))) return [];
  const crops: AnnualAmountCrop[] = [];
  lines.forEach((line, lineIndex) => {
    if (!salaryPosition(line.text)) return;
    const words = line.words;
    const last = words.at(-1);
    if (!last || last.bbox.x1 < 0.78 * pageWidth) return;
    let start = words.length;
    while (start > 0) {
      const word = words[start - 1]!;
      if (word.bbox.x0 < 0.74 * pageWidth || !/^[\d.,'’‘ʼ′°+-]+$/.test(word.text)) break;
      const next = words[start];
      if (next && next.bbox.x0 - word.bbox.x1 > 1.5 * (next.bbox.y1 - next.bbox.y0)) break;
      // The signs in the standard form are preprinted in another column.
      if (!/\d/.test(word.text) && !/^[.,'’‘ʼ′°]$/.test(word.text)) break;
      start--;
    }
    if (start === words.length || !words.slice(start).some(word => /\d/.test(word.text))) return;
    const boxes = words.slice(start).map(word => word.bbox);
    const left = Math.max(0, Math.min(...boxes.map(b => b.x0)) - 4);
    const top = Math.max(0, Math.min(...boxes.map(b => b.y0)) - 4);
    crops.push({ lineIndex, left, top, width: Math.min(pageWidth, Math.max(...boxes.map(b => b.x1)) + 4) - left,
      height: Math.max(...boxes.map(b => b.y1)) + 4 - top,
      prefix: words.slice(0, start).map(word => word.text).join(' '),
      pageAmount: words.slice(start).map(word => word.text).join(' ') });
  });
  return crops;
}

// Replacing the entire amount suffix prevents partial matches, e.g. the 200
// in an uncertain OCR result "X'200". Blank fields remain editable for review.
export function withAnnualCropAmount(crop: AnnualAmountCrop, ocrText: string): string {
  const normalize = (value: string) => value.trim().replace(/[’‘ʼ′°]/g, "'").replace(/\s*'\s*/g, "'").replace(/([.,])\s+(?=\d{2}$)/, '$1');
  const money = /^[+-]?(?:\d{1,3}(?:[' ]\d{3})+|\d+)(?:[.,](?:\d{2}|[-–]))?$/;
  let raw = normalize(ocrText);
  const page = normalize(crop.pageAmount);
  // A crop can lose the decimal point. Keep the full-page currency formatting
  // only when the second reading independently confirms every digit and sign.
  if (!money.test(raw) && /^[+-]?[\d ']+$/.test(raw) && /[.,]\d{2}$/.test(page) && money.test(page) &&
      page.replace(/[' .,+]/g, '') === raw.replace(/[' +]/g, '')) raw = page;
  // Delimit the result from a preprinted accounting sign misread as a digit.
  return crop.prefix + (money.test(raw) ? ' = ' + raw : ' [Betrag unlesbar]');
}
