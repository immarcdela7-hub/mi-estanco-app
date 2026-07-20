"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { IconClose, IconLogout, IconMenu } from "./icons";

export type NavItem = { href: string; label: string; icon: ReactNode };

export function Sidebar({
  brand,
  roleLabel,
  username,
  userSub,
  items,
}: {
  brand: string;
  roleLabel: string;
  username: string;
  userSub: string;
  items: NavItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <>
      <div className="flex items-center gap-2.5">
        <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 shadow-lg">
          <Image src="/logo-ntl.png" alt={brand} width={72} height={23} priority />
          <span className="text-sm font-extrabold text-brand-blue">CRM</span>
        </div>
      </div>
      <div className="mb-4 mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {roleLabel}
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active =
            item.href === pathname ||
            (item.href !== "/admin" && item.href !== "/portal" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_var(--color-brand-green-accent)]"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className={active ? "text-brand-green-accent" : "text-slate-400"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-green text-sm font-bold text-white">
            {username.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{username}</div>
            <div className="truncate text-xs text-slate-400">{userSub}</div>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/25 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-brand-green-accent hover:text-white"
          >
            <IconLogout size={16} />
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Barra superior móvil */}
      <div className="sticky top-[3px] z-40 flex items-center justify-between bg-navy-900 px-4 py-3 lg:hidden">
        <div className="inline-flex items-center gap-2 rounded-lg bg-white px-2 py-1">
          <Image src="/logo-ntl.png" alt={brand} width={60} height={19} />
          <span className="text-xs font-extrabold text-brand-blue">CRM</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-white hover:bg-white/10"
          aria-label="Abrir menú"
        >
          <IconMenu size={22} />
        </button>
      </div>

      {/* Cajón móvil */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-gradient-to-b from-navy-800 via-navy-900 to-navy-950 p-4">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
              aria-label="Cerrar menú"
            >
              <IconClose size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      {/* Barra lateral escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-gradient-to-b from-navy-800 via-navy-900 to-navy-950 p-4 pt-6 lg:flex">
        {nav}
      </aside>
    </>
  );
}
