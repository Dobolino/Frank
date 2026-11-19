import { getDocument, GlobalWorkerOptions, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFPageProxy } from 'pdfjs-dist';
import { isMonthlyPayslip, parseMonthlyPayslip } from '../domain/monthlyPayslip';
import type { SalaryDocument, SalaryReadOptions } from './readSalaryCertificate';
import { isAnnualSalaryCertificate, parseSalaryCertificateText } from '../domain/salaryCertificate';

GlobalWorkerOptions.workerSrc = workerUrl;
type Cell = { x: number; y: number; text: string };
type Field = { key: string; value: string };

async function pageData(page: PDFPageProxy) {
  const [content, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
  const transform = page.getViewport({scale: 1}).transform;
  const cells: Cell[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const coords = Util.transform(transform, item.transform);
    cells.push({x: coords[4]!, y: coords[5]!, text:item.str.trim()});
  }
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: Cell[][] = [];
  for (const cell of cells) {
    const line = groups.at(-1);
    if (line && Math.abs(line[0]!.y - cell.y) <= 3) line.push(cell);
    else groups.push([cell]);
  }
  const lines = groups.map(group => group.sort((a, b) => a.x - b.x).map(cell => cell.text).join(' '));
  const form: Field[] = [];
  const dates: Record<string, string> = {TextLinks_D:'year', 'TextLinks_E-von':'from', 'TextLinks_E-bis':'to'};
  for (const field of annotations) {
    if (typeof field.fieldName !== 'string') continue;
    const name = field.fieldName.split('.').at(-1);
    if (field.fieldType === 'Tx' && typeof field.fieldValue === 'string') {
      const position = /^DezZahlNull_(\d+(?:_\d+)*)$/.exec(name)?.[1]?.replace(/_/g, '.');
      const key = position ?? (Object.hasOwn(dates, name) ? dates[name] : undefined);
      if (key) form.push({key, value:field.fieldValue});
    }
    if (name === 'OptionKreuzOhneRahmen_13_1_1' && field.fieldValue && field.fieldValue !== 'Off') {
      form.push({key:'13.1.1', value:'X'});
    }
    if (name === 'OptionKreuzOhneRahmen_B' && field.fieldValue && field.fieldValue !== 'Off') {
      throw new Error('Dieses Formular ist als Rentenbescheinigung markiert. Bitte einen Lohnausweis wählen.');
    }
  }
  return {lines, form};
}

function readPage(lines: string[], form: Field[], fromScan = false): SalaryDocument | undefined {
  if (form.length || isAnnualSalaryCertificate(lines)) return parseSalaryCertificateText(lines, form, fromScan);
  if (isMonthlyPayslip(lines)) return parseMonthlyPayslip(lines);
}

// A scanner can leave a long but unusable OCR layer over the page image.
async function hasLargePageImage(page: PDFPageProxy): Promise<boolean> {
  const ops = await page.getOperatorList();
  return ops.fnArray.some((op, i) => {
    if (op !== OPS.paintImageXObject) return false;
    const [, width, height] = ops.argsArray[i];
    return width >= 600 && height >= 600;
  });
}

export async function readSalaryCertificatePdf(data: Uint8Array, options: SalaryReadOptions = {}): Promise<SalaryDocument> {
  const { signal, onOcr } = options;
  signal?.throwIfAborted();
  const task = getDocument({data, useWasm: false, useWorkerFetch: false, disableFontFace: true, useSystemFonts: true});
  try {
    const doc = await task.promise;
    if (doc.numPages > 30) throw new Error('Bitte nur die Seiten eines einzelnen Lohndokuments auswählen.');
    let result: SalaryDocument | undefined;
    for (let number = 1; number <= doc.numPages; number++) {
      signal?.throwIfAborted();
      const page = await doc.getPage(number);
      try {
        const {lines, form} = await pageData(page);
        let parsed = readPage(lines, form);
        // A scan can have a small text layer for a page number or watermark.
        if (!parsed && (lines.join(' ').length < 200 || await hasLargePageImage(page))) {
          onOcr?.(number, doc.numPages);
          const { recognizeSalaryPage } = await import('./salaryOcr');
          const recognized = await recognizeSalaryPage(page, signal);
          parsed = readPage(recognized, [], true);
        }
        if (!parsed) continue;
        if (result) throw new Error('Mehrere Lohndokumente im PDF erkannt. Bitte jeden Ausweis oder jede Monatsabrechnung einzeln importieren.');
        result = parsed;
      } finally {
        page.cleanup();
      }
    }
    signal?.throwIfAborted();
    if (!result) throw new Error('Die Lohnpositionen liessen sich keinem Jahresausweis oder Monatsbeleg zuordnen. Prüfe, ob Titel, Beschriftungen und Beträge auf der Seite sichtbar sind.');
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new Error('Das PDF ist passwortgeschützt. Bitte eine bereits entsperrte Kopie wählen.');
    }
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('Das PDF konnte nicht geöffnet werden.');
    throw error;
  } finally {
    await task.destroy();
  }
}
