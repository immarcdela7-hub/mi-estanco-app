import QRCode from "qrcode";

export const QR_NAVY = "#092B57";

export function buildTrackingUrl(baseUrl: string, code: string): string {
  const url = new URL(baseUrl.trim());
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.searchParams.set("ref", code);
  url.searchParams.set("utm_source", "qr");
  url.searchParams.set("utm_medium", "offline");
  url.searchParams.set("utm_campaign", code);
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
