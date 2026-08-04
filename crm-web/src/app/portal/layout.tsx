import { Sidebar } from "@/components/Sidebar";
import {
  IconDashboard,
  IconQr,
  IconReceipt,
  IconWallet,
  IconArchive,
} from "@/components/icons";
import { requirePartner } from "@/lib/auth";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, establishment } = await requirePartner();
  const brand = await getSetting("brand_name");

  const items = [
    { href: "/portal", label: "Mi panel", icon: <IconDashboard /> },
    { href: "/portal/ventas", label: "Mis ventas", icon: <IconReceipt /> },
    { href: "/portal/liquidaciones", label: "Mis liquidaciones", icon: <IconWallet /> },
    { href: "/portal/facturas", label: "Mis facturas", icon: <IconArchive /> },
    { href: "/portal/qr", label: "Mi código QR", icon: <IconQr /> },
  ];

  return (
    <div className="min-h-screen">
      <Sidebar
        brand={brand}
        roleLabel="Portal del establecimiento"
        username={user.username}
        userSub={establishment.name}
        items={items}
      />
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
