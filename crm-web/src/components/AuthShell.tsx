import Image from "next/image";
import type { ReactNode } from "react";

export function AuthShell({
  brand,
  children,
}: {
  brand: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto inline-block rounded-2xl border border-line bg-white px-6 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
            <Image src="/logo-ntl.png" alt={brand} width={150} height={47} priority />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">
            {brand} <span className="text-brand-blue">CRM</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Ventas con QR en establecimientos ·{" "}
            <span className="font-semibold text-brand-green">partner de GetYourGuide</span>
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
