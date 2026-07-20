import "server-only";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { createSession, getSession, type SessionData } from "./session";

const MAX_FAILS = 5;
const LOCK_MS = 60_000;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function checkPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

/** Primer arranque: si no existe ningún usuario, crea el admin por defecto. */
async function bootstrapAdmin() {
  const count = await prisma.user.count();
  if (count === 0) {
    await prisma.user.create({
      data: {
        username: "admin",
        passwordHash: hashPassword("admin1234"),
        role: "ADMIN",
        mustChangePassword: true,
      },
    });
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
      const fails = user.failedAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data:
          fails >= MAX_FAILS
            ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
            : { failedAttempts: fails },
      });
      if (fails >= MAX_FAILS) {
        return { ok: false, error: "Demasiados intentos fallidos. Espera 60 segundos." };
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
