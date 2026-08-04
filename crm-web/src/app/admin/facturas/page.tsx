import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import {
  EmptyState,
  PageHeader,
  Panel,
  Table,
  Td,
  btnSecondary,
  inputCls,
  labelCls,
} from "@/components/ui";
import {
  archivarFacturasAction,
  deleteInvoiceAction,
  enlazarFacturaAction,
} from "@/lib/actions/facturas";
import { euros, fmtDate, plural } from "@/lib/format";
import { EXTENSIONES_ACEPTADAS, MAX_BYTES } from "@/lib/facturas";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const MB = Math.round(MAX_BYTES / 1024 / 1024);

const ficheroCls =
  "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200";

function KindBadge({ kind }: { kind: "INGRESO" | "GASTO" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
        kind === "INGRESO" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {kind === "INGRESO" ? "Cobramos" : "Pagamos"}
    </span>
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const kindFilter = sp.tipo === "INGRESO" || sp.tipo === "GASTO" ? sp.tipo : undefined;
  const estFilter = sp.est ? parseInt(sp.est, 10) : undefined;

  const where: Prisma.InvoiceWhereInput = {
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(estFilter && !Number.isNaN(estFilter) ? { establishmentId: estFilter } : {}),
    ...(sp.desde || sp.hasta
      ? {
          issueDate: {
            ...(sp.desde ? { gte: new Date(sp.desde) } : {}),
            ...(sp.hasta ? { lte: new Date(sp.hasta) } : {}),
          },
        }
      : {}),
  };

  const [establishments, payouts, invoices, resumen, sueltas, ventasRecientes] = await Promise.all([
    prisma.establishment.findMany({ orderBy: { name: "asc" } }),
    prisma.payout.findMany({
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      take: 60,
      include: { establishment: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      take: 300,
      include: { establishment: { select: { name: true } } },
    }),
    prisma.invoice.groupBy({ by: ["kind"], where, _sum: { total: true } }),
    prisma.invoice.findMany({
      where: { kind: "INGRESO", saleId: null },
      orderBy: { id: "desc" },
      take: 50,
    }),
    prisma.sale.findMany({
      where: { bookingRef: { not: "" } },
      orderBy: [{ saleDate: "desc" }, { id: "desc" }],
      take: 200,
      select: { id: true, saleDate: true, bookingRef: true, activity: true, gygCommission: true },
    }),
  ]);

  const suma = (k: "INGRESO" | "GASTO") =>
    resumen.find((r) => r.kind === k)?._sum.total?.toNumber() ?? 0;
  const cobrado = suma("INGRESO");
  const pagado = suma("GASTO");

  return (
    <>
      <PageHeader
        title="Facturas"
        subtitle="El archivo del papeleo. Se sube el PDF y ya está: los datos salen de la venta o de la liquidación, no se teclean."
      />

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Facturas de GetYourGuide">
          <p className="mb-3 text-sm text-muted">
            Suelta aquí todos los PDF del mes de golpe. Cada uno se enlaza solo con su venta por
            el localizador que lleva en el nombre, y de ahí saca la fecha y el importe. Los que no
            se puedan enlazar se guardan igual y se enlazan abajo.
          </p>
          <ActionForm action={archivarFacturasAction} submitLabel="Archivar" resetOnSuccess>
            <input type="hidden" name="kind" value="INGRESO" />
            <label className={labelCls}>Archivos (PDF, JPG o PNG · máx. {MB} MB cada uno)</label>
            <input name="files" type="file" multiple accept={EXTENSIONES_ACEPTADAS} className={ficheroCls} />
          </ActionForm>
        </Panel>

        <Panel title="Facturas a un establecimiento">
          <p className="mb-3 text-sm text-muted">
            Elige la liquidación y adjunta el PDF. El importe, la fecha y a quién van salen de la
            propia liquidación.
          </p>
          {payouts.length === 0 ? (
            <EmptyState>
              Todavía no hay liquidaciones. Cuando pagues la primera, podrás archivar su factura
              aquí.
            </EmptyState>
          ) : (
            <ActionForm action={archivarFacturasAction} submitLabel="Archivar" resetOnSuccess>
              <input type="hidden" name="kind" value="GASTO" />
              <div className="mb-3">
                <label className={labelCls}>Liquidación</label>
                <select name="payoutId" className={inputCls} defaultValue="">
                  <option value="">Elige cuál</option>
                  {payouts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {fmtDate(p.paymentDate)} · {p.establishment.name} · {euros(p.amount)}
                    </option>
                  ))}
                </select>
              </div>
              <label className={labelCls}>Archivo (PDF, JPG o PNG · máx. {MB} MB)</label>
              <input name="files" type="file" accept={EXTENSIONES_ACEPTADAS} className={ficheroCls} />
            </ActionForm>
          )}
        </Panel>
      </div>

      {sueltas.length > 0 && (
        <Panel title={`Sin enlazar (${sueltas.length})`} className="mb-4">
          <p className="mb-3 text-sm text-muted">
            Estas se guardaron pero su nombre no decía el localizador, así que no se sabe de qué
            venta son. Al enlazarlas cogen su fecha y su importe.
          </p>
          <ActionForm action={enlazarFacturaAction} submitLabel="Enlazar" compact>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Factura</label>
                <select name="invoiceId" className={inputCls} defaultValue="">
                  <option value="">Elige cuál</option>
                  {sueltas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.fileName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Venta</label>
                <select name="saleId" className={inputCls} defaultValue="">
                  <option value="">Elige cuál</option>
                  {ventasRecientes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {fmtDate(v.saleDate)} · {v.bookingRef} · {euros(v.gygCommission)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </ActionForm>
        </Panel>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Resumen de lo filtrado">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-emerald-50/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Cobramos</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700">{euros(cobrado)}</p>
            </div>
            <div className="rounded-xl border border-line bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pagamos</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-700">{euros(pagado)}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">
            Diferencia: <b className="text-brand-blue-dark">{euros(cobrado - pagado)}</b>. No es el
            beneficio —faltan gastos e impuestos— pero es lo que queda del reparto.
          </p>
        </Panel>

        <Panel title="Filtrar">
          <form method="get" className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Tipo</label>
              <select name="tipo" defaultValue={sp.tipo ?? ""} className={inputCls}>
                <option value="">Todas</option>
                <option value="INGRESO">Cobramos</option>
                <option value="GASTO">Pagamos</option>
              </select>
            </div>
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
        </Panel>
      </div>

      <Panel title="Archivo" className="mb-4">
        {invoices.length === 0 ? (
          <EmptyState>
            No hay facturas archivadas con estos filtros. Sube las primeras desde arriba.
          </EmptyState>
        ) : (
          <>
            <Table
              headers={["Fecha", "Tipo", "Quién", "Concepto", "Importe", "Archivo"]}
              rightAlign={[4]}
            >
              {invoices.map((f) => (
                <tr key={f.id}>
                  <Td className="whitespace-nowrap">{fmtDate(f.issueDate)}</Td>
                  <Td>
                    <KindBadge kind={f.kind} />
                  </Td>
                  <Td>{f.counterparty || f.establishment?.name || "—"}</Td>
                  <Td className="max-w-[260px] truncate">
                    {f.concept || <span className="text-slate-400">sin enlazar</span>}
                  </Td>
                  <Td right>{f.total.toNumber() > 0 ? euros(f.total) : "—"}</Td>
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
            <p className="mt-2 text-xs text-muted">
              {plural(invoices.length, "factura archivada", "facturas archivadas")}
            </p>
          </>
        )}
      </Panel>

      {invoices.length > 0 && (
        <details className="rounded-xl border border-line bg-white p-5">
          <summary className="cursor-pointer text-sm font-bold text-slate-600">
            Eliminar una factura del archivo
          </summary>
          <p className="mt-2 text-sm text-muted">
            Borra la ficha y el archivo. Una factura ya contabilizada no se debería quitar de aquí:
            si estaba mal, lo que corresponde es una rectificativa.
          </p>
          <div className="mt-3">
            <ActionForm
              action={deleteInvoiceAction}
              submitLabel="Eliminar"
              submitClassName="inline-flex items-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <select name="invoiceId" className={inputCls} defaultValue="">
                <option value="">Elige cuál</option>
                {invoices.map((f) => (
                  <option key={f.id} value={f.id}>
                    {fmtDate(f.issueDate)} · {f.fileName} · {euros(f.total)}
                  </option>
                ))}
              </select>
            </ActionForm>
          </div>
        </details>
      )}
    </>
  );
}
