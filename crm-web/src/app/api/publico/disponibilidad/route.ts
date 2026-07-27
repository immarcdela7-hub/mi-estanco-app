import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { availability, localDay } from "@/lib/booking";
import { clientIp, corsHeaders, jsonResponse, rateLimit } from "@/lib/publicApi";

export const dynamic = "force-dynamic";

/**
 * Días y horas con plazas libres de una actividad propia.
 *
 * Esto es lo que hace que la reserva pueda terminar en notaxlost.com: el
 * calendario que ve el cliente sale de aquí, no de un iframe de nadie.
 */
export async function GET(req: NextRequest) {
  const headers = (await corsHeaders(req, "abierto"))!;

  if (!rateLimit(`disp:${clientIp(req)}`, 120, 60_000)) {
    return jsonResponse({ error: "Demasiadas peticiones." }, 429, headers);
  }

  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();
  if (!slug) return jsonResponse({ error: "Falta la actividad." }, 400, headers);

  const activity = await prisma.ownActivity.findUnique({ where: { slug } });
  if (!activity || !activity.active) {
    return jsonResponse({ error: "Actividad no encontrada." }, 404, headers);
  }

  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: {
      activityId: activity.id,
      status: { not: "CANCELADA" },
      bookingDate: { gte: new Date(`${localDay(now)}T00:00:00.000Z`) },
    },
    select: { bookingDate: true, slot: true, people: true },
  });

  const dias = parseInt(req.nextUrl.searchParams.get("dias") ?? "", 10);

  return jsonResponse(
    {
      slug: activity.slug,
      titulo: activity.title,
      precio: activity.pricePerPerson.toNumber(),
      min_personas: activity.minPeople,
      max_personas: activity.capacity,
      duracion_min: activity.durationMin,
      punto_encuentro: activity.meetingPoint,
      dias: availability(activity, bookings, now, Number.isFinite(dias) ? dias : undefined),
    },
    200,
    { ...headers, "Cache-Control": "no-store" }
  );
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: (await corsHeaders(req, "abierto"))! });
}
