import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { availability, localDay, parseSlots } from "@/lib/booking";
import { clientIp, corsHeaders, jsonResponse, rateLimit } from "@/lib/publicApi";

export const dynamic = "force-dynamic";

/**
 * Catálogo de actividades propias para la web.
 *
 * Devuelve lo justo para pintar la tarjeta y abrir el reservador: precio,
 * foto, punto de encuentro y la primera fecha con hueco. La disponibilidad
 * completa se pide aparte, solo de la actividad que el cliente abre.
 */
export async function GET(req: NextRequest) {
  const headers = (await corsHeaders(req, "abierto"))!;

  if (!rateLimit(`act:${clientIp(req)}`, 120, 60_000)) {
    return jsonResponse({ error: "Demasiadas peticiones." }, 429, headers);
  }

  const activities = await prisma.ownActivity.findMany({
    where: { active: true },
    orderBy: [{ city: "asc" }, { title: "asc" }],
  });

  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: {
      activityId: { in: activities.map((a) => a.id) },
      status: { not: "CANCELADA" },
      bookingDate: { gte: new Date(`${localDay(now)}T00:00:00.000Z`) },
    },
    select: { activityId: true, bookingDate: true, slot: true, people: true },
  });

  const items = activities.map((a) => {
    const dias = availability(
      a,
      bookings.filter((b) => b.activityId === a.id),
      now
    );
    return {
      slug: a.slug,
      titulo: a.title,
      resumen: a.summary,
      descripcion: a.description,
      provincia: a.province,
      city: a.city,
      categoria: a.category,
      imagen: a.imageUrl,
      precio: a.pricePerPerson.toNumber(),
      moneda: "EUR",
      duracion_min: a.durationMin,
      min_personas: a.minPeople,
      max_personas: a.capacity,
      punto_encuentro: a.meetingPoint,
      horas: parseSlots(a.slots),
      primera_fecha: dias[0]?.date ?? null,
      dias_disponibles: dias.length,
    };
  });

  return jsonResponse({ actividades: items }, 200, {
    ...headers,
    "Cache-Control": "public, max-age=60",
  });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: (await corsHeaders(req, "abierto"))! });
}
