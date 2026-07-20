import { EmptyState, PageHeader, Panel, SaleStatusBadge, Table, Td } from "@/components/ui";
import { requirePartner } from "@/lib/auth";
import { euros, fmtDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PartnerSalesPage() {
  const { establishment } = await requirePartner();
  const sales = await prisma.sale.findMany({
    where: { establishmentId: establishment.id },
    orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    take: 300,
  });

  return (
    <>
      <PageHeader
        title="Mis ventas"
        subtitle="Todas las compras realizadas a través de tu código QR."
      />
      <Panel title={`Ventas (${sales.length})`}>
        {sales.length === 0 ? (
          <EmptyState>Todavía no hay ventas registradas con tu QR.</EmptyState>
        ) : (
          <>
            <Table
              headers={["Fecha", "Actividad", "Entradas", "Importe", "Tu comisión", "Estado"]}
              rightAlign={[2, 3, 4]}
            >
              {sales.map((s) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap">{fmtDate(s.saleDate)}</Td>
                  <Td className="max-w-[260px] truncate">{s.activity || "—"}</Td>
                  <Td right>{s.tickets}</Td>
                  <Td right>{euros(s.amountTotal)}</Td>
                  <Td right className="font-semibold">
                    {euros(s.partnerShare)}
                  </Td>
                  <Td>
                    <SaleStatusBadge status={s.status} />
                  </Td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-xs text-muted">
              <i>Pendiente</i>: en revisión · <i>Validada</i>: confirmada, entrará en la próxima
              liquidación · <i>Pagada</i>: ya liquidada.
            </p>
          </>
        )}
      </Panel>
    </>
  );
}
