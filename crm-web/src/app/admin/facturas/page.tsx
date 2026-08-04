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
import { deleteInvoiceAction, uploadInvoiceAction } from "@/lib/actions/facturas";
import { euros, fmtDate, isoDate, plural } from "@/lib/format";
import { EXTENSIONES_ACEPTADAS, MAX_BYTES } from "@/lib/facturas";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const MB = Math.round(MAX_BYTES / 1024 / 1024);

/* Se clasifica por donde va el dinero, no por quien escribe el papel: la de
   GetYourGuide la expiden ellos pero documenta lo que cobramos, y la del
   establecimiento la expedimos nosotros pero documenta lo que pagamos. */
const TIPOS = {
  INGRESO: { label: "Cobramos", detalle: "Lo que nos paga GetYourGuide", color: "text-emerald-700" },
  GASTO: { label: "Pagamos", detalle: "Lo que le devolvemos a un establecimiento", color: "text-slate-700" },
} as const;

function KindBadge({ kind }: { kind: "INGRESO" | "GASTO" }) {
  const t = TIPOS[kind];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
        kind === "INGRESO" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {t.label}
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
    ...(sp.desde ? { issueDate: { gte: new Date(sp.desde) } } : {}),
    ...(sp.hasta
      ? { issueDate: { ...(sp.desde ? { gte: new Date(sp.desde) } : {}), lte: new Date(sp.hasta) } }
      : {}),
  };

  const [establishments, invoices, resumen] = await Promise.all([
    prisma.establishment.findMany({ orderBy: { name: "asc" } }),
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      take: 300,
      include: { establishment: { select: { name: true, code: true } } },
    }),
    prisma.invoice.groupBy({ by: ["kind"], where, _sum: { total: true }, _count: { id: true } }),
  ]);

  const suma = (k: "INGRESO" | "GASTO") =>
    resumen.find((r) => r.kind === k)?._sum.total?.toNumber() ?? 0;
  const cobrado = suma("INGRESO");
  const pagado = suma("GASTO");

  return (
    <>
      <PageHeader
        title="Facturas"
        subtitle="El archivo de todo el papeleo: lo que nos paga GetYourGuide y lo que devolvemos a los establecimientos."
      />

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
        <Panel title="Archivar una factura">
          <p className="mb-3 text-sm text-muted">
            Sube el PDF y apunta sus datos. El importe se teclea a mano a propósito: leerlo del
            PDF automáticamente saldría mal una de cada veinte veces y nadie lo revisaría.
          </p>
          <ActionForm action={uploadInvoiceAction} submitLabel="Archivar factura" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Tipo</label>
                <select name="kind" className={inputCls} defaultValue="INGRESO">
                  <option value="INGRESO">Cobramos — la que nos manda GetYourGuide</option>
                  <option value="GASTO">Pagamos — la de un establecimiento</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Fecha de la factura</label>
                <input
                  name="issueDate"
                  type="date"
                  defaultValue={isoDate(new Date())}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Número</label>
                <input name="number" className={inputCls} placeholder="F-2026-0001" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Quién (la otra parte)</label>
                <input name="counterparty" className={inputCls} placeholder="GetYourGuide" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Concepto</label>
                <input
                  name="concept"
                  className={inputCls}
                  placeholder="Comisiones de julio de 2026"
                />
              </div>
              <div>
                <label className={labelCls}>Base (€)</label>
                <input name="base" type="number" min={0} step="0.01" defaultValue={0} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>IVA (%)</label>
                <input name="vatPct" type="number" min={0} step="0.01" defaultValue={0} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Total (€)</label>
                {/* Si se deja en 0 se calcula base+IVA; si se teclea, manda lo
                    tecleado: hay facturas con retenciones o redondeos. */}
                <input name="total" type="number" min={0} step="0.01" defaultValue={0} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Establecimiento (si aplica)</label>
                <select name="establishmentId" className={inputCls} defaultValue="">
                  <option value="">Ninguno</option>
                  {establishments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Archivo (PDF, JPG o PNG · máx. {MB} MB)</label>
                <input
                  name="file"
                  type="file"
                  accept={EXTENSIONES_ACEPTADAS}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="selfBilled" className="h-4 w-4 accent-blue-600" />
                  La ha expedido quien recibe el dinero, no quien lo cobra (autofactura)
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Notas</label>
                <input name="notes" className={inputCls} />
              </div>
            </div>
          </ActionForm>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title="Resumen de lo filtrado">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-emerald-50/50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Cobramos
                </p>
                <p className="mt-1 text-2xl font-extrabold text-emerald-700">{euros(cobrado)}</p>
              </div>
              <div className="rounded-xl border border-line bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pagamos</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-700">{euros(pagado)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">
              Diferencia: <b className="text-brand-blue-dark">{euros(cobrado - pagado)}</b>. No es
              el beneficio —faltan gastos y los impuestos— pero es lo que queda del reparto.
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
      </div>

      <Panel title="Archivo" className="mb-4">
        {invoices.length === 0 ? (
          <EmptyState>
            No hay facturas archivadas con estos filtros. Sube la primera desde el panel de
            arriba.
          </EmptyState>
        ) : (
          <>
            <Table
              headers={["Fecha", "Tipo", "Número", "Quién", "Concepto", "Total", "Archivo"]}
              rightAlign={[5]}
            >
              {invoices.map((f) => (
                <tr key={f.id}>
                  <Td className="whitespace-nowrap">{fmtDate(f.issueDate)}</Td>
                  <Td>
                    <KindBadge kind={f.kind} />
                  </Td>
                  <Td className="font-mono text-[12px]">{f.number || "—"}</Td>
                  <Td>{f.counterparty || f.establishment?.name || "—"}</Td>
                  <Td className="max-w-[220px] truncate">{f.concept || "—"}</Td>
                  <Td right>{euros(f.total)}</Td>
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
            Borra la ficha y el archivo. Una factura ya contabilizada no se debería quitar de
            aquí: si estaba mal, lo que corresponde es una rectificativa.
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
                    {fmtDate(f.issueDate)} · {f.number || f.fileName} · {euros(f.total)}
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
