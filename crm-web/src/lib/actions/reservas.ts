"use server";

import { ok } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/booking";
import { euros, plural } from "@/lib/format";
import type { FormState } from "./auth";

const REVALIDATE = ["/admin", "/admin/reservas", "/admin/ventas", "/admin/liquidaciones"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

/**
 * Las reservas de un plan van juntas: si el cliente reservó tres paradas de una
 * vez, confirmar solo una lo dejaría a medias sin que nadie se entere. El grupo
 * es la unidad, igual que lo fue al crearlo.
 */
async function delGrupo(id: number) {
  const b = await prisma.booking.findUnique({
    where: { id },
    include: { activity: true, establishment: true, sale: true },
  });
  if (!b) return null;
  if (!b.groupRef) return [b];
  return prisma.booking.findMany({
    where: { groupRef: b.groupRef },
    orderBy: { groupOrder: "asc" },
    include: { activity: true, establishment: true, sale: true },
  });
}

/**
 * Confirma una reserva —o el plan entero— de actividades propias.
 *
 * Al confirmar se crea la venta correspondiente para que entre en las
 * liquidaciones igual que las de GetYourGuide: si el cliente llegó por el QR
 * de un local, ese local cobra su parte de nuestro margen.
 */
export async function confirmBookingAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const id = parseInt(String(formData.get("id")), 10);
  const grupo = await delGrupo(id);
  if (!grupo) return { error: "La reserva no existe." };

  const pendientes = grupo.filter((b) => b.status === "SOLICITADA");
  if (!pendientes.length) {
    return { error: grupo.some((b) => b.status === "CONFIRMADA")
      ? "Esto ya estaba confirmado."
      : "No se puede confirmar una reserva cancelada." };
  }

  let parteLocal = 0;
  await prisma.$transaction(async (tx) => {
    for (const b of pendientes) {
      const { ntlMargin, partnerShare } = money(
        b.activity.pricePerPerson.toNumber(),
        b.people,
        b.activity.ntlMarginPct.toNumber(),
        b.establishment?.commissionPct.toNumber() ?? 0
      );
      parteLocal += partnerShare;

      let saleId: number | null = null;
      if (b.establishmentId) {
        const sale = await tx.sale.create({
          data: {
            establishmentId: b.establishmentId,
            saleDate: b.bookingDate,
            activity: b.activity.title,
            bookingRef: b.reference,
            tickets: b.people,
            amountTotal: b.amountTotal,
            gygCommission: ntlMargin,
            partnerShare,
            source: "propia",
          },
        });
        saleId = sale.id;
      }
      await tx.booking.update({ where: { id: b.id }, data: { status: "CONFIRMADA", saleId } });
    }
  });

  revalidateAll();
  const local = grupo[0].establishment;
  const que = pendientes.length > 1
    ? `Plan de ${plural(pendientes.length, "parada", "paradas")} confirmado`
    : `Reserva ${pendientes[0].reference} confirmada`;
  return ok(
    local
      ? `${que}. ${euros(parteLocal)} para ${local.name}.`
      : `${que}. Llegó sin QR, así que no hay comisión que repartir.`
  );
}

/** Cancela una reserva —o el plan entero— y libera sus plazas. */
export async function cancelBookingAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const id = parseInt(String(formData.get("id")), 10);
  const grupo = await delGrupo(id);
  if (!grupo) return { error: "La reserva no existe." };

  const vivas = grupo.filter((b) => b.status !== "CANCELADA");
  if (!vivas.length) return { error: "Esto ya estaba cancelado." };

  // La venta solo se puede retirar si aún no se ha liquidado; si ya se pagó al
  // establecimiento, se deja y se avisa para arreglarlo a mano.
  const liquidadas = vivas.filter((b) => b.sale?.payoutId != null);

  await prisma.$transaction(async (tx) => {
    for (const b of vivas) {
      const yaPagada = b.sale?.payoutId != null;
      await tx.booking.update({
        where: { id: b.id },
        data: { status: "CANCELADA", saleId: yaPagada ? b.saleId : null },
      });
      if (b.saleId && !yaPagada) await tx.sale.delete({ where: { id: b.saleId } });
    }
  });

  revalidateAll();
  const que = vivas.length > 1
    ? `Plan de ${plural(vivas.length, "parada", "paradas")} cancelado`
    : `Reserva ${vivas[0].reference} cancelada`;
  return ok(
    liquidadas.length
      ? `${que}. ${plural(liquidadas.length, "venta ya liquidada", "ventas ya liquidadas")} se ${liquidadas.length > 1 ? "quedan" : "queda"} en el histórico.`
      : `${que} y plazas liberadas.`
  );
}
