import Link from "next/link";
import { CommissionChart } from "@/components/CommissionChart";
import {
  IconClock,
  IconEuro,
  IconReceipt,
  IconUsers,
} from "@/components/icons";
import {
  EmptyState,
  PageHeader,
  Panel,
  SaleStatusBadge,
  StatCard,
  Table,
  Td,
} from "@/components/ui";
import { euros, fmtDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  monthlyCommissions,
  pendingByEstablishment,
  recentSales,
  salesSummary,
  topEstablishments,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Configura tu marca",
    text: (
      <>
        En <b>Ajustes</b>, revisa el nombre de la marca y la URL de la web a la que apuntarán
        los códigos QR.
      </>
    ),
  },
  {
    title: "Da de alta un establecimiento",
    text: (
      <>
        En <b>Establecimientos</b>, crea el primer local: obtendrá un código único y su QR
        listo para imprimir.
      </>
    ),
  },
  {
    title: "Registra las ventas",
    text: (
      <>
        En <b>Ventas</b>, apunta o importa las ventas que lleguen por cada QR y valídalas
        cuando GYG las abone.
      </>
    ),
  },
];

export default async function AdminDashboard() {
  const [summary, monthly, top, recent, pending, nEst, reservasSinConfirmar] = await Promise.all([
    salesSummary(),
    monthlyCommissions(),
    topEstablishments(),
    recentSales(),
    pendingByEstablishment(),
    prisma.establishment.count(),
    prisma.booking.count({ where: { status: "SOLICITADA" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Panel general"
        subtitle="Resumen de ventas por QR y comisiones de GetYourGuide."
      />

      {nEst === 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-extrabold text-brand-blue-dark">
                {i + 1}
              </div>
              <div className="text-sm font-bold text-ink">{s.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Una reserva propia es un cliente esperando respuesta, no un apunte
          contable: se avisa arriba del todo y se entra de un clic. */}
      {reservasSinConfirmar > 0 && (
        <Link
          href="/admin/reservas?estado=SOLICITADA"
          className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:border-amber-300"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <IconClock />
          </span>
          <span className="text-sm text-amber-900">
            <b>
              {reservasSinConfirmar === 1
                ? "Hay 1 reserva propia esperando confirmación"
                : `Hay ${reservasSinConfirmar} reservas propias esperando confirmación`}
            </b>
            . El cliente ya ha reservado en la web; confírmala para registrar la venta.
          </span>
        </Link>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas confirmadas" value={String(summary.nVentas)} icon={<IconReceipt />} />
        <StatCard label="Comisión GYG recibida" value={euros(summary.comisionGyg)} icon={<IconEuro />} />
        <StatCard label="Comisión establecimientos" value={euros(summary.comisionPartner)} icon={<IconUsers />} />
        <StatCard label="Pendiente de liquidar" value={euros(summary.pendientePago)} icon={<IconClock />} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel title="Comisión mensual">
          {monthly.length === 0 ? (
            <EmptyState>
              Aún no hay ventas validadas. Regístralas en la sección{" "}
              <Link className="font-semibold text-brand-blue-dark" href="/admin/ventas">
                Ventas
              </Link>
              .
            </EmptyState>
          ) : (
            <>
              <CommissionChart
                data={monthly}
                series={[
                  { key: "nuestraParte", label: "Nuestra parte", color: "#2563eb" },
                  { key: "establecimientos", label: "Establecimientos", color: "#059669" },
                ]}
              />
              <p className="mt-2 text-xs text-muted">
                Reparto mensual de la comisión de GYG: en azul lo que retenemos, en verde lo
                que corresponde a los establecimientos.
              </p>
            </>
          )}
        </Panel>

        <Panel title="Mejores establecimientos">
          {top.length === 0 ? (
            <EmptyState>Todavía no hay establecimientos dados de alta.</EmptyState>
          ) : (
            <Table headers={["Establecimiento", "Código", "Ventas", "Comisión GYG"]} rightAlign={[2, 3]}>
              {top.map((t) => (
                <tr key={t.id}>
                  <Td>{t.name}</Td>
                  <Td className="font-mono text-[13px]">{t.code}</Td>
                  <Td right>{t.ventas}</Td>
                  <Td right>{euros(t.comision)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel title="Últimas ventas">
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Sin ventas registradas todavía.</p>
          ) : (
            <Table headers={["Fecha", "Establecimiento", "Actividad", "Comisión", "Estado"]} rightAlign={[3]}>
              {recent.map((s) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap">{fmtDate(s.saleDate)}</Td>
                  <Td>{s.establishment.name}</Td>
                  <Td className="max-w-[220px] truncate">{s.activity || "—"}</Td>
                  <Td right>{euros(s.gygCommission)}</Td>
                  <Td>
                    <SaleStatusBadge status={s.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Pendiente de liquidar por establecimiento">
          {pending.length === 0 ? (
            <p className="text-sm text-muted">No hay comisiones validadas pendientes de pago.</p>
          ) : (
            <Table headers={["Establecimiento", "Ventas", "Pendiente"]} rightAlign={[1, 2]}>
              {pending.map((p) => (
                <tr key={p.establishmentId}>
                  <Td>{p.name}</Td>
                  <Td right>{p.ventas}</Td>
                  <Td right className="font-semibold">
                    {euros(p.pendiente)}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
