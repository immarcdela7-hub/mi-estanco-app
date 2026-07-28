/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import {
  Badge,
  PageHeader,
  Panel,
  btnGreen,
  btnSecondary,
  inputCls,
  labelCls,
} from "@/components/ui";
import {
  createPartnerAccessAction,
  deletePartnerAccessAction,
  updateEstablishmentAction,
} from "@/lib/actions/establishments";
import { fmtDate } from "@/lib/format";
import { buildTrackingUrl } from "@/lib/qr";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function EstablishmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estId = parseInt(id, 10);
  if (Number.isNaN(estId)) notFound();

  const [est, baseUrl] = await Promise.all([
    prisma.establishment.findUnique({
      where: { id: estId },
      include: {
        users: { where: { role: "PARTNER" }, orderBy: { username: "asc" } },
        qrCodes: { orderBy: { assignedAt: "asc" } },
      },
    }),
    getSetting("base_url"),
  ]);
  if (!est) notFound();

  const url = buildTrackingUrl(baseUrl, est.code, est.city);
  const extraCodes = est.qrCodes.filter((c) => c.code !== est.code);

  return (
    <>
      <PageHeader
        title={est.name}
        subtitle={`Código ${est.code} · ${est.city || "sin ciudad"}`}
        actions={
          <Link href="/admin/establecimientos" className={btnSecondary}>
            Volver al listado
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          {/* Lo que se cuelga en el local es el cartel entero, no un QR suelto:
              por eso el PDF va primero y el PNG queda para quien quiera
              montárselo aparte (una pegatina, la carta, un expositor). */}
          <Panel title="Cartel para imprimir">
            <div className="flex flex-col items-center gap-3">
              <img
                src={`/api/qr/${est.code}`}
                alt={`QR ${est.code}`}
                width={190}
                height={190}
                className="rounded-lg border border-line"
              />
              <a href={`/api/descargas/cartel/${est.code}`} className={`${btnGreen} w-full`}>
                Descargar cartel A6 (PDF)
              </a>
              <div className="flex w-full items-center justify-center gap-3 text-[13px] text-muted">
                <span>¿Varias mesas?</span>
                <a
                  href={`/api/descargas/cartel/${est.code}?copias=5`}
                  className="font-semibold text-brand-blue-dark hover:underline"
                >
                  5 copias
                </a>
                <a
                  href={`/api/descargas/cartel/${est.code}?copias=10`}
                  className="font-semibold text-brand-blue-dark hover:underline"
                >
                  10 copias
                </a>
              </div>
              <a href={`/api/qr/${est.code}?download=1`} className={`${btnSecondary} w-full`}>
                Solo el QR (PNG)
              </a>
              <code className="w-full overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
                {url}
              </code>
              {extraCodes.length > 0 && (
                <div className="w-full text-sm">
                  <span className="font-semibold text-slate-700">Carteles adicionales: </span>
                  {extraCodes.map((c) => (
                    <span key={c.code} className="mr-1 inline-flex items-center gap-1">
                      <Badge color="blue">{c.code}</Badge>
                      <a
                        href={`/api/descargas/cartel/${c.code}`}
                        className="text-xs font-semibold text-brand-blue-dark hover:underline"
                      >
                        PDF
                      </a>
                    </span>
                  ))}
                </div>
              )}
              {!est.city && (
                <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                  Este local no tiene ciudad. El cartel funcionará, pero la web no
                  podrá enseñar primero lo que hay cerca. Rellénala antes de imprimir.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Acceso al portal">
            {est.users.length > 0 && (
              <ul className="mb-4 flex flex-col gap-2">
                {est.users.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    <span>
                      <code className="font-mono font-semibold">{u.username}</code>{" "}
                      <span className="text-muted">· alta {fmtDate(u.createdAt)}</span>
                    </span>
                    <form action={deletePartnerAccessAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button className="text-sm font-semibold text-red-600 hover:underline">
                        Eliminar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm
              action={createPartnerAccessAction}
              submitLabel="Crear acceso"
              submitClassName={btnSecondary}
              resetOnSuccess
            >
              <input type="hidden" name="establishmentId" value={est.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Nuevo usuario</label>
                  <input name="username" className={inputCls} placeholder="barlaplaza" />
                </div>
                <div>
                  <label className={labelCls}>Contraseña (mín. 8)</label>
                  <input name="password" type="password" className={inputCls} />
                </div>
              </div>
            </ActionForm>
          </Panel>
        </div>

        <Panel title="Ficha">
          <ActionForm action={updateEstablishmentAction} submitLabel="Guardar cambios">
            <input type="hidden" name="id" value={est.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input name="name" defaultValue={est.name} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Contacto</label>
                <input name="contactName" defaultValue={est.contactName} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input name="email" defaultValue={est.email} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input name="phone" defaultValue={est.phone} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ciudad</label>
                <input name="city" defaultValue={est.city} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Dirección</label>
                <input name="address" defaultValue={est.address} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>% comisión devuelta</label>
                <input
                  name="commissionPct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={est.commissionPct.toNumber()}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Estado</label>
                <select name="status" defaultValue={est.status} className={inputCls}>
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Notas</label>
                <textarea name="notes" rows={3} defaultValue={est.notes} className={inputCls} />
              </div>
            </div>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">
            El % se aplica a las nuevas ventas; las ya guardadas mantienen el importe calculado
            en su momento.
          </p>
        </Panel>
      </div>
    </>
  );
}
