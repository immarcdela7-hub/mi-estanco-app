import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { CartelesPanel } from "@/components/CartelesPanel";
import { requirePartner } from "@/lib/auth";
import { pct } from "@/lib/format";
import { buildTrackingUrl } from "@/lib/qr";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PartnerQrPage() {
  const { establishment } = await requirePartner();
  const baseUrl = await getSetting("base_url");
  const url = buildTrackingUrl(baseUrl, establishment.code, establishment.city);

  return (
    <>
      <PageHeader
        title="Mi código QR"
        subtitle="Imprímelo y colócalo donde tus clientes puedan escanearlo."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Tus carteles">
          <CartelesPanel code={establishment.code} qrSize={210} />
        </Panel>

        <Panel title="Cómo usarlo">
          <p className="text-sm text-slate-700">
            <b>Tu código único:</b>{" "}
            <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[13px]">
              {establishment.code}
            </code>
          </p>
          <p className="mb-1 mt-3 text-sm font-semibold text-slate-700">El QR lleva a:</p>
          <code className="block overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
            {url}
          </code>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
            <li>Cada compra hecha desde este enlace queda atribuida a tu local.</li>
            <li>
              Recibes el <b>{pct(establishment.commissionPct)}</b> de nuestra comisión de
              GetYourGuide.
            </li>
            <li>Puedes imprimirlo en cartelería, pegatinas, expositores o la carta.</li>
          </ul>
          <div className="mt-4">
            <EmptyState>
              Consejo: colócalo cerca de la caja o en las mesas, con un mensaje tipo «Compra
              aquí tus entradas y apoya a este local».
            </EmptyState>
          </div>
        </Panel>
      </div>
    </>
  );
}
