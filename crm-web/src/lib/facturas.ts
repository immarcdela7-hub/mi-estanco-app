import "server-only";
import { createHash, randomBytes } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

/**
 * Guardado de los PDF de las facturas.
 *
 * Los ficheros van a disco y no a la base de datos: unos cientos de PDF dentro
 * de Postgres hinchan el `pg_dump` diario hasta que un día deja de caber y las
 * copias se rompen en silencio. Y estos papeles hay que conservarlos años.
 *
 * Todo lo que llega de un formulario es hostil hasta que se demuestre lo
 * contrario, así que aquí no se usa NADA de lo que manda el navegador para
 * construir una ruta: el nombre en disco lo generamos nosotros.
 */

/** Carpeta de las facturas. En el VPS es un volumen montado, no la imagen. */
export function facturasDir(): string {
  return process.env.FACTURAS_DIR || "/data/facturas";
}

export const MAX_BYTES = 12 * 1024 * 1024; // 12 MB: un PDF escaneado cabe de sobra

/** Lo que aceptamos. Un HTML o un SVG servido de vuelta sería un XSS. */
const TIPOS: Record<string, { ext: string; magic: number[][] }> = {
  "application/pdf": { ext: "pdf", magic: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  "image/jpeg": { ext: "jpg", magic: [[0xff, 0xd8, 0xff]] },
  "image/png": { ext: "png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
};

export const TIPOS_ACEPTADOS = Object.keys(TIPOS);
export const EXTENSIONES_ACEPTADAS = ".pdf,.jpg,.jpeg,.png";

export type Guardado = {
  storedName: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  sha256: string;
};

/**
 * Deja el nombre original en algo que se pueda enseñar y mandar en una
 * cabecera. Solo es para la vista: la ruta en disco nunca sale de aquí.
 */
export function nombreLimpio(raw: string): string {
  const base = path.basename(String(raw || "factura"));
  const sano = base
    // Saltos de línea y caracteres de control: partirían la cabecera
    // Content-Disposition al descargar. Las comillas, otro tanto.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["\\]/g, "_")
    .trim();
  return (sano || "factura").slice(0, 120);
}

/**
 * Qué es el fichero **de verdad**, por sus primeros bytes.
 *
 * El `type` que manda el navegador no sirve: lo pone el cliente y se falsea
 * escribiendo. Un HTML subido como `application/pdf` y devuelto luego tal cual
 * sería un XSS con nuestra sesión de administrador delante.
 */
export function tipoReal(buf: Uint8Array): string | null {
  for (const [mime, def] of Object.entries(TIPOS)) {
    for (const firma of def.magic) {
      if (firma.every((b, i) => buf[i] === b)) return mime;
    }
  }
  return null;
}

export async function guardarFichero(file: File): Promise<Guardado> {
  if (file.size === 0) throw new Error("El archivo está vacío.");
  if (file.size > MAX_BYTES) {
    throw new Error(`El archivo pasa de ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = tipoReal(bytes);
  if (!mime) {
    throw new Error("Solo se aceptan PDF, JPG o PNG. El archivo no parece ninguno de los tres.");
  }

  const dir = facturasDir();
  await mkdir(dir, { recursive: true });

  // El nombre en disco es nuestro y no tiene nada del original: así ni un
  // nombre con "../" ni uno repetido pueden pisar otro fichero.
  const storedName = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${TIPOS[mime].ext}`;
  await writeFile(path.join(dir, storedName), bytes, { mode: 0o640 });

  return {
    storedName,
    fileName: nombreLimpio(file.name),
    fileMime: mime,
    fileSize: file.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/**
 * Lee una factura del disco.
 *
 * `storedName` sale siempre de la base de datos, pero se valida igualmente:
 * si algún día una ruta llega por otro camino, esto es lo que impide que
 * `../../` salga de la carpeta.
 */
export async function leerFichero(storedName: string): Promise<Buffer> {
  if (!/^[a-z0-9]+-[a-f0-9]{16}\.(pdf|jpg|png)$/.test(storedName)) {
    throw new Error("Nombre de archivo no válido.");
  }
  return readFile(path.join(facturasDir(), storedName));
}

export async function borrarFichero(storedName: string): Promise<void> {
  if (!/^[a-z0-9]+-[a-f0-9]{16}\.(pdf|jpg|png)$/.test(storedName)) return;
  await unlink(path.join(facturasDir(), storedName)).catch(() => {});
}
