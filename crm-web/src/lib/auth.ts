import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { createSession, getSession, type SessionData } from "./session";

const MAX_FAILS = 5;
// Ventanas de bloqueo crecientes (minutos) según el nº de fallos por encima del umbral.
const LOCK_MINUTES = [1, 2, 5, 15, 30];

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function checkPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

/**
 * Primer arranque: si no existe ningún usuario, crea el admin.
 * La contraseña sale de INITIAL_ADMIN_PASSWORD; si no está definida se genera
 * una aleatoria y se imprime en los logs del contenedor (solo visibles para el
 * operador). Nunca se usa una contraseña por defecto conocida.
 */
async function bootstrapAdmin() {
  const count = await prisma.user.count();
  if (count > 0) return;

  const provided = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  const initial = provided && provided.length >= 8 ? provided : randomBytes(12).toString("base64url");

  await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: hashPassword(initial),
      role: "ADMIN",
      mustChangePassword: true,
    },
  });

  if (!provided) {
    console.log(
      "\n=======================================================\n" +
        "  CRM: usuario admin creado.\n" +
        `  Usuario: admin\n  Contraseña inicial: ${initial}\n` +
        "  (Se te pedirá cambiarla al entrar. Guarda estos logs.)\n" +
        "=======================================================\n"
    );
  }
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function attemptLogin(username: string, password: string): Promise<LoginResult> {
  await bootstrapAdmin();

  const user = await prisma.user.findUnique({
    where: { username: username.trim() },
  });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const secs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    return { ok: false, error: `Demasiados intentos fallidos. Espera ${secs} segundos.` };
  }

  // Coste constante: verificamos un hash aunque el usuario no exista
  const hash = user?.passwordHash ?? bcrypt.hashSync("dummy-password", 10);
  const valid = checkPassword(password, hash) && !!user;

  if (!valid) {
    if (user) {
      // El contador NO se reinicia al bloquear: cada bloqueo posterior dura más.
      const fails = user.failedAttempts + 1;
      let lockedUntil: Date | null = null;
      if (fails >= MAX_FAILS) {
        const over = fails - MAX_FAILS;
        const minutes = LOCK_MINUTES[Math.min(over, LOCK_MINUTES.length - 1)];
        lockedUntil = new Date(Date.now() + minutes * 60_000);
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: fails, lockedUntil },
      });
      if (lockedUntil) {
        const secs = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
        return { ok: false, error: `Demasiados intentos fallidos. Espera ${secs} segundos.` };
      }
    }
    return { ok: false, error: "Usuario o contraseña incorrectos." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  await createSession({
    uid: user.id,
    username: user.username,
    role: user.role,
    estId: user.establishmentId,
    mustChange: user.mustChangePassword,
  });
  return { ok: true };
}

/** Sesión válida y revalidada contra la base de datos (el usuario puede haber sido borrado). */
export async function currentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    include: { establishment: true },
  });
  if (!user) return null;
  return user;
}

export async function requireAdmin() {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  return user;
}

export async function requirePartner() {
  const user = await currentUser();
  if (!user || user.role !== "PARTNER") redirect("/login");
  if (!user.establishment) redirect("/login");
  return { user, establishment: user.establishment };
}

export type { SessionData };
