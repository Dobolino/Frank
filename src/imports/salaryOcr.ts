import type { Page } from 'tesseract.js';
import { annualAmountCrops, withAnnualCropAmount } from './annualOcrAmounts';
import type { PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import { simd } from 'wasm-feature-detect';
import scalarCoreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import simdCoreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import modelUrl from '@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz?url';

async function pngBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Die PDF-Seite konnte nicht gerendert werden.')), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

// Thin Swiss thousands marks and decimal points are sensitive to the PDF
// renderer's antialiasing. Binarize the rendered number box separately from
// the page layout, adapting to the observed ink and paper brightness.
function sharpenAmount(ctx: CanvasRenderingContext2D) {
  const pixels = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const rgba = pixels.data;
  let darkest = 255, lightest = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const grey = Math.round((299 * rgba[i]! + 587 * rgba[i + 1]! + 114 * rgba[i + 2]!) / 1000);
    darkest = Math.min(darkest, grey);
    lightest = Math.max(lightest, grey);
    rgba[i] = grey;
  }
  const threshold = darkest + 0.75 * (lightest - darkest);
  for (let i = 0; i < rgba.length; i += 4) {
    const value = rgba[i]! < threshold ? 0 : 255;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
  }
  ctx.putImageData(pixels, 0, 0);
}

// Own the Tesseract worker from startup: switching files must also cancel WASM
// and language initialization, before the high-level API exposes its worker.
async function recognizeImage(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(modelUrl, { signal });
  if (!response.ok) throw new Error('Das Sprachmodell für die Texterkennung konnte nicht geladen werden.');
  const data = new Uint8Array(await response.arrayBuffer());
  signal?.throwIfAborted();
  const worker = new Worker(workerUrl);
  const unavailable = () => new Error('Die lokale Texterkennung ist fehlgeschlagen. Versuche es erneut oder verwende ein PDF mit Textebene.');
  let rejectJob: ((reason: unknown) => void) | undefined;
  const abort = () => rejectJob?.(signal?.reason);
  signal?.addEventListener('abort', abort);
  let job = 0;
  function request<T = unknown>(action: string, payload: object, transfer: Transferable[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      rejectJob = reject;
      const jobId = String(++job);
      worker.onerror = () => reject(unavailable());
      worker.onmessageerror = () => reject(unavailable());
      worker.onmessage = event => {
        const message = event.data;
        if (message.jobId !== jobId) return;
        if (message.status === 'resolve') resolve(message.data as T);
        if (message.status === 'reject') reject(unavailable());
      };
      worker.postMessage({ workerId: 'salary', jobId, action, payload }, transfer);
    });
  }
  try {
    const coreUrl = await simd() ? simdCoreUrl : scalarCoreUrl;
    await request('load', { options: { lstmOnly: true, corePath: new URL(coreUrl, document.baseURI).href } });
    await request('loadLanguage', { langs: [{ code: 'deu', data }], options: { cacheMethod: 'none', gzip: true, lstmOnly: true } }, [data.buffer]);
    await request('initialize', { langs: 'deu', oem: 1, config: {} });
    async function read(source: HTMLCanvasElement, singleLine = false) {
      const image = await pngBytes(source);
      return request<Page>('recognize', {
        image, options: { tessedit_pageseg_mode: singleLine ? '7' : '6', user_defined_dpi: '300' },
        output: { text: true, blocks: !singleLine },
      }, [image.buffer]);
    }
    const result = await read(canvas);
    const lines = result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
    const crops = annualAmountCrops(lines, canvas.width);
    if (!crops.length) return result.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    const output = lines.map(line => line.text.trim());
    const field = document.createElement('canvas');
    try {
      for (const crop of crops) {
        field.width = crop.width + 40;
        field.height = crop.height + 40;
        const ctx = field.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, field.width, field.height);
        ctx.drawImage(canvas, crop.left, crop.top, crop.width, crop.height, 20, 20, crop.width, crop.height);
        sharpenAmount(ctx);
        output[crop.lineIndex] = withAnnualCropAmount(crop, (await read(field, true)).text);
      }
    } finally {
      field.width = field.height = 0;
    }
    return output;
  } finally {
    signal?.removeEventListener('abort', abort);
    worker.terminate();
  }
}

export async function recognizeSalaryPage(page: PDFPageProxy, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted();
  const original = page.getViewport({ scale: 1 });
  const scale = Math.min(300 / 72, Math.sqrt(9_000_000 / (original.width * original.height)),
    4096 / Math.max(original.width, original.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  // PDF.js renders the visible page, including its annotations and redactions.
  const render = page.render({ canvas, viewport, background: 'white' });
  const cancel = () => render.cancel();
  signal?.addEventListener('abort', cancel);
  try {
    await render.promise;
    signal?.throwIfAborted();
    return await recognizeImage(canvas, signal);
  } finally {
    signal?.removeEventListener('abort', cancel);
    canvas.width = canvas.height = 0;
  }
}
