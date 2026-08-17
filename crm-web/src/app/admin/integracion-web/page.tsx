import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

// El fragmento ya NO se pega tal cual: la atribucion vive en dos ficheros
// (ntl-consent.js y ntl-attrib.js) porque necesita consentimiento previo. Aqui
// solo se enseña como incluirlos y en que orden, que es lo que se equivoca.
const SNIPPET = `<!-- Al final de la pagina, justo antes de </body>.
     El orden importa: el consentimiento tiene que cargarse ANTES que la
     atribucion, o en la primera carga no encontrara el permiso. -->
<script src="/ntl-consent.js?v=1"></script>
<script src="/ntl-attrib.js?v=3"></script>`;

export default async function WebIntegrationPage() {
  const baseUrl = await getSetting("base_url");

  return (
    <>
      <PageHeader
        title="Integración con la web"
        subtitle="Cómo conectar los QR con los enlaces de GetYourGuide para no perder la atribución."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Panel title="La cadena de atribución">
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>
                El cliente escanea el QR del local →{" "}
                <code className="text-xs">{baseUrl}?ref=EST-XXXXX</code>.
              </li>
              <li>
                La web añade <b>cmp=EST-XXXXX</b> a todos los enlaces hacia GetYourGuide.
                Esa visita se atribuye <b>siempre</b>, acepte o no las cookies: el código va
                en la propia dirección. Si acepta, además se guarda 30 días en una cookie
                para que el local siga cobrando aunque vuelva otro día sin el QR.
              </li>
              <li>GYG registra la reserva con vuestra cuenta de partner y con esa campaña.</li>
              <li>
                El informe de transacciones del Partner Portal trae la columna de campaña: es
                el código del establecimiento.
              </li>
              <li>
                Ese informe se importa en <b>Ventas → Importar CSV</b> usando la campaña como{" "}
                <code className="text-xs">codigo_establecimiento</code>.
              </li>
            </ol>
          </Panel>

          <Panel title="Verificación rápida">
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>
                Abre la web con <code className="text-xs">?ref=PRUEBA1</code> en una ventana de
                incógnito.
              </li>
              <li>
                Comprueba que los enlaces de GYG llevan <code className="text-xs">cmp=PRUEBA1</code>.
              </li>
              <li>
                Vuelve sin el <code className="text-xs">?ref=</code>: deben seguir llevándolo
                (cookie).
              </li>
              <li>
                Haz una reserva de prueba y busca la campaña <code className="text-xs">PRUEBA1</code>{" "}
                en el Partner Portal.
              </li>
            </ol>
          </Panel>
        </div>

        <Panel title="Fragmento para pegar en la web">
          <p className="mb-3 text-sm text-muted">
            Va justo antes de cerrar <code className="text-xs">&lt;/body&gt;</code> en la
            página de tickets. En nuestra web (HTML estático) ya está instalado: se carga
            desde <code className="text-xs">/ntl-attrib.js</code>. Guarda este fragmento como
            referencia por si hay que reinstalarlo o añadirlo a otra página.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
            {SNIPPET}
          </pre>
          <div className="mt-3">
            <EmptyState>
              Si el cliente escanea con un móvil pero compra desde otro dispositivo, la campaña
              se pierde (límite del modelo de afiliación). Si los enlaces de GYG se generan con
              JavaScript o usáis widgets incrustados, el fragmento necesita adaptarse.
            </EmptyState>
          </div>
        </Panel>
      </div>
    </>
  );
}
