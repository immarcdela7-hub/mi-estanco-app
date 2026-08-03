"use server";

import { ok } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { euros, plural } from "@/lib/format";
import { detectarFormato, normalizar } from "@/lib/gygCsv";
import type { FormState } from "./auth";

function share(gyg: number, pctVal: Prisma.Decimal): number {
  return Math.round(gyg * pctVal.toNumber()) / 100;
}

const REVALIDATE = ["/admin", "/admin/ventas", "/admin/liquidaciones"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

export async function addSaleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const establishmentId = parseInt(String(formData.get("establishmentId")), 10);
  const est = await prisma.establishment.findUnique({ where: { id: establishmentId } });
  if (!est) return { error: "Establecimiento no válido." };

  const saleDate = String(formData.get("saleDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return { error: "La fecha no es válida." };

  const tickets = parseInt(String(formData.get("tickets") ?? "1"), 10) || 1;
  const amountTotal = parseFloat(String(formData.get("amountTotal") ?? "0")) || 0;
  const gyg = parseFloat(String(formData.get("gygCommission") ?? "0")) || 0;
  if (gyg < 0 || amountTotal < 0) return { error: "Los importes no pueden ser negativos." };

  const partnerShare = share(gyg, est.commissionPct);
  await prisma.sale.create({
    data: {
      establishmentId,
      saleDate: new Date(saleDate),
      activity: String(formData.get("activity") ?? "").trim(),
      bookingRef: String(formData.get("bookingRef") ?? "").trim(),
      tickets,
      amountTotal,
      gygCommission: gyg,
      partnerShare,
      source: "manual",
    },
  });

  revalidateAll();
  return ok(
    `Venta registrada como pendiente. Al establecimiento le corresponden ${euros(partnerShare)}. Valídala para poder liquidarla.`
  );
}

/**
 * Importa ventas desde el CSV propio **o desde el export de GetYourGuide tal
 * cual** (Dashboard → Bookings → Export). El formato se detecta por las
 * cabeceras: nadie tiene que decir cuál está subiendo.
 *
 * Las ventas sin campaña no se pueden repartir —no traen de qué QR vienen— y
 * qué hacer con ellas lo decide quien importa: descartarlas o cargarlas a un
 * establecimiento concreto. Por omisión se descartan, que es lo que no se
 * puede deshacer sin borrar a mano.
 */
export async function importCsvAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un archivo CSV." };
  }
  const text = (await file.text()).replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const rows = parsed.data;
  if (rows.length === 0) return { error: "El CSV no contenía filas." };
  if (rows.length > 5000) {
    return { error: "El CSV supera el máximo de 5000 filas. Divídelo en varios archivos." };
  }

  const formato = detectarFormato(Object.keys(rows[0]));
  if (!formato) {
    return {
      error:
        "No reconozco las columnas. Sube la plantilla de ventas o el export de " +
        "GetYourGuide (Dashboard → Bookings → Export), sin retocar sus cabeceras.",
    };
  }

  // A dónde van las ventas sin campaña: "" las descarta.
  const destinoSinCampana = parseInt(String(formData.get("sinCampana") ?? ""), 10);
  const refugio = Number.isNaN(destinoSinCampana)
    ? null
    : await prisma.establishment.findUnique({ where: { id: destinoSinCampana } });

  const { filas, descartes, anuladas } = normalizar(rows, formato);
  const issues = [...descartes];
  let imported = 0;
  let sinCampana = 0;

  for (const fila of filas) {
    let est = fila.codigo ? await findEstablishmentByCode(fila.codigo) : null;
    if (!est && !fila.codigo) {
      // Sin campaña: la venta es nuestra, pero no sabemos de qué QR viene.
      if (!refugio) { sinCampana++; continue; }
      est = refugio;
    }
    if (!est) {
      issues.push(`Línea ${fila.linea}: código ${fila.codigo} no existe.`);
      continue;
    }
    if (fila.referencia) {
      // El localizador identifica una reserva en todo GetYourGuide, así que se
      // busca en todo el CRM y no solo en ese establecimiento: importar dos
      // veces el mismo export con distinta campaña pagaría la venta dos veces.
      const dup = await prisma.sale.findFirst({
        where: { bookingRef: fila.referencia },
        select: { id: true, establishment: { select: { name: true } } },
      });
      if (dup) {
        issues.push(
          `Línea ${fila.linea}: la reserva ${fila.referencia} ya estaba registrada ` +
            `(${dup.establishment.name}) — no se ha duplicado.`
        );
        continue;
      }
    }
    await prisma.sale.create({
      data: {
        establishmentId: est.id,
        saleDate: new Date(fila.fecha),
        activity: fila.actividad,
        bookingRef: fila.referencia,
        tickets: fila.entradas,
        amountTotal: fila.importeTotal,
        gygCommission: fila.comision,
        partnerShare: share(fila.comision, est.commissionPct),
        source: formato === "gyg" ? "gyg" : "csv",
      },
    });
    imported++;
  }

  revalidateAll();

  const notas: string[] = [];
  if (anuladas > 0) {
    notas.push(`${plural(anuladas, "reserva anulada", "reservas anuladas")} sin importar.`);
  }
  if (sinCampana > 0) {
    notas.push(
      `${plural(sinCampana, "venta sin campaña", "ventas sin campaña")} sin importar: no ` +
        `traen de qué QR vienen. Si son tuyas, vuelve a importar eligiendo dónde cargarlas.`
    );
  }
  if (formato === "gyg" && imported > 0) {
    notas.push("Su export no trae el importe que pagó el cliente, así que queda en 0€; el reparto se calcula sobre la comisión y no se ve afectado.");
  }

  const summary =
    imported > 0
      ? `${plural(imported, "venta importada", "ventas importadas")} como pendientes.`
      : "No se importó ninguna venta.";
  const cola = [...notas, ...(issues.length ? [`Incidencias: ${issues.join(" · ")}`] : [])].join(" ");
  if (imported === 0 && (issues.length > 0 || sinCampana > 0)) {
    return { error: `${summary} ${cola}`.trim() };
  }
  return ok(`${summary} ${cola}`.trim());
}

