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
/** Una cara de la plantilla: su hueco de QR y dónde va impreso el código. */
export type Cara = {
  /** Hueco del QR, en mm desde abajo a la izquierda. */
  qr: { x: number; y: number; size: number };
  /** Dónde va impreso el código, y a qué cuerpo. `null` si no cabe. */
  codigo: { y: number; size: number } | null;
};

export type Formato = {
  id: string;
  nombre: string;
  medidas: string;
  /** Para qué sirve; se enseña al elegir en el CRM. */
  uso: string;
  plantilla: string;
  /** Una entrada por página de la plantilla, en su orden. */
  caras: Cara[];
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
    caras: [{ qr: { x: 33.0, y: 35.7, size: 38.8 }, codigo: { y: 22.5, size: 5.5 } }],
    copias: [1, 5, 10],
  },
  mesa: {
    id: "mesa",
    nombre: "Tarjeta de mesa",
    medidas: "45 × 90 mm",
    uso: "Una en cada mesa del local, en portamenús o de pie.",
    plantilla: "plantilla-mesa-45x90.pdf",
    caras: [{
      // El QR va centrado: la página mide 45,13 mm y el hueco 29,97.
      qr: { x: 7.58, y: 18.54, size: 29.97 },
      // El único blanco libre está entre el borde de la tarjeta y "SCAN & BOOK".
      codigo: { y: 14.4, size: 4 },
    }],
    copias: [1, 10, 20],
  },
  mesa2: {
    id: "mesa2",
    nombre: "Tarjeta de mesa a dos caras",
    medidas: "148 × 105 mm, dos caras",
    uso: "Para caballete de mesa: por delante el reclamo, por detrás lo que se puede reservar.",
    plantilla: "plantilla-mesa-A6-2caras.pdf",
    caras: [
      // Cara A: el QR va a la derecha, dentro de su tarjeta blanca. Debajo hay
      // 2,7 mm libres antes de "SCAN & BOOK": ahí cabe el código.
      { qr: { x: 107.7, y: 42.93, size: 28.36 }, codigo: { y: 38.2, size: 4 } },
      // Cara B: el QR queda abajo a la izquierda y su tarjeta no deja blanco
      // suficiente para el código. No pasa nada: ya va impreso en la otra cara.
      { qr: { x: 10.84, y: 17.02, size: 26.42 }, codigo: null },
    ],
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
 * PDF listo para imprenta: una copia del cartel por cada par (código, URL).
 *
 * Una copia son TODAS las caras de la plantilla, en su orden: la tarjeta de
 * dos caras sale como dos páginas seguidas, que es como la espera la imprenta
 * para imprimir a doble cara.
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

  const paginas = template.getPages();
  if (paginas.length < formato.caras.length) {
    throw new Error(
      `La plantilla ${formato.plantilla} tiene ${paginas.length} página(s) y el formato ` +
        `${formato.id} declara ${formato.caras.length} cara(s).`
    );
  }

  const fondos: PDFEmbeddedPage[] = await Promise.all(
    formato.caras.map((_, i) => out.embedPage(paginas[i]))
  );
  const medidas = formato.caras.map((_, i) => ({
    ancho: paginas[i].getWidth(),
    alto: paginas[i].getHeight(),
  }));

  const qrCache = new Map<string, PDFImage>();

  for (const [code, url] of codesUrls) {
    let png = qrCache.get(url);
    if (!png) {
      png = await out.embedPng(new Uint8Array(await qrPng(url, 640)));
      qrCache.set(url, png);
    }

    for (let i = 0; i < formato.caras.length; i++) {
      const cara = formato.caras[i];
      const { ancho, alto } = medidas[i];
      const page = out.addPage([ancho, alto]);
      page.drawPage(fondos[i], { x: 0, y: 0, width: ancho, height: alto });

      // Blanco bajo el QR: el hueco de la plantilla trae un QR de ejemplo.
      const pad = mm(1.5);
      page.drawRectangle({
        x: mm(cara.qr.x) - pad,
        y: mm(cara.qr.y) - pad,
        width: mm(cara.qr.size) + 2 * pad,
        height: mm(cara.qr.size) + 2 * pad,
        color: rgb(1, 1, 1),
      });

      page.drawImage(png, {
        x: mm(cara.qr.x),
        y: mm(cara.qr.y),
        width: mm(cara.qr.size),
        height: mm(cara.qr.size),
      });

      if (cara.codigo) {
        // Centrado sobre el QR, no sobre la página: en la tarjeta de dos caras
        // el QR está a la derecha y centrarlo en la hoja lo dejaría suelto en
        // mitad del titular.
        const width = font.widthOfTextAtSize(code, cara.codigo.size);
        page.drawText(code, {
          x: mm(cara.qr.x + cara.qr.size / 2) - width / 2,
          y: mm(cara.codigo.y),
          size: cara.codigo.size,
          font,
          color: rgb(0.58, 0.64, 0.72),
        });
      }
    }
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
