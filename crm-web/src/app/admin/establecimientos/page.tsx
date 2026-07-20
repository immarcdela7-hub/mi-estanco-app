import Link from "next/link";
import { Badge, EmptyState, PageHeader, Panel, Table, Td, inputCls, labelCls } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { createEstablishmentAction } from "@/lib/actions/establishments";
import { pct } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function EstablishmentsPage() {
  const [establishments, freeCodes, baseUrl] = await Promise.all([
    prisma.establishment.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { sales: true, users: true } } },
    }),
    prisma.qrCode.findMany({
      where: { establishmentId: null },
      orderBy: { code: "asc" },
      select: { code: true },
    }),
    getSetting("base_url"),
  ]);

  return (
    <>
      <PageHeader
        title="Establecimientos"
        subtitle={`Alta de locales, códigos QR únicos y accesos al portal. Los QR apuntan a ${baseUrl}.`}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title={`Listado (${establishments.length})`}>
          {establishments.length === 0 ? (
            <EmptyState>Crea tu primer establecimiento con el formulario de al lado.</EmptyState>
          ) : (
            <Table headers={["Establecimiento", "Código", "Ciudad", "Comisión", "Ventas", ""]} rightAlign={[4]}>
              {establishments.map((e) => (
                <tr key={e.id} className={e.status === "INACTIVO" ? "opacity-50" : ""}>
                  <Td className="font-semibold">
                    {e.name}
                    {e.status === "INACTIVO" && (
                      <span className="ml-2 align-middle">
                        <Badge color="gray">inactivo</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="font-mono text-[13px]">{e.code}</Td>
                  <Td>{e.city || "—"}</Td>
                  <Td>
                    <Badge color="green">{pct(e.commissionPct)}</Badge>
                  </Td>
                  <Td right>{e._count.sales}</Td>
                  <Td>
                    <Link
                      href={`/admin/establecimientos/${e.id}`}
                      className="font-semibold text-brand-blue-dark hover:underline"
                    >
                      Abrir ficha
                    </Link>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Nuevo establecimiento">
          <ActionForm action={createEstablishmentAction} submitLabel="Crear establecimiento" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Nombre *</label>
                <input name="name" className={inputCls} placeholder="Bar La Plaza" />
              </div>
              <div>
                <label className={labelCls}>Persona de contacto</label>
                <input name="contactName" className={inputCls} placeholder="María García" />
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input name="phone" className={inputCls} placeholder="600 000 000" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Email</label>
                <input name="email" type="email" className={inputCls} placeholder="contacto@barlaplaza.com" />
              </div>
              <div>
                <label className={labelCls}>Ciudad</label>
                <input name="city" className={inputCls} placeholder="Barcelona" />
              </div>
              <div>
                <label className={labelCls}>Dirección</label>
                <input name="address" className={inputCls} placeholder="C/ Mayor 1" />
              </div>
              <div>
                <label className={labelCls}>% comisión devuelta</label>
                <input
                  name="commissionPct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={30}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Código QR</label>
                <select name="existingCode" className={inputCls} defaultValue="__new__">
                  <option value="__new__">Generar uno nuevo</option>
                  {freeCodes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} (cartel preimpreso)
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Notas internas</label>
                <textarea name="notes" rows={2} className={inputCls} placeholder="Acuerdo, condiciones…" />
              </div>
            </div>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">
            Si le has entregado un cartel preimpreso, elige el código que aparece impreso
            debajo de su QR. Si no, se genera un código nuevo.
          </p>
        </Panel>
      </div>
    </>
  );
}
