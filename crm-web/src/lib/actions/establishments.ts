"use server";

import { ok } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { generateUniqueCode } from "@/lib/codes";
import { prisma } from "@/lib/prisma";
import type { FormState } from "./auth";

export async function createEstablishmentAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre es obligatorio." };

  const pct = parseFloat(String(formData.get("commissionPct") ?? "30"));
  if (Number.isNaN(pct) || pct < 0 || pct > 100) {
    return { error: "El % de comisión debe estar entre 0 y 100." };
  }

  const existingCode = String(formData.get("existingCode") ?? "");
  let code: string;
  if (existingCode && existingCode !== "__new__") {
    const qr = await prisma.qrCode.findUnique({ where: { code: existingCode } });
    if (!qr) return { error: `El código ${existingCode} no existe en el pool.` };
    if (qr.establishmentId) return { error: `El código ${existingCode} ya está asignado.` };
    code = existingCode;
  } else {
    code = await generateUniqueCode("EST");
  }

  const est = await prisma.establishment.create({
    data: {
      name,
      code,
      contactName: String(formData.get("contactName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      commissionPct: pct,
      notes: String(formData.get("notes") ?? "").trim(),
    },
  });
  await prisma.qrCode.upsert({
    where: { code },
    create: { code, establishmentId: est.id, batch: "auto", assignedAt: new Date() },
    update: { establishmentId: est.id, assignedAt: new Date() },
  });

  revalidatePath("/admin/establecimientos");
  return ok(`Establecimiento ${name} creado con el código ${code}.`);
}

export async function updateEstablishmentAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const id = parseInt(String(formData.get("id")), 10);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre es obligatorio." };
  const pct = parseFloat(String(formData.get("commissionPct") ?? "30"));
  if (Number.isNaN(pct) || pct < 0 || pct > 100) {
    return { error: "El % de comisión debe estar entre 0 y 100." };
  }

  await prisma.establishment.update({
    where: { id },
    data: {
      name,
      contactName: String(formData.get("contactName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      commissionPct: pct,
      status: String(formData.get("status")) === "INACTIVO" ? "INACTIVO" : "ACTIVO",
      notes: String(formData.get("notes") ?? "").trim(),
    },
  });

  revalidatePath("/admin/establecimientos");
  revalidatePath(`/admin/establecimientos/${id}`);
  return ok("Cambios guardados.");
}

export async function createPartnerAccessAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const establishmentId = parseInt(String(formData.get("establishmentId")), 10);
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Usuario y contraseña son obligatorios." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (await prisma.user.findUnique({ where: { username } })) {
    return { error: "Ese nombre de usuario ya existe." };
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
      role: "PARTNER",
      establishmentId,
    },
  });
  revalidatePath(`/admin/establecimientos/${establishmentId}`);
  return ok(`Acceso creado. El establecimiento puede entrar con el usuario ${username}.`);
}

export async function deletePartnerAccessAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = parseInt(String(formData.get("userId")), 10);
  await prisma.user.deleteMany({ where: { id: userId, role: "PARTNER" } });
  revalidatePath("/admin/establecimientos");
}
