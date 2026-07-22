import { ActionForm } from "@/components/ActionForm";
import {
  EmptyState,
  PageHeader,
  Panel,
  SaleStatusBadge,
  Table,
  Td,
  btnSecondary,
  inputCls,
  labelCls,
} from "@/components/ui";
import {
  addSaleAction,
  deleteSalesAction,
  importCsvAction,
  validateSalesAction,
} from "@/lib/actions/sales";
import { euros, fmtDate, isoDate, plural } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const CSV_TEMPLATE =
  "fecha,codigo_establecimiento,referencia_reserva,actividad,entradas,importe_total,comision_gyg\n" +
  "2026-07-15,EST-XXXXX,GYG-ABC123,Sagrada Família — entrada general,2,52.00,6.24\n";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const estFilter = sp.est ? parseInt(sp.est, 10) : undefined;
  const statusFilter = sp.estado as "PENDIENTE" | "VALIDADA" | "PAGADA" | undefined;

  const where: Prisma.SaleWhereInput = {
    ...(estFilter ? { establishmentId: estFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(sp.desde ? { saleDate: { gte: new Date(sp.desde) } } : {}),
    ...(sp.hasta
      ? { saleDate: { ...(sp.desde ? { gte: new Date(sp.desde) } : {}), lte: new Date(sp.hasta) } }
      : {}),
  };

  const [establishments, sales] = await Promise.all([
    prisma.establishment.findMany({ orderBy: { name: "asc" } }),
    prisma.sale.findMany({
      where,
      orderBy: [{ saleDate: "desc" }, { id: "desc" }],
      take: 300,
      include: { establishment: { select: { name: true, code: true } } },
    }),
  ]);

  const active = establishments.filter((e) => e.status === "ACTIVO");
  const pending = sales.filter((s) => s.status === "PENDIENTE");
  const deletable = sales.filter((s) => s.payoutId === null);
  const totalGyg = sales.reduce((a, s) => a + s.gygCommission.toNumber(), 0);
  const totalPartner = sales.reduce((a, s) => a + s.partnerShare.toNumber(), 0);

  return (
    <>
      <PageHeader
        title="Ventas"
        subtitle="Registra las ventas atribuidas a cada QR y valídalas para liquidarlas."
      />

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Registrar venta">
          {active.length === 0 ? (
            <EmptyState>Primero crea un establecimiento activo.</EmptyState>
          ) : (
            <ActionForm action={addSaleAction} submitLabel="Registrar venta" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Establecimiento (QR de origen)</label>
                  <select name="establishmentId" className={inputCls}>
                    {active.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fecha de la venta</label>
                  <input name="saleDate" type="date" defaultValue={isoDate(new Date())} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Actividad / entrada vendida</label>
                  <input name="activity" className={inputCls} placeholder="Sagrada Família — entrada general" />
                </div>
                <div>
                  <label className={labelCls}>Referencia de reserva GYG</label>
                  <input name="bookingRef" className={inputCls} placeholder="GYG-ABC123" />
                </div>
                <div>
                  <label className={labelCls}>Nº de entradas</label>
                  <input name="tickets" type="number" min={1} defaultValue={1} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Importe de la venta (€)</label>
                  <input name="amountTotal" type="number" min={0} step="0.01" defaultValue={0} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Comisión que nos paga GYG (€)</label>
                  <input name="gygCommission" type="number" min={0} step="0.01" defaultValue={0} className={inputCls} />
                </div>
              </div>
            </ActionForm>
          )}
        </Panel>

        <Panel title="Importar CSV">
          <p className="mb-3 text-sm text-muted">
            Una fila por venta con columnas: <code className="text-xs">fecha, codigo_establecimiento,
            referencia_reserva, actividad, entradas, importe_total, comision_gyg</code>. Las
            reservas ya registradas se descartan para no duplicar.
          </p>
          <a
            className={`${btnSecondary} mb-4`}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
            download="plantilla_ventas.csv"
          >
            Descargar plantilla CSV
          </a>
          <ActionForm action={importCsvAction} submitLabel="Importar ventas" resetOnSuccess>
            <input
              name="file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
            />
          </ActionForm>
        </Panel>
      </div>

      <Panel title="Listado y validación" className="mb-4">
        <form method="get" className="mb-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Establecimiento</label>
            <select name="est" defaultValue={sp.est ?? ""} className={inputCls}>
              <option value="">Todos</option>
              {establishments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select name="estado" defaultValue={sp.estado ?? ""} className={inputCls}>
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="VALIDADA">Validada</option>
              <option value="PAGADA">Pagada</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Desde</label>
            <input name="desde" type="date" defaultValue={sp.desde ?? ""} className={inputCls} />
          </div>
          <div className="flex items-end gap-2">
            <div className="grow">
              <label className={labelCls}>Hasta</label>
              <input name="hasta" type="date" defaultValue={sp.hasta ?? ""} className={inputCls} />
            </div>
            <button className={btnSecondary}>Filtrar</button>
          </div>
        </form>

        {sales.length === 0 ? (
          <EmptyState>No hay ventas con estos filtros.</EmptyState>
        ) : (
          <>
            <Table
              headers={["Fecha", "Establecimiento", "Actividad", "Reserva", "Entr.", "Importe", "GYG", "Estab.", "Estado"]}
              rightAlign={[4, 5, 6, 7]}
            >
              {sales.map((s) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap">{fmtDate(s.saleDate)}</Td>
                  <Td>{s.establishment.name}</Td>
                  <Td className="max-w-[200px] truncate">{s.activity || "—"}</Td>
                  <Td className="font-mono text-[12px]">{s.bookingRef || "—"}</Td>
                  <Td right>{s.tickets}</Td>
                  <Td right>{euros(s.amountTotal)}</Td>
                  <Td right>{euros(s.gygCommission)}</Td>
                  <Td right>{euros(s.partnerShare)}</Td>
                  <Td>
                    <SaleStatusBadge status={s.status} />
                  </Td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-xs text-muted">
              {plural(sales.length, "venta", "ventas")} · Comisión GYG {euros(totalGyg)} · Para
              establecimientos {euros(totalPartner)}
            </p>
          </>
        )}
      </Panel>

      {pending.length > 0 && (
        <Panel title={`Validar ventas pendientes (${pending.length})`} className="mb-4">
          <p className="mb-3 text-sm text-muted">
            Validar una venta confirma que GYG nos la ha abonado y la deja lista para liquidar.
          </p>
          <ActionForm action={validateSalesAction} submitLabel="Validar seleccionadas">
            <div className="flex flex-col gap-1.5">
              {pending.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input type="checkbox" name="saleId" value={s.id} defaultChecked className="h-4 w-4 accent-blue-600" />
                  <span className="whitespace-nowrap">{fmtDate(s.saleDate)}</span>
                  <span className="font-semibold">{s.establishment.name}</span>
                  <span className="ml-auto tabular-nums">{euros(s.gygCommission)}</span>
                </label>
              ))}
            </div>
          </ActionForm>
        </Panel>
      )}

      {deletable.length > 0 && (
        <details className="rounded-xl border border-line bg-white p-5">
          <summary className="cursor-pointer text-sm font-bold text-slate-600">
            Eliminar ventas (solo si no están liquidadas)
          </summary>
          <div className="mt-3">
            <ActionForm action={deleteSalesAction} submitLabel="Eliminar seleccionadas" submitClassName="inline-flex items-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
              <div className="flex flex-col gap-1.5">
                {deletable.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <input type="checkbox" name="saleId" value={s.id} className="h-4 w-4 accent-red-600" />
                    <span className="whitespace-nowrap">{fmtDate(s.saleDate)}</span>
                    <span className="font-semibold">{s.establishment.name}</span>
                    <span className="text-muted">{s.activity || "—"}</span>
                    <span className="ml-auto tabular-nums">{euros(s.gygCommission)}</span>
                  </label>
                ))}
              </div>
            </ActionForm>
          </div>
        </details>
      )}
    </>
  );
}
