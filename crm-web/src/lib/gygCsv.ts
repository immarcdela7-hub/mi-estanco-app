/**
 * Lectura del export de ventas, en los dos formatos que llegan.
 *
 * El nuestro (`plantilla_ventas.csv`) y **el de GetYourGuide tal cual sale de
 * su panel** (Dashboard → Bookings → Export). Se admite el suyo porque
 * renombrar siete columnas a mano cada mes es justo el trabajo que acaba
 * haciéndose mal un día que hay prisa, y una comisión mal tecleada se paga a
 * un establecimiento y ya no vuelve.
 *
 * Sin dependencias ni base de datos a propósito: así se prueba sola.
 */

/** Una venta ya normalizada, venga del formato que venga. */
export type FilaVenta = {
  /** Línea del CSV, para poder decir dónde está el problema. */
  linea: number;
  /** Fecha de la compra en ISO. La de la visita no nos sirve: cobramos al vender. */
  fecha: string;
  /** Código del establecimiento. Vacío = la venta no trae campaña. */
  codigo: string;
  referencia: string;
  actividad: string;
  entradas: number;
  /** Lo que pagó el cliente. GetYourGuide NO lo exporta: queda en 0. */
  importeTotal: number;
  /** Lo que ingresamos nosotros. En el suyo es "Potential income". */
  comision: number;
  /** Estado tal y como lo escribe GetYourGuide. Vacío en el nuestro. */
  estado: string;
};

export type Formato = "ntl" | "gyg";

/** Columnas del formato propio. Todas obligatorias. */
export const COLUMNAS_NTL = [
  "fecha",
  "codigo_establecimiento",
  "referencia_reserva",
  "actividad",
  "entradas",
  "importe_total",
  "comision_gyg",
];

/**
 * Las que hacen falta del export de GetYourGuide. Su fichero trae más
 * (City, Travel date, Traveler origin, View activity) que no usamos, y una
 * primera columna sin nombre con el número de fila.
 */
const COLUMNAS_GYG = ["status", "activity", "booking date", "campaign", "booking reference"];

export function detectarFormato(headers: string[]): Formato | null {
  const h = headers.map((x) => x.trim().toLowerCase());
  if (COLUMNAS_NTL.every((c) => h.includes(c))) return "ntl";
  if (COLUMNAS_GYG.every((c) => h.includes(c))) return "gyg";
  return null;
}

/** "1.234,50 €" y "1,234.50" acaban los dos en 1234.5. */
export function aNumero(value: string): number {
  let s = String(value ?? "").trim().replace(/[€$£]/g, "").replace(/\s/g, "");
  if (!s || s === "-" || s === "'-") return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

export function aFechaIso(value: string): string | null {
  const s = String(value ?? "").trim().slice(0, 10);
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * Una venta cancelada no es una venta.
 *
 * No se listan los estados válidos porque GetYourGuide puede añadir uno nuevo
 * cualquier día y un estado desconocido no debe hacer desaparecer dinero sin
 * avisar: se descarta solo lo que dice claramente que se ha anulado, y del
 * resto se informa por estado para que se vea qué ha entrado.
 */
export function estaAnulada(estado: string): boolean {
  return /cancel|anulad|refund|reembols/i.test(estado || "");
}

/**
 * La última fila de su export son los totales: sin referencia y sin actividad,
 * pero con participantes e ingresos rellenos. Importarla crearía una venta
 * fantasma que además cuadra con la suma, así que costaría verla.
 */
function esFilaDeTotales(fila: Record<string, string>): boolean {
  const ref = (fila["booking reference"] ?? "").trim();
  const act = (fila["activity"] ?? "").trim();
  const est = (fila["status"] ?? "").trim();
  return !ref && !act && !est;
}

export type Normalizado = {
  filas: FilaVenta[];
  /** Problemas por los que una fila no se puede importar. */
  descartes: string[];
  /** Cuántas anuladas se han dejado fuera. */
  anuladas: number;
};

export function normalizar(
  rows: Record<string, string>[],
  formato: Formato
): Normalizado {
  const filas: FilaVenta[] = [];
  const descartes: string[] = [];
  let anuladas = 0;

  rows.forEach((row, i) => {
    const linea = i + 2; // +1 por la cabecera, +1 porque las líneas empiezan en 1
    const g = (k: string) => String(row[k] ?? "").trim();

    if (formato === "gyg") {
      if (esFilaDeTotales(row)) return; // los totales no son una venta
      const estado = g("status");
      if (estaAnulada(estado)) { anuladas++; return; }

      const fecha = aFechaIso(g("booking date"));
      if (!fecha) {
        descartes.push(`Línea ${linea}: fecha «${g("booking date")}» no reconocida.`);
        return;
      }
      filas.push({
        linea,
        fecha,
        codigo: g("campaign"),
        referencia: g("booking reference"),
        actividad: g("activity"),
        entradas: Math.max(1, Math.round(aNumero(g("participants"))) || 1),
        // Su export no trae lo que pagó el cliente, solo lo que cobramos
        // nosotros. Se deja en 0 en vez de inventarlo: el reparto se calcula
        // sobre la comisión, así que no falsea ninguna liquidación.
        importeTotal: 0,
        comision: aNumero(g("potential income")),
        estado,
      });
      return;
    }

    const fecha = aFechaIso(g("fecha"));
    if (!fecha) {
      descartes.push(`Línea ${linea}: fecha «${g("fecha")}» no reconocida (AAAA-MM-DD o DD/MM/AAAA).`);
      return;
    }
    filas.push({
      linea,
      fecha,
      codigo: g("codigo_establecimiento"),
      referencia: g("referencia_reserva"),
      actividad: g("actividad"),
      entradas: Math.max(1, Math.round(aNumero(g("entradas"))) || 1),
      importeTotal: aNumero(g("importe_total")),
      comision: aNumero(g("comision_gyg")),
      estado: "",
    });
  });

  return { filas, descartes, anuladas };
}
