const euroFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export function euros(value: number | string | { toNumber(): number }): string {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : value.toNumber();
  return euroFmt.format(n);
}

export function pct(value: number | string | { toNumber(): number }): string {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : value.toNumber();
  return `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })}%`;
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export const SALE_STATUS_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  VALIDADA: "Validada",
  PAGADA: "Pagada",
};
