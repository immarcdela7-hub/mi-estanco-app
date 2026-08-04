/**
 * Enlazar una factura con la venta a la que pertenece, por el nombre del PDF.
 *
 * GetYourGuide manda una factura por reserva, asi que al archivar un mes se
 * sueltan decenas de PDF de golpe. Elegir la venta a mano uno por uno seria
 * peor que no tener el archivo. Como sus ficheros llevan el localizador en el
 * nombre, se enlazan solos.
 *
 * Es comparacion de texto, nada mas: si el nombre no dice el localizador, la
 * factura se queda sin enlazar y se elige a mano. Nunca adivina.
 */

/**
 * Deja un localizador en su forma comparable.
 *
 * GetYourGuide lo escribe de varias maneras segun de donde salga: `GYG-A1B2C3`,
 * `gyg a1b2c3`, `A1B2C3`. Comparando en crudo, la mitad no encontraria su venta
 * y acabarian todas en el monton de "a mano", que es como no tener nada.
 */
export function normalizarRef(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^GYG/, "");
}

export type VentaEnlazable = { id: number; bookingRef: string };

/**
 * Busca en el nombre del fichero el localizador de alguna venta conocida.
 *
 * Se exige un minimo de 5 caracteres y que la coincidencia sea unica. Un
 * localizador corto podria aparecer por casualidad dentro de una fecha o de un
 * numero de pedido, y enlazar la factura a la venta equivocada es peor que
 * dejarla sin enlazar: lo segundo se ve, lo primero no.
 */
export function enlazarPorNombre(
  fileName: string,
  ventas: VentaEnlazable[]
): number | null {
  const nombre = normalizarRef(fileName);
  if (!nombre) return null;

  const candidatas = ventas.filter((v) => {
    const ref = normalizarRef(v.bookingRef);
    return ref.length >= 5 && nombre.includes(ref);
  });

  // Cero coincidencias: a mano. Varias: ambiguo, tambien a mano.
  if (candidatas.length !== 1) return null;
  return candidatas[0].id;
}
