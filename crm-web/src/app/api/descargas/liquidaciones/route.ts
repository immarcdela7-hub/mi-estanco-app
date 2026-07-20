import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isoDate } from "@/lib/format";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const payouts = await prisma.payout.findMany({
    orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    include: { establishment: { select: { name: true, code: true } } },
  });

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    "id,fecha_pago,establecimiento,codigo,importe,ventas,metodo,referencia,notas",
    ...payouts.map((p) =>
      [
        p.id,
        isoDate(p.paymentDate),
        esc(p.establishment.name),
        p.establishment.code,
        p.amount.toNumber().toFixed(2),
        p.nSales,
        esc(p.method),
        esc(p.reference),
        esc(p.notes),
      ].join(",")
    ),
  ];

  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="liquidaciones.csv"',
    },
  });
}
