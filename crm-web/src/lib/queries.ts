import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

const num = (d: Prisma.Decimal | number | null | undefined) =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

export async function salesSummary(establishmentId?: number) {
  const confirmed = { in: ["VALIDADA", "PAGADA"] as const };
  const where = {
    status: { in: [...confirmed.in] },
    ...(establishmentId ? { establishmentId } : {}),
  };
  const agg = await prisma.sale.aggregate({
    where,
    _count: { id: true },
    _sum: { tickets: true, amountTotal: true, gygCommission: true, partnerShare: true },
  });
  const pendingAgg = await prisma.sale.aggregate({
    where: {
      status: "VALIDADA",
      payoutId: null,
      ...(establishmentId ? { establishmentId } : {}),
    },
    _sum: { partnerShare: true },
  });
  const paidAgg = await prisma.payout.aggregate({
    where: establishmentId ? { establishmentId } : {},
    _sum: { amount: true },
  });
  return {
    nVentas: agg._count.id,
    entradas: agg._sum.tickets ?? 0,
    importe: num(agg._sum.amountTotal),
    comisionGyg: num(agg._sum.gygCommission),
    comisionPartner: num(agg._sum.partnerShare),
    pendientePago: num(pendingAgg._sum.partnerShare),
    pagado: num(paidAgg._sum.amount),
  };
}

export type MonthlyRow = { mes: string; nuestraParte: number; establecimientos: number };

export async function monthlyCommissions(establishmentId?: number): Promise<MonthlyRow[]> {
  const rows = await prisma.$queryRaw<
    { mes: string; nuestra: number; parte: number }[]
  >`
    SELECT to_char("saleDate", 'YYYY-MM') AS mes,
           COALESCE(SUM("gygCommission" - "partnerShare"), 0)::float AS nuestra,
           COALESCE(SUM("partnerShare"), 0)::float AS parte
    FROM "Sale"
    WHERE status IN ('VALIDADA', 'PAGADA')
      AND (${establishmentId ?? null}::int IS NULL OR "establishmentId" = ${establishmentId ?? null}::int)
    GROUP BY 1 ORDER BY 1
  `;
  return rows.map((r) => ({
    mes: r.mes,
    nuestraParte: Math.round(r.nuestra * 100) / 100,
    establecimientos: Math.round(r.parte * 100) / 100,
  }));
}

export async function topEstablishments(limit = 6) {
  const rows = await prisma.$queryRaw<
    { id: number; name: string; code: string; ventas: bigint; comision: number }[]
  >`
    SELECT e.id, e.name, e.code,
           COUNT(s.id) AS ventas,
           COALESCE(SUM(s."gygCommission"), 0)::float AS comision
    FROM "Establishment" e
    LEFT JOIN "Sale" s ON s."establishmentId" = e.id AND s.status IN ('VALIDADA', 'PAGADA')
    GROUP BY e.id ORDER BY comision DESC, e.name LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    ventas: Number(r.ventas),
    comision: r.comision,
  }));
}

export async function recentSales(limit = 8) {
  return prisma.sale.findMany({
    orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    take: limit,
    include: { establishment: { select: { name: true } } },
  });
}

/**
 * Lo que se debe a cada establecimiento y aún no se ha liquidado.
 *
 * Las ventas directas quedan fuera **explícitamente**: no tienen a quién
 * pagarse. Sin ese filtro saldría una fila sin nombre reclamando un pago que
 * no existe, y es el tipo de fila que alguien acaba pagando.
 */
export async function pendingByEstablishment() {
  const rows = await prisma.sale.groupBy({
    by: ["establishmentId"],
    where: { status: "VALIDADA", payoutId: null, establishmentId: { not: null } },
    _count: { id: true },
    _sum: { partnerShare: true },
  });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.establishmentId).filter((id): id is number => id !== null);
  const ests = await prisma.establishment.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, code: true },
  });
  const byId = new Map(ests.map((e) => [e.id, e]));
  return rows
    .filter((r) => r.establishmentId !== null)
    .map((r) => ({
      establishmentId: r.establishmentId as number,
      name: byId.get(r.establishmentId as number)?.name ?? "?",
      code: byId.get(r.establishmentId as number)?.code ?? "?",
      ventas: r._count.id,
      pendiente: num(r._sum.partnerShare),
    }))
    .sort((a, b) => b.pendiente - a.pendiente);
}

/** Resumen de lo que entra sin QR: es ingreso nuestro y no se reparte. */
export async function directSalesSummary() {
  const agg = await prisma.sale.aggregate({
    where: { establishmentId: null, status: { in: ["VALIDADA", "PAGADA"] } },
    _count: { id: true },
    _sum: { gygCommission: true },
  });
  return { nVentas: agg._count.id, nuestro: num(agg._sum.gygCommission) };
}
