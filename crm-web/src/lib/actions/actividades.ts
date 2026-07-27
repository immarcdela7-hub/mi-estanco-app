"use server";

import { ok } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSlots } from "@/lib/booking";
import { citySlug } from "@/lib/qr";
import type { FormState } from "./auth";

const REVALIDATE = ["/admin", "/admin/actividades", "/admin/reservas"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

type Campos = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  province: string;
  city: string;
  category: string;
  imageUrl: string;
  pricePerPerson: number;
  ntlMarginPct: number;
  durationMin: number;
  minPeople: number;
  capacity: number;
  slots: string;
  weekdays: string;
  leadHours: number;
  horizonDays: number;
  meetingPoint: string;
  supplierName: string;
  supplierEmail: string;
};

function leer(formData: FormData): Campos | string {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return "El título es obligatorio.";

  const slug = citySlug(String(formData.get("slug") ?? "").trim() || title);
  if (!slug) return "El identificador no puede quedar vacío.";

  const price = parseFloat(String(formData.get("pricePerPerson") ?? "0"));
  if (Number.isNaN(price) || price <= 0) return "El precio por persona debe ser mayor que 0.";

  const margen = parseFloat(String(formData.get("ntlMarginPct") ?? "20"));
  if (Number.isNaN(margen) || margen < 0 || margen > 100) {
    return "El margen debe estar entre 0 y 100.";
  }

  const slots = parseSlots(String(formData.get("slots") ?? ""));
  if (!slots.length) return "Pon al menos una hora de inicio, con formato 10:00.";

  // Los días llegan como una casilla por día, no como una lista.
  const weekdays = formData
    .getAll("weekdays")
    .flatMap((d) => String(d).split(","))
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!weekdays.length) return "Marca al menos un día de la semana.";

  const capacity = parseInt(String(formData.get("capacity") ?? "10"), 10);
  const minPeople = parseInt(String(formData.get("minPeople") ?? "1"), 10);
  if (!capacity || capacity < 1) return "El cupo por hora debe ser al menos 1.";
  if (!minPeople || minPeople < 1) return "El mínimo de personas debe ser al menos 1.";
  if (minPeople > capacity) return "El mínimo de personas no puede superar el cupo.";

  return {
    slug,
    title,
    summary: String(formData.get("summary") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    province: citySlug(String(formData.get("province") ?? "").trim()),
    city: String(formData.get("city") ?? "").trim(),
    category: String(formData.get("category") ?? "culture").trim() || "culture",
    imageUrl: String(formData.get("imageUrl") ?? "").trim(),
    pricePerPerson: price,
    ntlMarginPct: margen,
    durationMin: parseInt(String(formData.get("durationMin") ?? "90"), 10) || 90,
    minPeople,
    capacity,
    slots: slots.join("|"),
    weekdays: [...new Set(weekdays)].sort().join(","),
    leadHours: Math.max(0, parseInt(String(formData.get("leadHours") ?? "24"), 10) || 0),
    horizonDays: Math.max(1, parseInt(String(formData.get("horizonDays") ?? "60"), 10) || 60),
    meetingPoint: String(formData.get("meetingPoint") ?? "").trim(),
    supplierName: String(formData.get("supplierName") ?? "").trim(),
    supplierEmail: String(formData.get("supplierEmail") ?? "").trim(),
  };
}

export async function createActivityAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const datos = leer(formData);
  if (typeof datos === "string") return { error: datos };

  if (await prisma.ownActivity.findUnique({ where: { slug: datos.slug } })) {
    return { error: `Ya hay una actividad con el identificador ${datos.slug}.` };
  }

  await prisma.ownActivity.create({ data: datos });
  revalidateAll();
  return ok(`Actividad ${datos.title} creada. Ya se puede reservar en la web.`);
}

export async function updateActivityAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const id = parseInt(String(formData.get("id")), 10);
  const datos = leer(formData);
  if (typeof datos === "string") return { error: datos };

  const otra = await prisma.ownActivity.findUnique({ where: { slug: datos.slug } });
  if (otra && otra.id !== id) {
    return { error: `El identificador ${datos.slug} ya lo usa otra actividad.` };
  }

  await prisma.ownActivity.update({ where: { id }, data: datos });
  revalidateAll();
  return ok(`Actividad ${datos.title} actualizada.`);
}

export async function toggleActivityAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const id = parseInt(String(formData.get("id")), 10);
  const activity = await prisma.ownActivity.findUnique({ where: { id } });
  if (!activity) return { error: "La actividad no existe." };

  await prisma.ownActivity.update({ where: { id }, data: { active: !activity.active } });
  revalidateAll();
  return ok(
    activity.active
      ? `${activity.title} deja de verse en la web. Las reservas ya hechas siguen en pie.`
      : `${activity.title} vuelve a estar a la venta.`
  );
}