async function findEstablishmentByCode(code: string) {
  if (!code) return null;
  const viaPool = await prisma.qrCode.findFirst({
    where: { code: { equals: code, mode: "insensitive" } },
    include: { establishment: true },
  });
  if (viaPool?.establishment) return viaPool.establishment;
  return prisma.establishment.findFirst({
    where: { code: { equals: code, mode: "insensitive" } },
  });
}

function checkedIds(formData: FormData, field: string): number[] {
  return formData
    .getAll(field)
    .map((v) => parseInt(String(v), 10))
    .filter((n) => !Number.isNaN(n));
}

export async function validateSalesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const ids = checkedIds(formData, "saleId");
  if (ids.length === 0) return { error: "Marca al menos una venta." };
  const res = await prisma.sale.updateMany({
    where: { id: { in: ids }, status: "PENDIENTE", payoutId: null },
    data: { status: "VALIDADA" },
  });
  revalidateAll();
  return ok(`${plural(res.count, "venta validada", "ventas validadas")}.`);
}

export async function deleteSalesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const ids = checkedIds(formData, "saleId");
  if (ids.length === 0) return { error: "Marca al menos una venta." };
  const res = await prisma.sale.deleteMany({
    where: { id: { in: ids }, payoutId: null },
  });
  revalidateAll();
  return ok(`${plural(res.count, "venta eliminada", "ventas eliminadas")}.`);
}

export async function createPayoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const establishmentId = parseInt(String(formData.get("establishmentId")), 10);
  const paymentDate = String(formData.get("paymentDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return { error: "La fecha de pago no es válida." };

  try {
    const payout = await prisma.$transaction(
      async (tx) => {
        const sales = await tx.sale.findMany({
          where: { establishmentId, status: "VALIDADA", payoutId: null },
          select: { id: true, partnerShare: true },
        });
        if (sales.length === 0) return null;
        const amount = sales.reduce((acc, s) => acc + s.partnerShare.toNumber(), 0);
        const created = await tx.payout.create({
          data: {
            establishmentId,
            amount: Math.round(amount * 100) / 100,
            nSales: sales.length,
            paymentDate: new Date(paymentDate),
            method: String(formData.get("method") ?? "transferencia"),
            reference: String(formData.get("reference") ?? "").trim(),
            notes: String(formData.get("notes") ?? "").trim(),
          },
        });
        const claimed = await tx.sale.updateMany({
          where: { id: { in: sales.map((s) => s.id) }, status: "VALIDADA", payoutId: null },
          data: { status: "PAGADA", payoutId: created.id },
        });
        if (claimed.count !== sales.length) {
          throw new Error("Las ventas cambiaron mientras se generaba la liquidación.");
        }
        return created;
      },
      { isolationLevel: "Serializable" }
    );

    if (!payout) return { error: "Ese establecimiento no tiene ventas validadas sin liquidar." };
    revalidateAll();
    return ok(
      `Liquidación #${payout.id} creada: ${euros(payout.amount)} (${plural(payout.nSales, "venta marcada", "ventas marcadas")} como pagadas).`
    );
  } catch {
    return { error: "La liquidación no se pudo completar; vuelve a intentarlo." };
  }
}
