import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bookingReference, localDay, money, validateRequest } from "@/lib/booking";
import { clientIp, corsHeaders, jsonResponse, rateLimit } from "@/lib/publicApi";

export const dynamic = "force-dynamic";

const Parada = z.object({
  slug: z.string().min(1).max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  personas: z.coerce.number().int().min(1).max(50),
});

const Cliente = z.object({
  nombre: z.string().trim().min(2).max(120),
  email: z.email().max(160),
  telefono: z.string().trim().max(40).default(""),
  notas: z.string().trim().max(500).default(""),
  ref: z.string().trim().max(40).default(""),
  idioma: z.enum(["es", "en"]).default("es"),
  // Campo trampa: los formularios reales lo dejan vacio, los robots lo rellenan.
  web: z.string().max(0).optional(),
});

/** Una actividad suelta, o un plan entero con varias paradas. */
const Reserva = z.union([
  Cliente.extend({ items: z.array(Parada).min(1).max(8) }),
  Cliente.merge(Parada),
]);

class NoDisponible extends Error {
  constructor(public detalle: string, public indice: number) {
    super(detalle);
  }
}

/**
 * Alta de reservas de actividades propias.
 *
 * Acepta una sola actividad o **un plan entero**. Con GetYourGuide eso no se
 * puede: cada enlace suyo vende una actividad y no hay cesta para afiliados.
 * Con las nuestras si, y ademas de verdad: las paradas de un plan se crean
 * todas o ninguna dentro de la misma transaccion. Nadie se queda con la cata
 * pagada y sin la visita porque la segunda se llenara por el camino.
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
  const paradas = "items" in datos ? datos.items : [datos];
  const enGrupo = paradas.length > 1;

  const slugs = [...new Set(paradas.map((p) => p.slug))];
  const actividades = await prisma.ownActivity.findMany({ where: { slug: { in: slugs } } });
  const porSlug = new Map(actividades.map((a) => [a.slug, a]));
  for (const p of paradas) {
    const a = porSlug.get(p.slug);
    if (!a || !a.active) {
      return jsonResponse({ error: "Alguna actividad del plan ya no está disponible." }, 404, headers);
    }
    if (p.personas > a.capacity) {
      return jsonResponse(
        { error: `"${a.title}" admite como máximo ${a.capacity} personas.` },
        409,
        headers
      );
    }
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

  const groupRef = enGrupo ? bookingReference() : "";

  // Serializable para que dos clientes no puedan quedarse con la última plaza
  // a la vez: la comprobación de cupo y el alta van en la misma transacción.
  for (let intento = 0; intento < 3; intento++) {
    try {
      const creadas = await prisma.$transaction(
        async (tx) => {
          const desde = new Date(`${localDay(new Date())}T00:00:00.000Z`);
          const ocupadas = await tx.booking.findMany({
            where: {
              activityId: { in: actividades.map((a) => a.id) },
              status: { not: "CANCELADA" },
              bookingDate: { gte: desde },
            },
            select: { activityId: true, bookingDate: true, slot: true, people: true },
          });

          const salida = [];
          for (let i = 0; i < paradas.length; i++) {
            const p = paradas[i];
            const act = porSlug.get(p.slug)!;

            // Cuentan también las paradas anteriores de este mismo plan: si el
            // cliente repite actividad y hora, la segunda no puede ignorar a la
            // primera.
            const problema = validateRequest(
              act,
              ocupadas.filter((o) => o.activityId === act.id),
              new Date(),
              p.fecha,
              p.hora,
              p.personas
            );
            if (problema) throw new NoDisponible(`${act.title}: ${problema}`, i);

            const total = money(act.pricePerPerson.toNumber(), p.personas, 0, 0).total;
            const creada = await tx.booking.create({
              data: {
                reference: bookingReference(),
                groupRef,
                groupOrder: i,
                activityId: act.id,
                establishmentId,
                refCode,
                bookingDate: new Date(`${p.fecha}T00:00:00.000Z`),
                slot: p.hora,
                people: p.personas,
                amountTotal: total,
                customerName: datos.nombre,
                customerEmail: datos.email,
                customerPhone: datos.telefono,
                notes: datos.notas,
                locale: datos.idioma,
              },
            });

            ocupadas.push({
              activityId: act.id,
              bookingDate: creada.bookingDate,
              slot: p.hora,
              people: p.personas,
            });
            salida.push({
              referencia: creada.reference,
              actividad: act.title,
              fecha: p.fecha,
              hora: p.hora,
              personas: p.personas,
              total,
              punto_encuentro: act.meetingPoint,
            });
          }
          return salida;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      const total = creadas.reduce((n, r) => n + r.total, 0);
      const primera = creadas[0];

      return jsonResponse(
        enGrupo
          ? { ok: true, referencia: groupRef, paradas: creadas.length, total, items: creadas }
          : { ok: true, ...primera, referencia: primera.referencia },
        201,
        headers
      );
    } catch (e) {
      if (e instanceof NoDisponible) {
        // Se dice CUAL parada falla: si no, el cliente no sabe que cambiar.
        return jsonResponse({ error: e.detalle, parada: e.indice }, 409, headers);
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

export async function OPTIONS(req: NextRequest) {
  const headers = await corsHeaders(req, "restringido");
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
