import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { buildTrackingUrl } from "@/lib/qr";
import { getFormato, stampFlyers } from "@/lib/flyer";

export const maxDuration = 60;

/**
 * Cartel A6 listo para imprimir de UN establecimiento.
 *
 * Lo que se cuelga en el bar no es un QR suelto: es el cartel entero, con su
 * diseño y el código impreso debajo. Y el QR lleva grabada la ciudad del local
 * (`zona=`), así que este PDF solo vale para este establecimiento — por eso se
 * genera aquí y no en el lote de carteles en blanco.
 *
 * `?copias=N` saca varias páginas iguales, para colocarlo en varias mesas.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const { code } = await params;

  // Vale tanto el código del local como el de un cartel adicional suyo.
  const [qr, estByCode] = await Promise.all([
    prisma.qrCode.findUnique({ where: { code }, include: { establishment: true } }),
    prisma.establishment.findUnique({ where: { code } }),
  ]);

  const est = qr?.establishment ?? estByCode;
  if (!est) return new NextResponse("Código no encontrado", { status: 404 });

  if (session.role !== "ADMIN" && est.id !== session.estId) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const formato = getFormato(req.nextUrl.searchParams.get("formato"));
  const copias = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("copias") ?? "1", 10) || 1));
  const baseUrl = await getSetting("base_url");
  const url = buildTrackingUrl(baseUrl, code, est.city);

  const pdf = await stampFlyers(
    Array.from({ length: copias }, () => [code, url] as [string, string]),
    formato.id
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${formato.id}_${code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
