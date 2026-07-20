import { ActionForm } from "@/components/ActionForm";
import { PageHeader, Panel, Table, Td, inputCls, labelCls } from "@/components/ui";
import { changePasswordAction } from "@/lib/actions/auth";
import { updateSettingsAction } from "@/lib/actions/settings";
import { fmtDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [brand, baseUrl, defaultPct, partners] = await Promise.all([
    getSetting("brand_name"),
    getSetting("base_url"),
    getSetting("default_commission_pct"),
    prisma.user.findMany({
      where: { role: "PARTNER" },
      orderBy: { username: "asc" },
      include: { establishment: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Configuración general del CRM." />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Marca y enlace de los QR">
          <ActionForm action={updateSettingsAction} submitLabel="Guardar ajustes">
            <div className="flex flex-col gap-3">
              <div>
                <label className={labelCls}>Nombre de la marca</label>
                <input name="brand_name" defaultValue={brand} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>URL de tu web de venta de entradas</label>
                <input name="base_url" defaultValue={baseUrl} className={inputCls} />
                <p className="mt-1 text-xs text-muted">
                  Los QR apuntan a esta web añadiendo ?ref=CÓDIGO para atribuir cada compra.
                </p>
              </div>
              <div>
                <label className={labelCls}>% de comisión devuelta por defecto</label>
                <input
                  name="default_commission_pct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={defaultPct}
                  className={inputCls}
                />
              </div>
            </div>
          </ActionForm>
        </Panel>

        <Panel title="Cambiar mi contraseña">
          <ActionForm action={changePasswordAction} submitLabel="Cambiar contraseña" resetOnSuccess>
            <div className="flex flex-col gap-3">
              <div>
                <label className={labelCls}>Contraseña actual</label>
                <input name="current" type="password" className={inputCls} autoComplete="current-password" />
              </div>
              <div>
                <label className={labelCls}>Nueva contraseña (mín. 8)</label>
                <input name="new1" type="password" className={inputCls} autoComplete="new-password" />
              </div>
              <div>
                <label className={labelCls}>Repite la nueva contraseña</label>
                <input name="new2" type="password" className={inputCls} autoComplete="new-password" />
              </div>
            </div>
          </ActionForm>
        </Panel>
      </div>

      <Panel title="Accesos de establecimientos" className="mt-4">
        {partners.length === 0 ? (
          <p className="text-sm text-muted">
            Aún no hay accesos creados. Se crean desde la ficha de cada establecimiento.
          </p>
        ) : (
          <Table headers={["Usuario", "Establecimiento", "Alta"]}>
            {partners.map((u) => (
              <tr key={u.id}>
                <Td className="font-mono text-[13px]">{u.username}</Td>
                <Td>{u.establishment?.name ?? "—"}</Td>
                <Td className="whitespace-nowrap">{fmtDate(u.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
