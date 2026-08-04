"use server";

import { revalidatePath } from "next/cache";
import { ok } from "@/lib/flash";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { euros, isoDate, plural } from "@/lib/format";
import { borrarFichero, guardarFichero } from "@/lib/facturas";
import { enlazarPorNombre } from "@/lib/enlace";
import type { FormState } from "./auth";

const REVALIDATE = ["/admin/facturas", "/admin", "/portal/facturas"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

const idOrNull = (v: FormDataEntryValue | null): number | null => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? null : n;
};

/**
 * Archiva facturas. **No se teclea nada de su contenido.**
 *
 * Todo lo que hay que saber de estas facturas ya esta en el CRM antes de que
 * llegue el PDF: el importe de una de GetYourGuide es la comision que ya
 * importamos de su propio export, y el de una nuestra es la liquidacion que
 * calculamos nosotros. Pedir esos numeros a mano seria teclear algo que el
 * sistema ya tiene, y ademas abriria la puerta a que lo tecleado y lo
 * calculado no coincidan.
 *
 * Asi que aqui solo entran dos cosas: el fichero y a que corresponde. Lo
 * demas se copia del enlace.
 */
export async function archivarFacturasAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const kind = String(formData.get("kind") ?? "");
  if (kind !== "INGRESO" && kind !== "GASTO") return { error: "Tipo de factura no válido." };

  const ficheros = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (ficheros.length === 0) return { error: "Adjunta al menos un archivo (PDF, JPG o PNG)." };
  if (ficheros.length > 100) return { error: "Como mucho 100 archivos de una vez." };

  // De aqui salen los datos de las facturas. Nada se escribe a mano.
  const payoutId = idOrNull(formData.get("payoutId"));
  const payout =
    kind === "GASTO" && payoutId !== null
      ? await prisma.payout.findUnique({
          where: { id: payoutId },
          include: { establishment: { select: { id: true, name: true } } },
        })
      : null;
  if (kind === "GASTO" && !payout) {
    return { error: "Elige la liquidación a la que corresponde la factura." };
  }

  // Para las de ingreso, las ventas con localizador: el nombre del PDF de
  // GetYourGuide lo lleva, asi que se enlazan solas.
  const ventas =
    kind === "INGRESO"
      ? await prisma.sale.findMany({
          where: { bookingRef: { not: "" } },
          select: {
            id: true,
            bookingRef: true,
            saleDate: true,
            activity: true,
            gygCommission: true,
            establishmentId: true,
          },
        })
      : [];

  let archivadas = 0;
  let sinEnlazar = 0;
  const repetidas: string[] = [];
  const fallidas: string[] = [];

  for (const file of ficheros) {
    let guardado;
    try {
      guardado = await guardarFichero(file);
    } catch (e) {
      fallidas.push(`${file.name}: ${e instanceof Error ? e.message : "no se pudo guardar"}`);
      continue;
    }

    // El mismo papel archivado dos veces confunde mas que ayuda al cuadrar.
    const yaEsta = await prisma.invoice.findFirst({
      where: { sha256: guardado.sha256 },
      select: { id: true },
    });
    if (yaEsta) {
      await borrarFichero(guardado.storedName);
      repetidas.push(guardado.fileName);
      continue;
    }

    const venta =
      kind === "INGRESO"
        ? ventas.find((v) => v.id === enlazarPorNombre(guardado.fileName, ventas)) ?? null
        : null;
    if (kind === "INGRESO" && !venta) sinEnlazar++;

    // Todos los datos salen del enlace. Si no hay enlace, quedan vacios y la
    // factura se enlaza a mano despues: guardada esta, que es lo que importa.
    const datos =
      kind === "INGRESO"
        ? {
            counterparty: venta ? "GetYourGuide" : "",
            issueDate: venta ? venta.saleDate : new Date(),
            total: venta ? venta.gygCommission : 0,
            concept: venta ? `${venta.activity} · ${venta.bookingRef}`.trim() : "",
            saleId: venta?.id ?? null,
            establishmentId: venta?.establishmentId ?? null,
            payoutId: null,
          }
        : {
            counterparty: payout!.establishment.name,
            issueDate: payout!.paymentDate,
            total: payout!.amount,
            concept: `Comisiones · ${plural(payout!.nSales, "venta", "ventas")}`,
            saleId: null,
            establishmentId: payout!.establishment.id,
            payoutId: payout!.id,
          };

    try {
      await prisma.invoice.create({ data: { kind, ...datos, ...guardado } });
      archivadas++;
    } catch {
      // Si la ficha no entra, el fichero no puede quedarse suelto en el disco.
      await borrarFichero(guardado.storedName);
      fallidas.push(guardado.fileName);
    }
  }

  revalidateAll();

  if (archivadas === 0) {
    return {
      error:
        repetidas.length > 0
          ? `Ya estaban archivadas (${repetidas.slice(0, 3).join(", ")}). No se ha duplicado nada.`
          : `No se ha podido archivar nada. ${fallidas.slice(0, 2).join("; ")}`,
    };
  }

  const partes = [`${plural(archivadas, "factura archivada", "facturas archivadas")}`];
  if (kind === "GASTO" && payout) partes.push(`por ${euros(payout.amount)}`);
  if (sinEnlazar > 0) partes.push(`${sinEnlazar} sin venta (enlázalas desde el listado)`);
  if (repetidas.length > 0) partes.push(`${repetidas.length} ya estaban`);
  if (fallidas.length > 0) partes.push(`${fallidas.length} fallaron`);

  return ok(partes.join(". ") + ".");
}

/**
 * Enlaza a mano una factura que no se pudo enlazar sola.
 *
 * Al enlazar se copian los datos de la venta, igual que al archivarla: el
 * importe nunca se escribe.
 */
export async function enlazarFacturaAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = idOrNull(formData.get("invoiceId"));
  const saleId = idOrNull(formData.get("saleId"));
  if (id === null || saleId === null) return { error: "Elige la factura y su venta." };

  const [factura, venta] = await Promise.all([
    prisma.invoice.findUnique({ where: { id }, select: { id: true } }),
    prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        saleDate: true,
        activity: true,
        bookingRef: true,
        gygCommission: true,
        establishmentId: true,
      },
    }),
  ]);
  if (!factura) return { error: "Esa factura ya no está." };
  if (!venta) return { error: "Esa venta no existe." };

  await prisma.invoice.update({
    where: { id },
    data: {
      saleId,
      establishmentId: venta.establishmentId,
      counterparty: "GetYourGuide",
      issueDate: venta.saleDate,
      total: venta.gygCommission,
      concept: `${venta.activity} · ${venta.bookingRef}`.trim(),
    },
  });

  revalidateAll();
  return ok(`Factura enlazada con la venta del ${isoDate(venta.saleDate)} (${euros(venta.gygCommission)}).`);
}

/**
 * Borra una factura y su archivo.
 *
 * Primero la ficha y despues el fichero: si se cae entre medias, queda un
 * fichero huerfano en disco —molesto pero inofensivo— y no una ficha que
 * apunta a un archivo que ya no esta, que es lo que rompe la descarga.
 */
export async function deleteInvoiceAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const id = idOrNull(formData.get("invoiceId"));
  if (id === null) return { error: "Factura no válida." };

  const factura = await prisma.invoice.findUnique({
    where: { id },
    select: { storedName: true, number: true, fileName: true },
  });
  if (!factura) return { error: "Esa factura ya no está." };

  await prisma.invoice.delete({ where: { id } });
  await borrarFichero(factura.storedName);

  revalidateAll();
  return ok(`Factura ${factura.number || factura.fileName} eliminada del archivo.`);
}
