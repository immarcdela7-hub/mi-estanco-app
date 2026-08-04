"use server";

import { revalidatePath } from "next/cache";
import { ok } from "@/lib/flash";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { euros } from "@/lib/format";
import { borrarFichero, guardarFichero } from "@/lib/facturas";
import type { FormState } from "./auth";

const REVALIDATE = ["/admin/facturas", "/admin", "/portal/facturas"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

const dec = (v: FormDataEntryValue | null): number => {
  const n = parseFloat(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

const idOrNull = (v: FormDataEntryValue | null): number | null => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? null : n;
};

/**
 * Archiva una factura con su PDF.
 *
 * El importe se pide aparte del fichero a propósito: de un PDF no se puede
 * sacar la base y el IVA con fiabilidad, y una cifra mal leída por un lector
 * automático es peor que no tener cifra, porque nadie la revisa.
 */
export async function uploadInvoiceAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const kind = String(formData.get("kind") ?? "");
  if (kind !== "INGRESO" && kind !== "GASTO") return { error: "Tipo de factura no válido." };

  const issueDate = String(formData.get("issueDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return { error: "La fecha no es válida." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Adjunta el archivo de la factura (PDF, JPG o PNG)." };
  }

  const establishmentId = idOrNull(formData.get("establishmentId"));
  if (establishmentId !== null) {
    const existe = await prisma.establishment.findUnique({
      where: { id: establishmentId },
      select: { id: true },
    });
    if (!existe) return { error: "El establecimiento no existe." };
  }
  const saleId = idOrNull(formData.get("saleId"));
  if (saleId !== null) {
    const existe = await prisma.sale.findUnique({ where: { id: saleId }, select: { id: true } });
    if (!existe) return { error: "La venta no existe." };
  }

  const base = dec(formData.get("base"));
  const vatPct = dec(formData.get("vatPct"));
  const totalManual = dec(formData.get("total"));
  if (base < 0 || vatPct < 0 || totalManual < 0) {
    return { error: "Los importes no pueden ser negativos." };
  }
  const vatAmount = Math.round(base * vatPct) / 100;
  // Si se teclea un total distinto del calculado, manda el tecleado: hay
  // facturas con redondeos, retenciones o recargos que no salen de base+IVA.
  const total = totalManual > 0 ? totalManual : Math.round((base + vatAmount) * 100) / 100;

  let guardado;
  try {
    guardado = await guardarFichero(file);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el archivo." };
  }

  // El mismo papel archivado dos veces confunde más que ayuda al cuadrar.
  const repetida = await prisma.invoice.findFirst({
    where: { sha256: guardado.sha256 },
    select: { id: true, number: true, fileName: true },
  });
  if (repetida) {
    await borrarFichero(guardado.storedName);
    return {
      error:
        `Ese archivo ya está archivado (${repetida.number || repetida.fileName}). ` +
        `No se ha duplicado.`,
    };
  }

  try {
    await prisma.invoice.create({
      data: {
        kind,
        number: String(formData.get("number") ?? "").trim().slice(0, 60),
        issueDate: new Date(issueDate),
        counterparty: String(formData.get("counterparty") ?? "").trim().slice(0, 120),
        concept: String(formData.get("concept") ?? "").trim().slice(0, 200),
        base,
        vatPct,
        vatAmount,
        total,
        selfBilled: formData.get("selfBilled") === "on",
        notes: String(formData.get("notes") ?? "").trim().slice(0, 500),
        establishmentId,
        saleId,
        payoutId: idOrNull(formData.get("payoutId")),
        ...guardado,
      },
    });
  } catch (e) {
    // Si la ficha no entra, el fichero no puede quedarse suelto en el disco.
    await borrarFichero(guardado.storedName);
    return { error: e instanceof Error ? e.message : "No se pudo archivar la factura." };
  }

  revalidateAll();
  return ok(
    `Factura archivada${total > 0 ? ` por ${euros(total)}` : ""}. ` +
      `Ya se puede descargar desde el listado.`
  );
}

/**
 * Borra una factura y su archivo.
 *
 * Primero la ficha y después el fichero: si se cae entre medias, queda un
 * fichero huérfano en disco —molesto pero inofensivo— y no una ficha que
 * apunta a un archivo que ya no está, que es lo que rompe la descarga.
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
