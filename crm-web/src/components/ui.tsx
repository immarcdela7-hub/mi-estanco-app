import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {title && (
        <h2 className="mb-4 border-b border-line pb-3 text-[13px] font-bold uppercase tracking-[0.06em] text-slate-600">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-line bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
          {label}
        </div>
        <div className="text-[22px] font-extrabold leading-tight tracking-tight text-ink">
          {value}
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 border-b border-line pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const BADGE_STYLES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-slate-200 text-slate-600",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
};

export function Badge({
  color = "gray",
  children,
}: {
  color?: keyof typeof BADGE_STYLES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_STYLES[color]}`}
    >
      {children}
    </span>
  );
}

export function SaleStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: keyof typeof BADGE_STYLES; label: string }> = {
    PENDIENTE: { color: "amber", label: "Pendiente" },
    VALIDADA: { color: "blue", label: "Validada" },
    PAGADA: { color: "green", label: "Pagada" },
  };
  const s = map[status] ?? { color: "gray", label: status };
  return <Badge color={s.color}>{s.label}</Badge>;
}

export function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: keyof typeof BADGE_STYLES; label: string }> = {
    SOLICITADA: { color: "amber", label: "Solicitada" },
    CONFIRMADA: { color: "green", label: "Confirmada" },
    CANCELADA: { color: "red", label: "Cancelada" },
  };
  const s = map[status] ?? { color: "gray", label: status };
  return <Badge color={s.color}>{s.label}</Badge>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-slate-700">{children}</div>
  );
}

export function Table({
  headers,
  children,
  rightAlign = [],
}: {
  headers: string[];
  children: ReactNode;
  rightAlign?: number[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-slate-50 text-left text-[12px] uppercase tracking-wide text-slate-500">
            {headers.map((h, i) => (
              <th
                key={h + i}
                className={`px-3.5 py-2.5 font-semibold ${rightAlign.includes(i) ? "text-right" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-white">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  right = false,
  className = "",
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3.5 py-2.5 ${right ? "text-right tabular-nums" : ""} ${className}`}>
      {children}
    </td>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-blue-100";

export const labelCls = "mb-1 block text-[13px] font-semibold text-slate-700";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-blue hover:text-brand-blue-dark";

export const btnGreen =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-green-dark";

export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50";
