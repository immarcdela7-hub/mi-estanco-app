import { ActionForm } from "@/components/ActionForm";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  btnSecondary,
  inputCls,
  labelCls,
} from "@/components/ui";
import {
  createActivityAction,
  toggleActivityAction,
  updateActivityAction,
} from "@/lib/actions/actividades";
import { euros, pct, plural } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import type { OwnActivity } from "@prisma/client";

export const dynamic = "force-dynamic";

const DIAS = [
  { n: 1, label: "L" },
  { n: 2, label: "M" },
  { n: 3, label: "X" },
  { n: 4, label: "J" },
  { n: 5, label: "V" },
  { n: 6, label: "S" },
  { n: 0, label: "D" },
];

const CATEGORIAS = [
  { value: "culture", label: "Cultura" },
  { value: "gastro", label: "Gastronomía" },
  { value: "sea", label: "Mar" },
  { value: "nature", label: "Naturaleza" },
  { value: "nightlife", label: "Noche" },
  { value: "family", label: "Familia" },
];

function diasTexto(weekdays: string): string {
  const set = new Set(
    weekdays.split(",").map((d) => parseInt(d.trim(), 10)).filter(Number.isInteger)
  );
  if (set.size === 7) return "Todos los días";
  return DIAS.filter((d) => set.has(d.n)).map((d) => d.label).join(" ") || "—";
}

