import { randomInt } from "crypto";

/**
 * Motor de disponibilidad de las actividades propias.
 *
 * Es lo que sustituye al widget de GetYourGuide: con esto la web puede pintar
 * el calendario, las horas y las plazas libres sin salir de notaxlost.com.
 * Todo son funciones puras (reciben las reservas ya cargadas) para poder
 * probarlas sin base de datos.
 */

/** Las horas de las actividades son horas locales de Catalunya. */
export const TZ = "Europe/Madrid";

export type ActivitySchedule = {
  slots: string;
  weekdays: string;
  capacity: number;
  minPeople: number;
  leadHours: number;
  horizonDays: number;
};

export type BookedSeat = {
  bookingDate: Date;
  slot: string;
  people: number;
};

export type DayAvailability = {
  /** Fecha en formato YYYY-MM-DD. */
  date: string;
  slots: { time: string; free: number }[];
};

/** "10:00|12:30 | 17:00" -> ["10:00", "12:30", "17:00"], ordenadas y sin repetir. */
export function parseSlots(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of String(raw ?? "").split("|")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) continue;
    seen.add(`${String(h).padStart(2, "0")}:${m[2]}`);
  }
  return [...seen].sort();
}

/** "0,1,5" -> Set {0,1,5}. Vacío o inválido significa todos los días. */
export function parseWeekdays(raw: string): Set<number> {
  const out = new Set<number>();
  for (const part of String(raw ?? "").split(",")) {
    const n = parseInt(part.trim(), 10);
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return out.size ? out : new Set([0, 1, 2, 3, 4, 5, 6]);
}

/** Fecha en YYYY-MM-DD leyendo el día en UTC (así se guardan las @db.Date). */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Qué día es hoy en Catalunya, que no siempre coincide con el día UTC. */
export function localDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Diferencia entre la hora local de Catalunya y UTC en ese instante. */
function tzOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const p: Record<string, number> = {};
  for (const part of parts) if (part.type !== "literal") p[part.type] = parseInt(part.value, 10);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - at.getTime();
}

/**
 * Instante real en el que empieza una actividad de un día y hora locales.
 * Se calcula con la zona horaria de verdad, no con un desfase fijo: si no,
 * en el cambio de hora las reservas se abrirían o cerrarían una hora tarde.
 */
export function slotStart(day: string, time: string): Date {
  const guess = new Date(`${day}T${time}:00.000Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess));
}

function addDays(day: string, n: number): string {
  return isoDay(new Date(new Date(`${day}T00:00:00.000Z`).getTime() + n * 86400000));
}

/**
 * Plazas ya ocupadas por día y hora. Solo cuentan las reservas vivas: una
 * cancelada libera su sitio.
 */
export function seatsTaken(bookings: BookedSeat[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of bookings) {
    const key = `${isoDay(b.bookingDate)} ${b.slot}`;
    map.set(key, (map.get(key) ?? 0) + b.people);
  }
  return map;
}

/**
 * Calendario de los próximos días con las plazas libres de cada hora.
 *
 * Se descartan los días sin actividad, las horas que ya han pasado y las que
 * no llegan a la antelación mínima. Los días sin ninguna hora libre no salen,
 * para que la web solo enseñe fechas en las que de verdad se puede reservar.
 */
export function availability(
  activity: ActivitySchedule,
  bookings: BookedSeat[],
  now: Date,
  days?: number
): DayAvailability[] {
  const slots = parseSlots(activity.slots);
  if (!slots.length) return [];

  const weekdays = parseWeekdays(activity.weekdays);
  const taken = seatsTaken(bookings);
  const horizon = Math.max(1, Math.min(days ?? activity.horizonDays, activity.horizonDays));
  const earliest = now.getTime() + Math.max(0, activity.leadHours) * 3600000;

  const out: DayAvailability[] = [];
  let day = localDay(now);
  for (let i = 0; i < horizon; i++, day = addDays(day, 1)) {
    const dow = new Date(`${day}T12:00:00.000Z`).getUTCDay();
    if (!weekdays.has(dow)) continue;

    const free = slots
      .filter((time) => slotStart(day, time).getTime() >= earliest)
      .map((time) => ({
        time,
        free: Math.max(0, activity.capacity - (taken.get(`${day} ${time}`) ?? 0)),
      }))
      .filter((s) => s.free >= activity.minPeople);

    if (free.length) out.push({ date: day, slots: free });
  }
  return out;
}

/**
 * Comprueba que una reserva concreta se puede aceptar. Devuelve `null` si
 * todo bien, o el motivo del rechazo listo para enseñar al cliente.
 */
export function validateRequest(
  activity: ActivitySchedule,
  bookings: BookedSeat[],
  now: Date,
  date: string,
  time: string,
  people: number
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "La fecha no es válida.";
  if (!parseSlots(activity.slots).includes(time)) return "Esa hora no existe para esta actividad.";
  if (!Number.isInteger(people) || people < 1) return "Indica cuántas personas sois.";
  if (people < activity.minPeople) {
    return `Esta actividad sale a partir de ${activity.minPeople} personas.`;
  }

  const day = availability(activity, bookings, now).find((d) => d.date === date);
  const slot = day?.slots.find((s) => s.time === time);
  if (!slot) return "Ese día y hora ya no están disponibles.";
  if (slot.free < people) {
    return slot.free === 1
      ? "Solo queda 1 plaza en esa hora."
      : `Solo quedan ${slot.free} plazas en esa hora.`;
  }
  return null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Localizador que el cliente ve en pantalla y en el correo. */
export function bookingReference(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `NTL-${s}`;
}

/** Importe total y reparto: lo que gana NoTaxLost y lo que le toca al local. */
export function money(
  pricePerPerson: number,
  people: number,
  ntlMarginPct: number,
  establishmentPct: number
): { total: number; ntlMargin: number; partnerShare: number } {
  const total = Math.round(pricePerPerson * people * 100) / 100;
  const ntlMargin = Math.round(total * ntlMarginPct) / 100;
  const partnerShare = Math.round(ntlMargin * establishmentPct) / 100;
  return { total, ntlMargin, partnerShare };
}
