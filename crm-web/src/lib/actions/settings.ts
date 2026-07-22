"use server";

import { ok } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import type { FormState } from "./auth";

export async function updateSettingsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const brand = String(formData.get("brand_name") ?? "").trim() || "NoTaxLost";
  const baseUrl = String(formData.get("base_url") ?? "").trim() || "https://notaxlost.com/tickets";
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: "La URL debe empezar por http:// o https://" };
    }
  } catch {
    return { error: "La URL de la web no es válida." };
  }
  const pctRaw = parseFloat(String(formData.get("default_commission_pct") ?? "30"));
  if (Number.isNaN(pctRaw) || pctRaw < 0 || pctRaw > 100) {
    return { error: "El % por defecto debe estar entre 0 y 100." };
  }

  await setSetting("brand_name", brand);
  await setSetting("base_url", baseUrl);
  await setSetting("default_commission_pct", String(pctRaw));

  revalidatePath("/", "layout");
  return ok("Ajustes guardados.");
}
