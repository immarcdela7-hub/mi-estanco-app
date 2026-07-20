import { ActionForm } from "@/components/ActionForm";
import {
  EmptyState,
  PageHeader,
  Panel,
  Table,
  Td,
  btnGreen,
  inputCls,
  labelCls,
} from "@/components/ui";
import { createPayoutAction } from "@/lib/actions/sales";
import { euros, fmtDate, isoDate } from "@/lib/format";
import { pendingByEstablishment } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const [pending, payouts] = await Promise.all([
    pendingByEstablishment(),
    prisma.payout.findMany({
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      include: { establishment: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Liquidaciones"
        subtitle="Paga a cada establecimiento su parte de las ventas validadas y guarda el histórico."
      />

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="Pendiente de liquidar">
          {pending.length === 0 ? (
            <EmptyState>
              No hay comisiones pendientes. Valida ventas en <b>Ventas</b> para poder
              liquidarlas.
            </EmptyState>
          ) : (
            <Table headers={["Establecimiento", "Código", "Ventas", "Pendiente"]} rightAlign={[2, 3]}>
              {pending.map((p) => (
                <tr key={p.establishmentId}>
                  <Td className="font-semibold">{p.name}</Td>
                  <Td className="font-mono text-[13px]">{p.code}</Td>
                  <Td right>{p.ventas}</Td>
                  <Td right className="font-semibold">
                    {euros(p.pendiente)}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Generar liquidación">
          {pending.length === 0 ? (
            <p className="text-sm text-muted">
              Cuando haya comisiones validadas, podrás liquidarlas aquí.
            </p>
          ) : (
            <ActionForm action={createPayoutAction} submitLabel="Generar liquidación" submitClassName={btnGreen}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Establecimiento a liquidar</label>
                  <select name="establishmentId" className={inputCls}>
                    {pending.map((p) => (
                      <option key={p.establishmentId} value={p.establishmentId}>
                        {p.name} — {euros(p.pendiente)} ({p.ventas} ventas)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fecha de pago</label>
                  <input name="paymentDate" type="date" defaultValue={isoDate(new Date())} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Método</label>
                  <select name="method" className={inputCls}>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="bizum">Bizum</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Referencia del pago</label>
                  <input name="reference" className={inputCls} placeholder="Nº de transferencia, concepto…" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Notas</label>
                  <input name="notes" className={inputCls} placeholder="Opcional" />
                </div>
              </div>
            </ActionForm>
          )}
        </Panel>
      </div>

      <Panel title="Histórico de liquidaciones">
        {payouts.length === 0 ? (
          <p className="text-sm text-muted">Aún no se ha generado ninguna liquidación.</p>
        ) : (
          <>
            <Table
              headers={["Nº", "Fecha de pago", "Establecimiento", "Importe", "Ventas", "Método", "Referencia"]}
              rightAlign={[3, 4]}
            >
              {payouts.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-[13px]">#{p.id}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(p.paymentDate)}</Td>
                  <Td className="font-semibold">{p.establishment.name}</Td>
                  <Td right className="font-semibold">
                    {euros(p.amount)}
                  </Td>
                  <Td right>{p.nSales}</Td>
                  <Td>{p.method}</Td>
                  <Td>{p.reference || "—"}</Td>
                </tr>
              ))}
            </Table>
            <a href="/api/descargas/liquidaciones" className={`${btnGreen} mt-4`}>
              Exportar histórico (CSV)
            </a>
          </>
        )}
      </Panel>
    </>
  );
}
