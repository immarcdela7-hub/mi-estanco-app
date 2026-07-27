"use server";

import { ok } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/booking";
import { euros } from "@/lib/format";
import type { FormState } from "./auth";

const REVALIDATE = ["/admin", "/admin/reservas", "/admin/ventas", "/admin/liquidaciones"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

/**
 * Confirma una reserva de actividad propia.
 *
 * Al confirmarla se crea la venta correspondiente para que entre en las
 * liquidaciones igual que las de GetYourGuide: si el cliente llegó por el QR
 * de un local, ese local cobra su parte de nuestro margen.
 */
export async function confirmBookingAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const id = parseInt(String(formData.get("id")), 10);
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { activity: true, establishment: true },
  });
  if (!booking) return { error: "La reserva no existe." };
  if (booking.status === "CONFIRMADA") return { error: "Esta reserva ya estaba confirmada." };
  if (booking.status === "CANCELADA") return { error: "No se puede confirmar una reserva cancelada." };

  const { ntlMargin, partnerShare } = money(
    booking.activity.pricePerPerson.toNumber(),
    booking.people,
    booking.activity.ntlMarginPct.toNumber(),
    booking.establishment?.commissionPct.toNumber() ?? 0
  );

  await prisma.$transaction(async (tx) => {
    let saleId: number | null = null;
    if (booking.establishmentId) {
      const sale = await tx.sale.create({
        data: {
          establishmentId: booking.establishmentId,
          saleDate: booking.bookingDate,
          activity: booking.activity.title,
          bookingRef: booking.reference,
          tickets: booking.people,
          amountTotal: booking.amountTotal,
          gygCommission: ntlMargin,
          partnerShare,
          source: "propia",
        },
      });
      saleId = sale.id;
    }
    await tx.booking.update({
      where: { id },
      data: { status: "CONFIRMADA", saleId },
    });
  });

  revalidateAll();
  return ok(
    booking.establishment
      ? `Reserva ${booking.reference} confirmada. Venta registrada: ${euros(partnerShare)} para ${booking.establishment.name}.`
      : `Reserva ${booking.reference} confirmada. Llegó sin QR, así que no hay comisión que repartir.`
  );
}

/** Cancela una reserva y libera sus plazas. */
export async function cancelBookingAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const id = parseInt(String(formData.get("id")), 10);
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { sale: true },
  });
  if (!booking) return { error: "La reserva no existe." };
  if (booking.status === "CANCELADA") return { error: "Esta reserva ya estaba cancelada." };

  // La venta solo se puede retirar si aún no se ha liquidado; si ya se pagó al
  // establecimiento, se deja y se avisa para arreglarlo a mano.
  const liquidada = booking.sale?.payoutId != null;

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: { status: "CANCELADA", saleId: liquidada ? booking.saleId : null },
    });
    if (booking.saleId && !liquidada) {
      await tx.sale.delete({ where: { id: booking.saleId } });
    }
  });

  revalidateAll();
  return ok(
    liquidada
      ? `Reserva ${booking.reference} cancelada. Su venta ya estaba liquidada, así que sigue en el histórico.`
      : `Reserva ${booking.reference} cancelada y plazas liberadas.`
  );
}
