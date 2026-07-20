import { IconReceipt, IconWallet } from "@/components/icons";
import { EmptyState, PageHeader, Panel, StatCard, Table, Td } from "@/components/ui";
import { requirePartner } from "@/lib/auth";
import { euros, fmtDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PartnerPayoutsPage() {
  const { establishment } = await requirePartner();
  const payouts = await prisma.payout.findMany({
    where: { establishmentId: establishment.id },
    orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
  });
  const total = payouts.reduce((a, p) => a + p.amount.toNumber(), 0);

  return (
    <>
      <PageHeader title="Mis liquidaciones" subtitle="Pagos que te hemos realizado." />

      {payouts.length === 0 ? (
        <EmptyState>
          Aún no hay liquidaciones. Cuando acumules comisión validada, te la pagaremos aquí.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <StatCard label="Total cobrado" value={euros(total)} icon={<IconWallet />} />
            <StatCard label="Liquidaciones" value={String(payouts.length)} icon={<IconReceipt />} />
          </div>
          <Panel title="Historial de pagos">
            <Table
              headers={["Nº", "Fecha de pago", "Importe", "Ventas", "Método", "Referencia"]}
              rightAlign={[2, 3]}
            >
              {payouts.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-[13px]">#{p.id}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(p.paymentDate)}</Td>
                  <Td right className="font-semibold">
                    {euros(p.amount)}
                  </Td>
                  <Td right>{p.nSales}</Td>
                  <Td>{p.method}</Td>
                  <Td>{p.reference || "—"}</Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}
    </>
  );
}
