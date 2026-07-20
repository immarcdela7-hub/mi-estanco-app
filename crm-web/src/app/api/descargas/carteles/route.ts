import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { buildTrackingUrl } from "@/lib/qr";
import { stampFlyers } from "@/lib/flyer";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const lote = req.nextUrl.searchParams.get("lote") ?? "";
  const free = await prisma.qrCode.findMany({
    where: { establishmentId: null, ...(lote ? { batch: lote } : {}) },
    orderBy: { code: "asc" },
    take: 500,
  });
  if (free.length === 0) {
    return new NextResponse("No hay códigos libres en ese lote", { status: 404 });
  }

  const baseUrl = await getSetting("base_url");
  const pairs: [string, string][] = free.map((c) => [c.code, buildTrackingUrl(baseUrl, c.code)]);
  const pdf = await stampFlyers(pairs);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="carteles_NTL_${free.length}.pdf"`,
    },
  });
}
