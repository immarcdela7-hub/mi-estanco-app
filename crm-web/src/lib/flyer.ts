import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, PDFEmbeddedPage, PDFImage, StandardFonts, rgb } from "pdf-lib";
import { zipSync } from "fflate";
import { qrPng } from "./qr";

/**
 * Carteles imprimibles con el QR de un establecimiento.
 *
 * Cada formato es una plantilla de diseño con un hueco reservado para el QR.
 * Las posiciones están medidas sobre el PDF original, en milímetros y con el
 * origen abajo a la izquierda, que es como trabaja pdf-lib. Si se rehace un
 * diseño hay que volver a medirlas: no se deducen solas.
 */
export type Formato = {
  id: string;
  nombre: string;
  medidas: string;
  /** Para qué sirve; se enseña al elegir en el CRM. */
  uso: string;
  plantilla: string;
  /** Hueco del QR, en mm desde abajo a la izquierda. */
  qr: { x: number; y: number; size: number };
  /** Dónde va impreso el código, y a qué cuerpo. */
  codigo: { y: number; size: number };
  /** Cantidades que se ofrecen de un clic. */
  copias: number[];
};

export const FORMATOS: Record<string, Formato> = {
  a6: {
    id: "a6",
    nombre: "Cartel A6",
    medidas: "105 × 148 mm",
    uso: "Para la pared, la barra o un expositor de sobremesa.",
    plantilla: "plantilla-cartel-A6.pdf",
    qr: { x: 33.0, y: 35.7, size: 38.8 },
    codigo: { y: 22.5, size: 5.5 },
    copias: [1, 5, 10],
  },
  mesa: {
    id: "mesa",
    nombre: "Tarjeta de mesa",
    medidas: "45 × 90 mm",
    uso: "Una en cada mesa del local, en portamenús o de pie.",
    plantilla: "plantilla-mesa-45x90.pdf",
    // El QR va centrado: la página mide 45,13 mm y el hueco 29,97.
    qr: { x: 7.58, y: 18.54, size: 29.97 },
    // El único blanco libre está entre el borde de la tarjeta y "SCAN & BOOK".
    codigo: { y: 14.4, size: 4 },
    copias: [1, 10, 20],
  },
};

export const FORMATO_POR_DEFECTO = "a6";

export function getFormato(id: string | null | undefined): Formato {
  return FORMATOS[String(id ?? "")] ?? FORMATOS[FORMATO_POR_DEFECTO];
}

const mm = (v: number) => (v * 72) / 25.4;

async function templateBytes(fichero: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "public", fichero));
}

/**
 * PDF multipágina: una copia del cartel por cada par (código, URL).
 *
 * La plantilla se incrusta UNA vez y se dibuja en cada página, y cada QR
 * distinto también se incrusta una sola vez. Sin eso, veinte tarjetas de mesa
 * del mismo local pesaban veinte veces la plantilla —más de 10 MB— y el local
 * no podía ni abrir el correo.
 */
export async function stampFlyers(
  codesUrls: [string, string][],
  formatoId: string = FORMATO_POR_DEFECTO
): Promise<Uint8Array> {
  const formato = getFormato(formatoId);
  const template = await PDFDocument.load(await templateBytes(formato.plantilla));
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  const [plantillaPag] = template.getPages();
  const ancho = plantillaPag.getWidth();
  const alto = plantillaPag.getHeight();
  const fondo: PDFEmbeddedPage = await out.embedPage(plantillaPag);

  const qrCache = new Map<string, PDFImage>();

  for (const [code, url] of codesUrls) {
    const page = out.addPage([ancho, alto]);
    page.drawPage(fondo, { x: 0, y: 0, width: ancho, height: alto });

    // Blanco bajo el QR: el hueco de la plantilla trae un QR de ejemplo.
    const pad = mm(1.5);
    page.drawRectangle({
      x: mm(formato.qr.x) - pad,
      y: mm(formato.qr.y) - pad,
      width: mm(formato.qr.size) + 2 * pad,
      height: mm(formato.qr.size) + 2 * pad,
      color: rgb(1, 1, 1),
    });

    let png = qrCache.get(url);
    if (!png) {
      png = await out.embedPng(new Uint8Array(await qrPng(url, 640)));
      qrCache.set(url, png);
    }
    page.drawImage(png, {
      x: mm(formato.qr.x),
      y: mm(formato.qr.y),
      width: mm(formato.qr.size),
      height: mm(formato.qr.size),
    });

    const width = font.widthOfTextAtSize(code, formato.codigo.size);
    page.drawText(code, {
      x: ancho / 2 - width / 2,
      y: mm(formato.codigo.y),
      size: formato.codigo.size,
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
