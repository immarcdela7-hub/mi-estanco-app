// Sin imports de Node/Next: se usa tanto en el runtime del servidor como en el
// proxy (edge). Falla de forma explícita si AUTH_SECRET no es suficientemente
// fuerte, en lugar de firmar sesiones con una clave vacía o débil.

let cached: Uint8Array | null = null;

export function authSecretKey(): Uint8Array {
  if (cached) return cached;
  const value = process.env.AUTH_SECRET ?? "";
  if (value.length < 32) {
    throw new Error(
      "AUTH_SECRET no está configurado o es demasiado corto (mínimo 32 caracteres). " +
        "Genera uno con: openssl rand -base64 48"
    );
  }
  cached = new TextEncoder().encode(value);
  return cached;
}
