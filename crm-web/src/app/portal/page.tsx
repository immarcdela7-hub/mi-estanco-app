import { PageHeader } from "@/components/ui";
import { requirePartner } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PortalDashboard() {
  const { establishment } = await requirePartner();
  return (
    <PageHeader
      title={`Hola, ${establishment.name}`}
      subtitle="Resumen de las ventas generadas con tu código QR."
    />
  );
}
