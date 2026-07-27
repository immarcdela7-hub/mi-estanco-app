import QRCode from "qrcode";

export const QR_NAVY = "#092B57";

/**
 * Convierte la ciudad del establecimiento en el identificador de zona que
 * entiende la web ("Lloret de Mar" -> "lloret-de-mar"). La web compara sin
 * acentos ni guiones, así que basta con dejarlo limpio y legible.
 */
export function citySlug(city: string): string {
  return (city ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * URL a la que apunta el QR de un cartel.
 *
 * Si se pasa la ciudad del establecimiento, se añade `zona=` para que la web
 * pueda recomendar lo que hay cerca ("Right here in Salou"). Los códigos sin
 * establecimiento asignado no llevan zona: se omite y la web sigue funcionando.
 */
export function buildTrackingUrl(baseUrl: string, code: string, city?: string): string {
  const url = new URL(baseUrl.trim());
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.searchParams.set("ref", code);
  url.searchParams.set("utm_source", "qr");
  url.searchParams.set("utm_medium", "offline");
  url.searchParams.set("utm_campaign", code);
  const zone = citySlug(city ?? "");
  if (zone) url.searchParams.set("zona", zone);
  return url.toString();
}

export async function qrPng(url: string, width = 640): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: "M",
    width,
    margin: 2,
    color: { dark: QR_NAVY, light: "#FFFFFF" },
  });
}
