/* eslint-disable @next/next/no-img-element */
import { FORMATOS } from "@/lib/flyer";
import { btnGreen, btnSecondary } from "./ui";

/**
 * Descarga de carteles de un establecimiento, en todos los formatos.
 *
 * Lo comparten el panel de administración y el portal del local: los dos
 * imprimen lo mismo, y así un formato nuevo aparece en ambos sitios con solo
 * añadirlo a FORMATOS.
 */
export function CartelesPanel({
  code,
  qrSize = 190,
  children,
}: {
  code: string;
  qrSize?: number;
  children?: React.ReactNode;
}) {
  const formatos = Object.values(FORMATOS);

  return (
    <div className="flex flex-col items-center gap-4">
      <img
        src={`/api/qr/${code}`}
        alt={`QR ${code}`}
        width={qrSize}
        height={qrSize}
        className="rounded-lg border border-line"
      />

      <div className="w-full space-y-3">
        {formatos.map((f) => (
          <div key={f.id} className="rounded-lg border border-line p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-ink">{f.nombre}</span>
              <span className="text-xs text-muted">{f.medidas}</span>
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{f.uso}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <a
                href={`/api/descargas/cartel/${code}?formato=${f.id}`}
                className={`${btnGreen} px-3 py-1.5 text-[13px]`}
              >
                Descargar PDF
              </a>
              {f.copias
                .filter((n) => n > 1)
                .map((n) => (
                  <a
                    key={n}
                    href={`/api/descargas/cartel/${code}?formato=${f.id}&copias=${n}`}
                    className="text-[13px] font-semibold text-brand-blue-dark hover:underline"
                  >
                    {n} copias
                  </a>
                ))}
            </div>
          </div>
        ))}
      </div>

      <a href={`/api/qr/${code}?download=1`} className={`${btnSecondary} w-full`}>
        Solo el QR (PNG)
      </a>

      {children}
    </div>
  );
}
