import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "./settings";

/**
 * Herramientas de la API pública: la que llama notaxlost.com desde el
 * navegador del cliente para enseñar las actividades propias y reservarlas.
 *
 * A diferencia del resto del CRM, aquí no hay sesión: cualquiera puede llamar.
 * Por eso todo lo que entra se valida y se limita por IP.
 */

/**
 * Orígenes con permiso para hacer POST. Salen de la URL base de los QR (que
 * ya apunta a la web) más lo que se añada en PUBLIC_WEB_ORIGINS, separado por
 * comas, para entornos de prueba.
 */
export async function allowedOrigins(): Promise<string[]> {
  const out = new Set<string>();
  try {
    const base = new URL(await getSetting("base_url"));
    out.add(base.origin);
    const host = base.hostname.replace(/^www\./, "");
    out.add(`${base.protocol}//${host}`);
    out.add(`${base.protocol}//www.${host}`);
  } catch {
    // Si la URL base está mal configurada seguimos con lo del entorno.
  }
  for (const extra of (process.env.PUBLIC_WEB_ORIGINS ?? "").split(",")) {
    const value = extra.trim();
    if (value) out.add(value.replace(/\/+$/, ""));
  }
  return [...out];
}

type CorsMode = "abierto" | "restringido";

/**
 * Cabeceras CORS. Los GET son datos públicos de catálogo y van abiertos; el
 * POST de reserva solo se acepta desde nuestra web.
 */
export async function corsHeaders(
  req: NextRequest,
  mode: CorsMode
): Promise<Record<string, string> | null> {
  const common = {
    "Access-Control-Allow-Methods": mode === "abierto" ? "GET, OPTIONS" : "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (mode === "abierto") return { ...common, "Access-Control-Allow-Origin": "*" };

  const origin = req.headers.get("origin");
  if (!origin) return common; // Petición sin navegador (curl, servidor): sin CORS que dar.
  const allowed = await allowedOrigins();
  if (!allowed.includes(origin)) return null;
  return { ...common, "Access-Control-Allow-Origin": origin };
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>
): NextResponse {
  return NextResponse.json(body, { status, headers });
}

/** IP del cliente detrás del proxy inverso. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "desconocida";
}

type Hit = { count: number; resetAt: number };
const buckets = new Map<string, Hit>();

/**
 * Límite por IP en ventanas fijas. En memoria: el CRM corre en un contenedor
 * único, así que basta y no añade dependencias. Si algún día se escala a
 * varias réplicas habrá que llevarlo a la base de datos o a nginx.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || hit.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return true;
  }
  hit.count += 1;
  return hit.count <= max;
}
