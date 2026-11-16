// src/app/shared/utils/qr-code.ts
//
// QR codes drawn in the browser with qrcode-generator (already used for the download page; no new library, no
// external service). Error correction Q (about 25% of the code can be damaged or dirty and it still scans), the
// 4-module quiet zone the standard asks for, black on white: phones read that reliably, so it stays black on
// white even in dark mode.
import qrcode from 'qrcode-generator';

export const QR_QUIET_ZONE = 4;

export interface QrMatrix {
  /** Modules per side, quiet zone included. */
  size: number;
  /** One SVG path of merged horizontal runs, in module units, quiet zone offset included. */
  path: string;
  isDark(row: number, col: number): boolean;
  modules: number;
}

export function buildQrMatrix(text: string): QrMatrix {
  const qr = qrcode(0, 'Q');
  qr.addData(text, 'Byte');
  qr.make();

  const modules = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < modules; row++) {
    let col = 0;
    while (col < modules) {
      if (!qr.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < modules && qr.isDark(row, col)) col++;
      path += `M${start + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h${col - start}v1h-${col - start}z`;
    }
  }

  return { size: modules + QR_QUIET_ZONE * 2, path, modules, isDark: (r, c) => qr.isDark(r, c) };
}

/** A standalone SVG file: vector, so it prints sharp at any size. */
export function qrSvgDocument(matrix: QrMatrix, label: string): string {
  const escaped = label.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${matrix.size} ${matrix.size}" width="1024" height="1024" role="img" aria-label="${escaped}">` +
    `<rect width="${matrix.size}" height="${matrix.size}" fill="white"/>` +
    `<path fill="black" shape-rendering="crispEdges" d="${matrix.path}"/></svg>\n`
  );
}

/**
 * A print-ready PNG (2048 px wide): the code on white, a brand-coloured frame, and the office name and short
 * link under it, so a printed sign still says where it leads when a phone is not at hand.
 */
export function drawQrPoster(
  canvas: HTMLCanvasElement,
  matrix: QrMatrix,
  caption: { title: string; subtitle: string; frameColor: string; textColor: string; rtl: boolean }
): void {
  const width = 2048;
  const qrPx = 1600;
  const cell = Math.floor(qrPx / matrix.size);
  const drawn = cell * matrix.size;
  const top = 160;
  const height = top + drawn + 420;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // Brand frame around the whole poster (never over the code or its quiet zone).
  ctx.strokeStyle = caption.frameColor;
  ctx.lineWidth = 40;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  const left = Math.round((width - drawn) / 2);
  ctx.fillStyle = 'black';
  for (let r = 0; r < matrix.modules; r++) {
    for (let c = 0; c < matrix.modules; c++) {
      if (matrix.isDark(r, c)) {
        ctx.fillRect(left + (c + QR_QUIET_ZONE) * cell, top + (r + QR_QUIET_ZONE) * cell, cell, cell);
      }
    }
  }

  ctx.fillStyle = caption.textColor;
  ctx.textAlign = 'center';
  ctx.direction = caption.rtl ? 'rtl' : 'ltr';
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.fillText(fitText(ctx, caption.title, width - 240), width / 2, top + drawn + 170);
  ctx.direction = 'ltr';
  ctx.font = '64px system-ui, sans-serif';
  ctx.fillText(fitText(ctx, caption.subtitle, width - 240), width / 2, top + drawn + 290);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > max) cut = cut.slice(0, -1);
  return cut + '…';
}
