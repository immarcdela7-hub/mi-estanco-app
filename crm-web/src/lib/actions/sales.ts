"use server";

import { ok } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { euros, plural } from "@/lib/format";
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

function toNumberEs(value: string): number {
  let s = value.trim().replace("€", "").replace(/\s/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function toIsoDate(value: string): string | null {
  const s = value.trim().slice(0, 10);
  let m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const CSV_COLUMNS = [
  "fecha",
  "codigo_establecimiento",
  "referencia_reserva",
  "actividad",
  "entradas",
  "importe_total",
  "comision_gyg",
];

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

  const headers = Object.keys(rows[0]);
  const missing = CSV_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return { error: `Faltan columnas en el CSV: ${missing.join(", ")}` };
  }

  let imported = 0;
  const issues: string[] = [];
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const code = (row["codigo_establecimiento"] ?? "").trim();
    const est = await findEstablishmentByCode(code);
    if (!est) {
      issues.push(`Línea ${line}: código ${code} no existe.`);
      continue;
    }
    const iso = toIsoDate(row["fecha"] ?? "");
    if (!iso) {
      issues.push(`Línea ${line}: fecha «${row["fecha"]}» no reconocida (AAAA-MM-DD o DD/MM/AAAA).`);
      continue;
    }
    const bookingRef = (row["referencia_reserva"] ?? "").trim();
    if (bookingRef) {
      const dup = await prisma.sale.findFirst({
        where: { establishmentId: est.id, bookingRef },
        select: { id: true },
      });
      if (dup) {
        issues.push(`Línea ${line}: la reserva ${bookingRef} ya estaba registrada para ${est.name} — no se ha duplicado.`);
        continue;
      }
    }
    const gyg = toNumberEs(row["comision_gyg"] ?? "0");
    await prisma.sale.create({
      data: {
        establishmentId: est.id,
        saleDate: new Date(iso),
        activity: (row["actividad"] ?? "").trim(),
        bookingRef,
        tickets: Math.max(1, Math.round(toNumberEs(row["entradas"] ?? "1")) || 1),
        amountTotal: toNumberEs(row["importe_total"] ?? "0"),
        gygCommission: gyg,
        partnerShare: share(gyg, est.commissionPct),
        source: "csv",
      },
    });
    imported++;
  }

  revalidateAll();
  const summary = imported > 0 ? `${plural(imported, "venta importada", "ventas importadas")} como pendientes.` : "No se importó ninguna venta.";
  if (issues.length > 0) {
    if (imported > 0) return ok(`${summary} Incidencias: ${issues.join(" · ")}`);
    return { error: `${summary} ${issues.join(" · ")}` };
  }
  return ok(summary);
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
