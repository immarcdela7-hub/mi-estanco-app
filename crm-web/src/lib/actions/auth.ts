"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { attemptLogin, currentUser, hashPassword, checkPassword } from "@/lib/auth";
import { createSession, destroySession, getSession } from "@/lib/session";

export type FormState = { error?: string; success?: string };

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!username.trim() || !password) {
    return { error: "Usuario y contraseña son obligatorios." };
  }
  const result = await attemptLogin(username, password);
  if (!result.ok) return { error: result.error };

  const session = await getSession();
  redirect(session?.mustChange ? "/password" : session?.role === "ADMIN" ? "/admin" : "/portal");
}

export async function forcedPasswordChangeAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const new1 = String(formData.get("new1") ?? "");
  const new2 = String(formData.get("new2") ?? "");
  if (new1.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (new1 !== new2) return { error: "Las contraseñas no coinciden." };
  if (checkPassword(new1, user.passwordHash)) {
    return { error: "Elige una contraseña distinta a la actual." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(new1), mustChangePassword: false },
  });
  await createSession({
    uid: user.id,
    username: user.username,
    role: user.role,
    estId: user.establishmentId,
    mustChange: false,
  });
  redirect(user.role === "ADMIN" ? "/admin" : "/portal");
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const current = String(formData.get("current") ?? "");
  const new1 = String(formData.get("new1") ?? "");
  const new2 = String(formData.get("new2") ?? "");
  if (!checkPassword(current, user.passwordHash)) {
    return { error: "La contraseña actual no es correcta." };
  }
  if (new1.length < 8) return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  if (new1 !== new2) return { error: "Las contraseñas no coinciden." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(new1) },
  });
  return { success: "Contraseña actualizada." };
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
