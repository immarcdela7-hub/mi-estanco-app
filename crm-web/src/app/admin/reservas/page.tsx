import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import {
  BookingStatusBadge,
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  Table,
  Td,
  btnDanger,
  btnGreen,
} from "@/components/ui";
import { IconClock, IconEuro, IconUsers } from "@/components/icons";
import { cancelBookingAction, confirmBookingAction } from "@/lib/actions/reservas";
import { euros, fmtDate, plural } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const FILTROS = [
  { value: "", label: "Todas" },
  { value: "SOLICITADA", label: "Solicitadas" },
  { value: "CONFIRMADA", label: "Confirmadas" },
  { value: "CANCELADA", label: "Canceladas" },
];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const estado = sp.estado as "SOLICITADA" | "CONFIRMADA" | "CANCELADA" | undefined;
  const where: Prisma.BookingWhereInput = estado ? { status: estado } : {};

  const [bookings, pendientes] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: [{ groupRef: "asc" }, { groupOrder: "asc" }, { bookingDate: "asc" }, { slot: "asc" }],
      take: 300,
      include: {
        activity: { select: { title: true, meetingPoint: true } },
        establishment: { select: { name: true, code: true } },
      },
    }),
    prisma.booking.count({ where: { status: "SOLICITADA" } }),
  ]);

  // Cuantas paradas tiene cada plan, para poder decir "parada 2 de 3".
  const grupos = new Map<string, number>();
  for (const b of bookings) {
    if (b.groupRef) grupos.set(b.groupRef, (grupos.get(b.groupRef) ?? 0) + 1);
  }

  const vivas = bookings.filter((b) => b.status !== "CANCELADA");
  const personas = vivas.reduce((a, b) => a + b.people, 0);
  const facturado = vivas.reduce((a, b) => a + b.amountTotal.toNumber(), 0);

  return (
    <>
      <PageHeader
        title="Reservas propias"
        subtitle="Las que llegan del reservador de la web. Al confirmarlas se registra la venta y la comisión del local."
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Sin confirmar" value={String(pendientes)} icon={<IconClock />} />
        <StatCard label="Personas" value={String(personas)} icon={<IconUsers />} />
        <StatCard label="Importe" value={euros(facturado)} icon={<IconEuro />} />
      </div>

      <Panel title={`Reservas (${bookings.length})`}>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Link
              key={f.value || "todas"}
              href={f.value ? `/admin/reservas?estado=${f.value}` : "/admin/reservas"}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                (estado ?? "") === f.value
                  ? "border-brand-blue bg-blue-50 text-brand-blue-dark"
                  : "border-slate-300 text-slate-700 hover:border-brand-blue"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {bookings.length === 0 ? (
          <EmptyState>
            Aquí aparecerán las reservas que hagan los clientes desde la web. Si aún no hay
            ninguna, comprueba que tienes alguna actividad propia a la venta.
          </EmptyState>
        ) : (
          <Table
            headers={["Fecha", "Actividad", "Cliente", "Personas", "Importe", "QR", "Estado", ""]}
            rightAlign={[3, 4]}
          >
            {bookings.map((b) => (
              <tr key={b.id} className={b.status === "CANCELADA" ? "opacity-50" : ""}>
                <Td>
                  <div className="font-semibold">{fmtDate(b.bookingDate)}</div>
                  <div className="text-xs text-muted">{b.slot}</div>
                </Td>
                <Td>
                  <div className="font-semibold">{b.activity.title}</div>
                  <div className="font-mono text-xs text-muted">{b.reference}</div>
                  {b.groupRef && (
                    <div className="mt-0.5 text-xs font-semibold text-brand-blue-dark">
                      Parada {b.groupOrder + 1} de {grupos.get(b.groupRef) ?? 1} ·{" "}
                      <span className="font-mono">{b.groupRef}</span>
                    </div>
                  )}
                </Td>
                <Td>
                  <div>{b.customerName}</div>
                  <div className="text-xs text-muted">
                    {b.customerEmail}
                    {b.customerPhone ? ` · ${b.customerPhone}` : ""}
                  </div>
                  {b.notes && <div className="mt-1 text-xs text-slate-600">{b.notes}</div>}
                </Td>
                <Td right>{b.people}</Td>
                <Td right>{euros(b.amountTotal)}</Td>
                <Td>
                  {b.establishment ? (
                    <>
                      <div>{b.establishment.name}</div>
                      <div className="font-mono text-xs text-muted">{b.establishment.code}</div>
                    </>
                  ) : (
                    <span className="text-muted">directa</span>
                  )}
                </Td>
                <Td>
                  <BookingStatusBadge status={b.status} />
                </Td>
                <Td>
                  {b.status === "SOLICITADA" && (
                    <div className="flex flex-wrap gap-2">
                      <ActionForm
                        action={confirmBookingAction}
                        submitLabel={b.groupRef ? "Confirmar plan" : "Confirmar"}
                        submitClassName={btnGreen}
                        compact
                        className="contents"
                      >
                        <input type="hidden" name="id" value={b.id} />
                      </ActionForm>
                      <ActionForm
                        action={cancelBookingAction}
                        submitLabel={b.groupRef ? "Cancelar plan" : "Cancelar"}
                        submitClassName={btnDanger}
                        compact
                        className="contents"
                      >
                        <input type="hidden" name="id" value={b.id} />
                      </ActionForm>
                    </div>
                  )}
                  {b.status === "CONFIRMADA" && (
                    <ActionForm
                      action={cancelBookingAction}
                      submitLabel={b.groupRef ? "Cancelar plan" : "Cancelar"}
                      submitClassName={btnDanger}
                      compact
                      className="contents"
                    >
                      <input type="hidden" name="id" value={b.id} />
                    </ActionForm>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-muted">
          Al confirmar se avisa al cliente por correo desde tu gestor habitual: la reserva trae su
          dirección y el punto de encuentro de la actividad. Cancelar libera las plazas y retira la
          venta, salvo que ya se hubiera liquidado. Las reservas de un mismo plan van juntas: se
          confirman y se cancelan todas a la vez, como se pidieron.
          {pendientes > 0 && ` Tienes ${plural(pendientes, "reserva", "reservas")} esperando.`}
        </p>
      </Panel>
    </>
  );
}
