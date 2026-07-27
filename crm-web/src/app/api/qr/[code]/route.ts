import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { buildTrackingUrl, qrPng } from "@/lib/qr";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const { code } = await params;

  // Se busca siempre (no solo para comprobar permisos): la ciudad del
  // establecimiento se graba en el QR como `zona=`, para que la web pueda
  // recomendar lo que hay cerca del local.
  const [qr, estByCode] = await Promise.all([
    prisma.qrCode.findUnique({ where: { code }, include: { establishment: true } }),
    prisma.establishment.findUnique({ where: { code } }),
  ]);

  if (session.role !== "ADMIN") {
    const owner = qr?.establishmentId ?? estByCode?.id;
    if (owner !== session.estId) {
      return new NextResponse("No autorizado", { status: 403 });
    }
  }

  const city = (qr?.establishment ?? estByCode)?.city;
  const baseUrl = await getSetting("base_url");
  const png = await qrPng(buildTrackingUrl(baseUrl, code, city));
  const download = req.nextUrl.searchParams.get("download");

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      ...(download
        ? { "Content-Disposition": `attachment; filename="QR_${code}.png"` }
        : {}),
      "Cache-Control": "private, max-age=300",
    },
  });
}
