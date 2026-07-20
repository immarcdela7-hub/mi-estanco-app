import { ActionForm } from "@/components/ActionForm";
import { IconQr, IconStore, IconTag } from "@/components/icons";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  Table,
  Td,
  btnGreen,
  btnSecondary,
  inputCls,
  labelCls,
} from "@/components/ui";
import {
  assignCodeAction,
  generateBatchAction,
  unassignCodeAction,
} from "@/lib/actions/codes";
import { fmtDate, plural } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function QrPoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [codes, establishments, baseUrl] = await Promise.all([
    prisma.qrCode.findMany({
      orderBy: [{ createdAt: "desc" }, { code: "asc" }],
      include: { establishment: { select: { name: true } } },
      take: 600,
    }),
    prisma.establishment.findMany({ where: { status: "ACTIVO" }, orderBy: { name: "asc" } }),
    getSetting("base_url"),
  ]);

  const free = codes.filter((c) => !c.establishmentId);
  const batches = [...new Set(codes.map((c) => c.batch).filter(Boolean))].sort();
  const selectedBatch = sp.lote ?? "";
  const printable = selectedBatch ? free.filter((c) => c.batch === selectedBatch) : free;
  const extraAssigned = codes.filter((c) => c.establishmentId && c.batch !== "auto");

  return (
    <>
      <PageHeader
        title="Códigos QR preimpresos"
        subtitle="Genera lotes de QR sin asignar, imprime los carteles y vincúlalos a un establecimiento cuando los repartas."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Códigos en el pool" value={String(codes.length)} icon={<IconQr />} />
        <StatCard label="Libres (sin asignar)" value={String(free.length)} icon={<IconTag />} />
        <StatCard label="Asignados" value={String(codes.length - free.length)} icon={<IconStore />} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Generar lote">
          <ActionForm action={generateBatchAction} submitLabel="Generar lote" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>¿Cuántos códigos generar?</label>
                <input name="n" type="number" min={1} max={500} defaultValue={25} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Etiqueta del lote (opcional)</label>
                <input name="batch" className={inputCls} placeholder="imprenta-agosto" />
              </div>
            </div>
          </ActionForm>
        </Panel>

        <Panel title="Imprimir carteles">
          {free.length === 0 ? (
            <EmptyState>No hay códigos libres que imprimir. Genera un lote primero.</EmptyState>
          ) : (
            <>
              <form method="get" className="mb-3 flex items-end gap-2">
                <div className="grow">
                  <label className={labelCls}>Lote a imprimir</label>
                  <select name="lote" defaultValue={selectedBatch} className={inputCls}>
                    <option value="">Todos los libres</option>
                    {batches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <button className={btnSecondary}>Aplicar</button>
              </form>
              <p className="mb-3 text-sm text-muted">
                {plural(printable.length, "cartel", "carteles")} — cada uno con su QR único
                apuntando a <code className="text-xs">{baseUrl}</code> y el código impreso en
                pequeño. El PDF replica vuestro cartel A6; si la imprenta prefiere maquetar,
                usa el ZIP.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/descargas/carteles${selectedBatch ? `?lote=${encodeURIComponent(selectedBatch)}` : ""}`}
                  className={btnGreen}
                >
                  Carteles A6 en PDF
                </a>
                <a
                  href={`/api/descargas/qrs${selectedBatch ? `?lote=${encodeURIComponent(selectedBatch)}` : ""}`}
                  className={btnSecondary}
                >
                  Solo los QR en PNG (ZIP)
                </a>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Vincular un cartel entregado">
          {free.length === 0 ? (
            <p className="text-sm text-muted">No hay códigos libres para asignar.</p>
          ) : establishments.length === 0 ? (
            <EmptyState>No hay establecimientos activos.</EmptyState>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Al entregar un cartel, elige el código impreso debajo de su QR y el
                establecimiento.
              </p>
              <ActionForm action={assignCodeAction} submitLabel="Vincular" resetOnSuccess>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Código libre</label>
                    <select name="code" className={inputCls}>
                      {free.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Establecimiento</label>
                    <select name="establishmentId" className={inputCls}>
                      {establishments.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </ActionForm>
            </>
          )}
        </Panel>

        <Panel title="Liberar un código">
          {extraAssigned.length === 0 ? (
            <p className="text-sm text-muted">
              No hay códigos de cartel asignados que se puedan liberar (el código principal de
              cada local no se libera).
            </p>
          ) : (
            <ActionForm action={unassignCodeAction} submitLabel="Liberar código" submitClassName={btnSecondary}>
              <label className={labelCls}>Código asignado</label>
              <select name="code" className={inputCls}>
                {extraAssigned.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.establishment?.name}
                  </option>
                ))}
              </select>
            </ActionForm>
          )}
        </Panel>
      </div>

      <Panel title="Pool de códigos">
        {codes.length === 0 ? (
          <EmptyState>Aún no hay códigos en el pool. Genera el primer lote arriba.</EmptyState>
        ) : (
          <Table headers={["Código", "Estado", "Lote", "Creado"]}>
            {codes.map((c) => (
              <tr key={c.code}>
                <Td className="font-mono text-[13px]">{c.code}</Td>
                <Td>
                  {c.establishment ? (
                    <Badge color="blue">Asignado · {c.establishment.name}</Badge>
                  ) : (
                    <Badge color="green">Libre</Badge>
                  )}
                </Td>
                <Td>{c.batch || "—"}</Td>
                <Td className="whitespace-nowrap">{fmtDate(c.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
