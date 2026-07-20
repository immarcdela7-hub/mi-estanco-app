"use client";

import { useEffect, useState } from "react";

type Toast = { id: string; message: string };

export function Toaster({ flash }: { flash: { m: string; n: number } | null }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!flash) return;
    const id = String(flash.n);
    if (sessionStorage.getItem("crm-toast-last") === id) return;
    sessionStorage.setItem("crm-toast-last", id);
    setToasts((t) => [...t, { id, message: flash.m }]);
    const timer = setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      7000
    );
    return () => clearTimeout(timer);
  }, [flash]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex w-[min(440px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg"
          role="status"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
