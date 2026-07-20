import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { zipSync } from "fflate";
import { qrPng } from "./qr";

// Posición del QR en el cartel A6 v2 de NoTaxLost (mm, origen abajo-izquierda),
// medida sobre el PDF original. Si cambia la plantilla, volver a medir.
const QR_X_MM = 33.0;
const QR_Y_MM = 35.7;
const QR_SIZE_MM = 38.8;
const CODE_Y_MM = 22.5;

const mm = (v: number) => (v * 72) / 25.4;

async function templateBytes(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "public", "plantilla-cartel-A6.pdf"));
}

/** PDF multipágina: una copia del cartel por código, listo para imprenta. */
export async function stampFlyers(codesUrls: [string, string][]): Promise<Uint8Array> {
  const template = await PDFDocument.load(await templateBytes());
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  for (const [code, url] of codesUrls) {
    const [page] = await out.copyPages(template, [0]);
    out.addPage(page);

    const pad = mm(1.5);
    page.drawRectangle({
      x: mm(QR_X_MM) - pad,
      y: mm(QR_Y_MM) - pad,
      width: mm(QR_SIZE_MM) + 2 * pad,
      height: mm(QR_SIZE_MM) + 2 * pad,
      color: rgb(1, 1, 1),
    });

    const png = await out.embedPng(new Uint8Array(await qrPng(url, 640)));
    page.drawImage(png, {
      x: mm(QR_X_MM),
      y: mm(QR_Y_MM),
      width: mm(QR_SIZE_MM),
      height: mm(QR_SIZE_MM),
    });

    const size = 5.5;
    const width = font.widthOfTextAtSize(code, size);
    page.drawText(code, {
      x: page.getWidth() / 2 - width / 2,
      y: mm(CODE_Y_MM),
      size,
      font,
      color: rgb(0.58, 0.64, 0.72),
    });
  }

  return out.save();
}

/** ZIP con un PNG por código, para maquetación externa. */
export async function qrZip(codesUrls: [string, string][]): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const [code, url] of codesUrls) {
    entries[`${code}.png`] = new Uint8Array(await qrPng(url, 640));
  }
  return zipSync(entries, { level: 6 });
}
