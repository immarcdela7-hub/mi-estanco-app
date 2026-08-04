import Link from "next/link";
import { EmptyState, PageHeader, Panel, Table, Td } from "@/components/ui";
import { requirePartner } from "@/lib/auth";
import { euros, fmtDate, plural } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Las facturas del establecimiento.
 *
 * Solo las de **gasto** y solo las suyas: son las que documentan lo que le
 * pagamos. Las de ingreso son lo que nos paga GetYourGuide y no le incumben,
 * ni siquiera las de ventas salidas de su QR. La ruta de descarga vuelve a
 * comprobarlo por su cuenta: que aquí no se enseñe un enlace no impide que
 * alguien pruebe la URL a mano.
 */
export default async function PartnerInvoicesPage() {
  const { establishment } = await requirePartner();
  const facturas = await prisma.invoice.findMany({
    where: { establishmentId: establishment.id, kind: "GASTO" },
    orderBy: [{ issueDate: "desc" }, { id: "desc" }],
    take: 200,
  });
  const total = facturas.reduce((a, f) => a + f.total.toNumber(), 0);

  return (
    <>
      <PageHeader
        title="Mis facturas"
        subtitle="Las facturas de las comisiones que te hemos pagado."
      />

      {facturas.length === 0 ? (
        <EmptyState>
          Todavía no hay facturas. Aparecerán aquí cuando te liquidemos la primera comisión.
        </EmptyState>
      ) : (
        <Panel title={`Archivo (${plural(facturas.length, "factura", "facturas")})`}>
          <Table headers={["Fecha", "Número", "Concepto", "Total", "Archivo"]} rightAlign={[3]}>
            {facturas.map((f) => (
              <tr key={f.id}>
                <Td className="whitespace-nowrap">{fmtDate(f.issueDate)}</Td>
                <Td className="font-mono text-[12px]">{f.number || "—"}</Td>
                <Td className="max-w-[260px] truncate">{f.concept || "—"}</Td>
                <Td right className="font-semibold">
                  {euros(f.total)}
                </Td>
                <Td>
                  <Link
                    className="font-semibold text-brand-blue-dark hover:underline"
                    href={`/api/facturas/${f.id}`}
                  >
                    Descargar
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted">Total facturado: {euros(total)}</p>
        </Panel>
      )}
    </>
  );
}
