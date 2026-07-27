import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bookingReference, localDay, money, validateRequest } from "@/lib/booking";
import { clientIp, corsHeaders, jsonResponse, rateLimit } from "@/lib/publicApi";

export const dynamic = "force-dynamic";

const Reserva = z.object({
  slug: z.string().min(1).max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  personas: z.coerce.number().int().min(1).max(50),
  nombre: z.string().trim().min(2).max(120),
  email: z.email().max(160),
  telefono: z.string().trim().max(40).default(""),
  notas: z.string().trim().max(500).default(""),
  ref: z.string().trim().max(40).default(""),
  idioma: z.enum(["es", "en"]).default("es"),
  // Campo trampa: los formularios reales lo dejan vacío, los robots lo rellenan.
  web: z.string().max(0).optional(),
});

/**
 * Alta de una reserva de actividad propia.
 *
 * Aquí termina el recorrido que antes se iba a GetYourGuide: el cliente elige
 * día, hora y personas en notaxlost.com y la reserva entra directa en el CRM,
 * ya atada al establecimiento del QR por el que llegó.
 */
export async function POST(req: NextRequest) {
  const headers = await corsHeaders(req, "restringido");
  if (!headers) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });

  const ip = clientIp(req);
  if (!rateLimit(`res:${ip}`, 8, 3_600_000) || !rateLimit(`res-dia:${ip}`, 20, 86_400_000)) {
    return jsonResponse(
      { error: "Has hecho demasiadas reservas seguidas. Inténtalo más tarde." },
      429,
      headers
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Petición mal formada." }, 400, headers);
  }

  const parsed = Reserva.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "Revisa los datos del formulario." }, 400, headers);
  }
  const datos = parsed.data;

  const activity = await prisma.ownActivity.findUnique({ where: { slug: datos.slug } });
  if (!activity || !activity.active) {
    return jsonResponse({ error: "Esta actividad ya no está disponible." }, 404, headers);
  }
  if (datos.personas > activity.capacity) {
    return jsonResponse(
      { error: `El grupo máximo es de ${activity.capacity} personas.` },
      409,
      headers
    );
  }

  // El establecimiento sale del código del QR, no de lo que diga el cliente:
  // sirve tanto el código del local como el de un QR ya asignado.
  const refCode = datos.ref.toUpperCase();
  let establishmentId: number | null = null;
  if (refCode) {
    const [est, qr] = await Promise.all([
      prisma.establishment.findUnique({ where: { code: refCode }, select: { id: true } }),
      prisma.qrCode.findUnique({ where: { code: refCode }, select: { establishmentId: true } }),
    ]);
    establishmentId = est?.id ?? qr?.establishmentId ?? null;
  }

  const total = money(activity.pricePerPerson.toNumber(), datos.personas, 0, 0).total;

  // Serializable para que dos clientes no puedan quedarse con la última plaza
  // a la vez: la comprobación de cupo y el alta van en la misma transacción.
  for (let intento = 0; intento < 3; intento++) {
    try {
      const reserva = await prisma.$transaction(
        async (tx) => {
          const ocupadas = await tx.booking.findMany({
            where: {
              activityId: activity.id,
              status: { not: "CANCELADA" },
              bookingDate: { gte: new Date(`${localDay(new Date())}T00:00:00.000Z`) },
            },
            select: { bookingDate: true, slot: true, people: true },
          });

          const problema = validateRequest(
            activity,
            ocupadas,
            new Date(),
            datos.fecha,
            datos.hora,
            datos.personas
          );
          if (problema) throw new NoDisponible(problema);

          return tx.booking.create({
            data: {
              reference: bookingReference(),
              activityId: activity.id,
              establishmentId,
              refCode,
              bookingDate: new Date(`${datos.fecha}T00:00:00.000Z`),
              slot: datos.hora,
              people: datos.personas,
              amountTotal: total,
              customerName: datos.nombre,
              customerEmail: datos.email,
              customerPhone: datos.telefono,
              notes: datos.notas,
              locale: datos.idioma,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      return jsonResponse(
        {
          ok: true,
          referencia: reserva.reference,
          actividad: activity.title,
          fecha: datos.fecha,
          hora: datos.hora,
          personas: datos.personas,
          total,
          punto_encuentro: activity.meetingPoint,
        },
        201,
        headers
      );
    } catch (e) {
      if (e instanceof NoDisponible) {
        return jsonResponse({ error: e.message }, 409, headers);
      }
      // Choque entre transacciones o localizador repetido: se reintenta.
      const code = (e as { code?: string })?.code;
      if (code === "P2034" || code === "P2002") continue;
      console.error("Reserva fallida", e);
      return jsonResponse({ error: "No hemos podido guardar la reserva." }, 500, headers);
    }
  }

  return jsonResponse(
    { error: "Hay mucha demanda en esa hora. Prueba otra vez en unos segundos." },
    503,
    headers
  );
}

class NoDisponible extends Error {}

export async function OPTIONS(req: NextRequest) {
  const headers = await corsHeaders(req, "restringido");
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
