import { CommissionChart } from "@/components/CommissionChart";
import { IconClock, IconEuro, IconReceipt, IconTicket } from "@/components/icons";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/ui";
import { requirePartner } from "@/lib/auth";
import { euros, pct } from "@/lib/format";
import { monthlyCommissions, salesSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PortalDashboard() {
  const { establishment } = await requirePartner();
  const [summary, monthly] = await Promise.all([
    salesSummary(establishment.id),
    monthlyCommissions(establishment.id),
  ]);

  return (
    <>
      <PageHeader
        title={`Hola, ${establishment.name}`}
        subtitle="Resumen de las ventas generadas con tu código QR."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas confirmadas" value={String(summary.nVentas)} icon={<IconReceipt />} />
        <StatCard label="Entradas vendidas" value={String(summary.entradas)} icon={<IconTicket />} />
        <StatCard label="Comisión acumulada" value={euros(summary.comisionPartner)} icon={<IconEuro />} />
        <StatCard label="Pendiente de cobro" value={euros(summary.pendientePago)} icon={<IconClock />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Tu comisión mes a mes">
          {monthly.length === 0 ? (
            <EmptyState>
              Aún no hay ventas confirmadas con tu QR. En cuanto registremos y confirmemos las
              primeras compras hechas con tu código, las verás aquí.
            </EmptyState>
          ) : (
            <CommissionChart
              data={monthly}
              series={[{ key: "establecimientos", label: "Tu comisión", color: "#059669" }]}
            />
          )}
        </Panel>

        <Panel title="Cómo funciona">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
            <li>
              Coloca tu <b>código QR</b> en un lugar visible de tu local.
            </li>
            <li>Tus clientes lo escanean y compran entradas en nuestra web.</li>
            <li>
              Cada compra queda <b>atribuida a tu código</b> (
              <code className="text-xs">{establishment.code}</code>).
            </li>
            <li>
              Te devolvemos el <b>{pct(establishment.commissionPct)}</b> de la comisión que nos
              paga GetYourGuide.
            </li>
            <li>
              Cobras por liquidaciones periódicas — las ves en <b>Mis liquidaciones</b>.
            </li>
          </ol>
        </Panel>
      </div>
    </>
  );
}
