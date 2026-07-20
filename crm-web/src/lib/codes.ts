import "server-only";
import { randomInt } from "crypto";
import { prisma } from "./prisma";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomCode(prefix: string): string {
  let suffix = "";
  for (let i = 0; i < 5; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${suffix}`;
}

/** Genera un código único que no exista ni en establecimientos ni en el pool. */
export async function generateUniqueCode(prefix: "EST" | "NTL"): Promise<string> {
  for (let tries = 0; tries < 20; tries++) {
    const code = randomCode(prefix);
    const [est, qr] = await Promise.all([
      prisma.establishment.findUnique({ where: { code } }),
      prisma.qrCode.findUnique({ where: { code } }),
    ]);
    if (!est && !qr) return code;
  }
  throw new Error("No se pudo generar un código único");
}
