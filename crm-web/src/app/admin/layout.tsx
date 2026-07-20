import { Sidebar } from "@/components/Sidebar";
import {
  IconDashboard,
  IconGlobe,
  IconQr,
  IconReceipt,
  IconSettings,
  IconStore,
  IconWallet,
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
    { href: "/admin/codigos-qr", label: "Códigos QR", icon: <IconQr /> },
    { href: "/admin/ventas", label: "Ventas", icon: <IconReceipt /> },
    { href: "/admin/liquidaciones", label: "Liquidaciones", icon: <IconWallet /> },
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
