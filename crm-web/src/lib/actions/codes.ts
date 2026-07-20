"use server";

import { ok } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { generateUniqueCode } from "@/lib/codes";
import { plural } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { FormState } from "./auth";

export async function generateBatchAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const n = Math.min(500, Math.max(1, parseInt(String(formData.get("n") ?? "25"), 10) || 25));
  const batch = String(formData.get("batch") ?? "").trim();

  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const code = await generateUniqueCode("NTL");
    await prisma.qrCode.create({ data: { code, batch } });
    codes.push(code);
  }

  revalidatePath("/admin/codigos-qr");
  return ok(
    `${plural(codes.length, "código generado", "códigos generados")} (${codes[0]} … ${codes[codes.length - 1]}). Ya puedes imprimir los carteles.`
  );
}

export async function assignCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const code = String(formData.get("code") ?? "");
  const establishmentId = parseInt(String(formData.get("establishmentId")), 10);

  const res = await prisma.qrCode.updateMany({
    where: { code, establishmentId: null },
    data: { establishmentId, assignedAt: new Date() },
  });
  if (res.count === 0) return { error: "Ese código ya no está libre." };

  const est = await prisma.establishment.findUnique({ where: { id: establishmentId } });
  revalidatePath("/admin/codigos-qr");
  return ok(
    `Código ${code} vinculado a ${est?.name}. Todas las compras de ese QR ya cuentan para ese local.`
  );
}

export async function unassignCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const code = String(formData.get("code") ?? "");
  const isPrimary = await prisma.establishment.findUnique({ where: { code } });
  if (isPrimary) {
    return { error: "Ese código es el principal de un establecimiento y no se puede liberar." };
  }
  const res = await prisma.qrCode.updateMany({
    where: { code, establishmentId: { not: null } },
    data: { establishmentId: null, assignedAt: null },
  });
  if (res.count === 0) return { error: "Ese código no estaba asignado." };

  revalidatePath("/admin/codigos-qr");
  return ok(`Código ${code} liberado: vuelve al pool.`);
}
