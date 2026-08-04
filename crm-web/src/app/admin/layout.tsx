import { Sidebar } from "@/components/Sidebar";
import {
  IconCalendar,
  IconCompass,
  IconDashboard,
  IconGlobe,
  IconReceipt,
  IconSettings,
  IconStore,
  IconWallet,
  IconArchive,
} from "@/components/icons";
import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const brand = await getSetting("brand_name");

  const items = [
    { href: "/admin", label: "Panel", icon: <IconDashboard /> },
    { href: "/admin/establecimientos", label: "Establecimientos", icon: <IconStore /> },
    // El pool de QR preimpresos ya no se usa: cada QR se imprime al crear el
    // local, para que lleve grabada su ciudad. La página sigue accesible en
    // /admin/codigos-qr por si hiciera falta, pero fuera del menú.
    { href: "/admin/actividades", label: "Actividades propias", icon: <IconCompass /> },
    { href: "/admin/reservas", label: "Reservas", icon: <IconCalendar /> },
    { href: "/admin/ventas", label: "Ventas", icon: <IconReceipt /> },
    { href: "/admin/liquidaciones", label: "Liquidaciones", icon: <IconWallet /> },
    { href: "/admin/facturas", label: "Facturas", icon: <IconArchive /> },
    { href: "/admin/integracion-web", label: "Integración web", icon: <IconGlobe /> },
    { href: "/admin/ajustes", label: "Ajustes", icon: <IconSettings /> },
  ];

  return (
    <div className="min-h-screen">
      <Sidebar
        brand={brand}
        roleLabel="Panel de administración"
        username={user.username}
        userSub="Administrador"
        items={items}
      />
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
