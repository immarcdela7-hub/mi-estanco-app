import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { leerFichero, nombreLimpio } from "@/lib/facturas";

/**
 * Descarga de una factura archivada.
 *
 * El administrador ve todas. Un establecimiento **solo las suyas y solo las de
 * gasto**: las de gasto son las que documentan lo que le pagamos a él. Las de
 * ingreso son lo que nos paga GetYourGuide y no le incumben, ni siquiera las
 * de las ventas que salieron de su QR.
 *
 * Se comprueba contra la base de datos, no contra lo que venga en la URL: aquí
 * el id lo pone quien pide, y probar del 1 al 100 es gratis.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 403 });

  const { id: crudo } = await params;
  const id = parseInt(crudo, 10);
  if (Number.isNaN(id)) return new NextResponse("No encontrada", { status: 404 });

  const factura = await prisma.invoice.findUnique({ where: { id } });
  if (!factura) return new NextResponse("No encontrada", { status: 404 });

  if (session.role !== "ADMIN") {
    const suya =
      factura.kind === "GASTO" &&
      factura.establishmentId != null &&
      factura.establishmentId === session.estId;
    // 404 y no 403: un 403 confirmaría que esa factura existe.
    if (!suya) return new NextResponse("No encontrada", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await leerFichero(factura.storedName);
  } catch {
    return new NextResponse("El archivo no está disponible", { status: 410 });
  }

  const nombre = nombreLimpio(factura.fileName);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      // El tipo sale de nuestra comprobación de bytes al subirla, nunca de lo
      // que dijo el navegador entonces.
      "Content-Type": factura.fileMime,
      "Content-Disposition": `attachment; filename="${nombre}"`,
      // Sin esto, un navegador podría decidir por su cuenta que el contenido
      // es otra cosa y ejecutarlo.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
