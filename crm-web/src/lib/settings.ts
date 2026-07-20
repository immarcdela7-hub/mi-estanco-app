import { prisma } from "./prisma";

export const SETTING_DEFAULTS: Record<string, string> = {
  brand_name: "NoTaxLost",
  base_url: "https://notaxlost.com/tickets",
  default_commission_pct: "30",
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
