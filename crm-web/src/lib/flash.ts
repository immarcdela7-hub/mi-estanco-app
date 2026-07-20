import "server-only";
import { cookies } from "next/headers";

const COOKIE = "crm_flash";

/** Guarda un mensaje de éxito que el layout mostrará como toast tras el re-render. */
export async function setFlash(message: string) {
  const store = await cookies();
  store.set(COOKIE, JSON.stringify({ m: message, n: Date.now() }), {
    maxAge: 8,
    path: "/",
    sameSite: "lax",
  });
}

export async function readFlash(): Promise<{ m: string; n: number } | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Azúcar para las acciones: guarda el flash y devuelve el estado de éxito. */
export async function ok(message: string): Promise<{ success: string }> {
  await setFlash(message);
  return { success: message };
}
