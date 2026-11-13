// Turns the files a clinician uploads into something the AI can read:
// - images (including HEIC where the browser supports it) are downscaled to a JPEG data URL;
// - PDFs are rendered to page images with pdf.js, and their text layer is pulled out too;
// - plain text / Word-as-text is read directly.
// Everything stays in the browser; only the result is sent to the clinical API.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_DIM = 1600;      // longest side of an image sent to the AI
const MAX_PDF_PAGES = 6;   // pages rendered from a PDF
const JPEG_QUALITY = 0.72;

function downscale(bitmapOrImg, w, h) {
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(bitmapOrImg, 0, 0, cw, ch);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function imageToDataUrl(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const url = downscale(bitmap, bitmap.width, bitmap.height);
    bitmap.close?.();
    return url;
  } catch {
    // Fallback for browsers/formats without createImageBitmap (e.g. some HEIC).
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(downscale(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => reject(new Error('That image could not be read. Try a JPG or PNG photo.'));
      img.src = URL.createObjectURL(file);
    });
  }
}

async function readPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf, disableAutoFetch: true, disableStream: true }).promise;
  const images = [];
  const texts = [];
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i); // eslint-disable-line no-await-in-loop
    try {
      const content = await page.getTextContent(); // eslint-disable-line no-await-in-loop
      const text = content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
      if (text) texts.push(text);
    } catch {}
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_DIM / Math.max(viewport.width, viewport.height));
    const scaled = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(scaled.width);
    canvas.height = Math.round(scaled.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: scaled }).promise; // eslint-disable-line no-await-in-loop
    images.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
  }
  await pdf.destroy();
  // If the PDF is clearly text (lots of extracted text), the text alone is enough and much cheaper.
  const textLen = texts.join(' ').length;
  return textLen > 400 ? { text: texts.join('\n') } : { images, text: texts.join('\n') || undefined };
}

// Returns { name, images?: [dataURL], text?: string } for one file, ready for /ai/read.
export async function readForAi(file) {
  const type = (file.type || '').toLowerCase();
  const name = file.name || 'document';
  if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    return { name, ...(await readPdf(file)) };
  }
  if (type.startsWith('image/')) {
    return { name, images: [await imageToDataUrl(file)] };
  }
  if (type === 'text/plain' || name.toLowerCase().endsWith('.txt')) {
    return { name, text: (await file.text()).slice(0, 24000) };
  }
  // Word and anything else: store it, but it can't be read here. The clinician can photograph the page.
  return { name, unreadable: true };
}