/** Formulario compartido por el alta y la edición. */
function CamposActividad({ a }: { a?: OwnActivity }) {
  const dias = new Set(
    (a?.weekdays ?? "0,1,2,3,4,5,6")
      .split(",")
      .map((d) => parseInt(d.trim(), 10))
      .filter(Number.isInteger)
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelCls}>Título</label>
        <input
          name="title"
          defaultValue={a?.title}
          required
          className={inputCls}
          placeholder="Cata de vinos en el Penedès"
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Resumen (una línea, es lo que se lee en la tarjeta)</label>
        <input
          name="summary"
          defaultValue={a?.summary}
          className={inputCls}
          placeholder="Tres vinos y una visita a la bodega, con el enólogo"
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Descripción</label>
        <textarea name="description" rows={3} defaultValue={a?.description} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Provincia</label>
        <select name="province" defaultValue={a?.province ?? "barcelona"} className={inputCls}>
          <option value="barcelona">Barcelona</option>
          <option value="tarragona">Tarragona</option>
          <option value="girona">Girona</option>
          <option value="lleida">Lleida</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Ciudad</label>
        <input name="city" defaultValue={a?.city} className={inputCls} placeholder="Vilafranca del Penedès" />
      </div>
      <div>
        <label className={labelCls}>Categoría</label>
        <select name="category" defaultValue={a?.category ?? "gastro"} className={inputCls}>
          {CATEGORIAS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Foto (URL)</label>
        <input name="imageUrl" defaultValue={a?.imageUrl} className={inputCls} placeholder="https://…" />
      </div>
      <div>
        <label className={labelCls}>Precio por persona (€)</label>
        <input
          name="pricePerPerson"
          type="number"
          min={0}
          step={0.5}
          defaultValue={a ? a.pricePerPerson.toNumber() : 35}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Nuestro margen (%)</label>
        <input
          name="ntlMarginPct"
          type="number"
          min={0}
          max={100}
          step={0.5}
          defaultValue={a ? a.ntlMarginPct.toNumber() : 20}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Duración (minutos)</label>
        <input
          name="durationMin"
          type="number"
          min={15}
          step={15}
          defaultValue={a?.durationMin ?? 90}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Cupo por hora</label>
        <input
          name="capacity"
          type="number"
          min={1}
          defaultValue={a?.capacity ?? 10}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Mínimo de personas</label>
        <input
          name="minPeople"
          type="number"
          min={1}
          defaultValue={a?.minPeople ?? 1}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Horas de inicio</label>
        <input
          name="slots"
          defaultValue={a?.slots ?? "11:00|17:00"}
          className={inputCls}
          placeholder="11:00|17:00"
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Días con actividad</label>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => (
            <label
              key={d.n}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
            >
              <input
                type="checkbox"
                name="weekdays"
                value={d.n}
                defaultChecked={dias.has(d.n)}
                className="accent-brand-blue"
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>Antelación mínima (horas)</label>
        <input
          name="leadHours"
          type="number"
          min={0}
          defaultValue={a?.leadHours ?? 24}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Se puede reservar hasta (días vista)</label>
        <input
          name="horizonDays"
          type="number"
          min={1}
          defaultValue={a?.horizonDays ?? 60}
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Punto de encuentro</label>
        <input
          name="meetingPoint"
          defaultValue={a?.meetingPoint}
          className={inputCls}
          placeholder="Celler Can Ramon, Carrer Major 12"
        />
      </div>
      <div>
        <label className={labelCls}>Proveedor</label>
        <input name="supplierName" defaultValue={a?.supplierName} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Correo del proveedor</label>
        <input
          name="supplierEmail"
          type="email"
          defaultValue={a?.supplierEmail}
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Identificador en la web (se genera del título si lo dejas vacío)</label>
        <input
          name="slug"
          defaultValue={a?.slug}
          className={inputCls}
          placeholder="cata-vinos-penedes"
        />
      </div>
    </div>
  );
}

export default async function ActivitiesPage() {
  const [activities, baseUrl] = await Promise.all([
    prisma.ownActivity.findMany({
      orderBy: [{ active: "desc" }, { title: "asc" }],
      include: { _count: { select: { bookings: true } } },
    }),
    getSetting("base_url"),
  ]);

  return (
    <>
      <PageHeader
        title="Actividades propias"
        subtitle="Lo que vendemos nosotros. A diferencia de las de GetYourGuide, la reserva se completa en la web y aterriza aquí."
      />

      <Panel title={`Catálogo propio (${activities.length})`} className="mb-4">
        {activities.length === 0 ? (
          <EmptyState>
            Todavía no hay ninguna. Crea la primera abajo y aparecerá en {baseUrl} junto a las de
            GetYourGuide, con su propio reservador.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <details
                key={a.id}
                className={`rounded-lg border border-line ${a.active ? "" : "opacity-60"}`}
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="font-semibold text-ink">{a.title}</span>
                  <Badge color={a.active ? "green" : "gray"}>
                    {a.active ? "a la venta" : "oculta"}
                  </Badge>
                  <span className="text-sm text-muted">
                    {a.city || "—"} · {euros(a.pricePerPerson)} por persona · margen{" "}
                    {pct(a.ntlMarginPct)}
                  </span>
                  <span className="ml-auto text-sm text-muted">
                    {diasTexto(a.weekdays)} · {a.slots.split("|").join(", ")} ·{" "}
                    {plural(a._count.bookings, "reserva", "reservas")}
                  </span>
                </summary>
                <div className="border-t border-line px-4 py-4">
                  <ActionForm action={updateActivityAction} submitLabel="Guardar cambios">
                    <input type="hidden" name="id" value={a.id} />
                    <CamposActividad a={a} />
                  </ActionForm>
                  <ActionForm
                    action={toggleActivityAction}
                    submitLabel={a.active ? "Quitar de la web" : "Volver a publicar"}
                    submitClassName={btnSecondary}
                    className="mt-3"
                  >
                    <input type="hidden" name="id" value={a.id} />
                  </ActionForm>
                </div>
              </details>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Nueva actividad propia">
        <ActionForm action={createActivityAction} submitLabel="Crear actividad" resetOnSuccess>
          <CamposActividad />
        </ActionForm>
        <p className="mt-3 text-xs text-muted">
          El precio que pones aquí es el que paga el cliente. Nuestro margen es lo que nos queda a
          nosotros; de ahí sale la comisión del establecimiento por cuyo QR haya entrado.
        </p>
      </Panel>
    </>
  );
}
