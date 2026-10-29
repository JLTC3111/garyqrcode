import QRCode from "../vendor/qr/encoder.mjs";

export const DEFAULT_QR_DESTINATION = "https://gary-customer-connect.lsd99999999.chatgpt.site/customer";
export const DEFAULT_QR_IMAGE = "/qr/customer-connect.svg";
export const QR_ID = "customer-connect";
export const MAX_QR_UPLOAD = 1024 * 1024;
export type PublicQr = { destination: string; imageUrl: string; version: string; mode: string; updatedAt: string | null };

export function normalizeQrDestination(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error("Enter a valid website address of up to 500 characters.");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a complete website address starting with https://."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use an HTTPS address without embedded login details.");
  const normalized = url.href;
  if (normalized.length > 500) throw new Error("Enter a valid website address of up to 500 characters.");
  return normalized;
}

export function qrSvg(destination: string): string {
  const normalized = normalizeQrDestination(destination);
  const qr = new QRCode(-1, 2); // High error correction, with an untouched four-module quiet zone.
  qr.addData(normalized);
  qr.make();
  const modules = qr.getModuleCount();
  const size = modules + 8;
  const path: string[] = [];
  for (let y = 0; y < modules; y++) for (let x = 0; x < modules; x++) if (qr.isDark(y, x)) path.push(`M${x + 4},${y + 4}h1v1h-1z`);
  const pixels = size * 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels + 62}" viewBox="0 0 ${pixels} ${pixels + 62}"><title>Gary Customer Connect QR</title><rect width="${pixels}" height="${pixels + 62}" rx="18" fill="#ffffff"/><svg width="${pixels}" height="${pixels}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#27332b" d="${path.join("")}"/></svg><path fill="#daf387" d="M0 ${pixels}h${pixels}v44q0 18-18 18H18Q0 ${pixels + 62} 0 ${pixels + 44}z"/><text x="${pixels / 2}" y="${pixels + 40}" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#27332b" letter-spacing="2">gary. / CONNECT</text></svg>`;
}

export function validateQrPng(bytes: Uint8Array): void {
  if (bytes.length < 33 || bytes.length > MAX_QR_UPLOAD || ![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) throw new Error("Upload a PNG image up to 1 MB.");
  if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") throw new Error("Upload a valid PNG image.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16); const height = view.getUint32(20);
  if (width < 100 || height < 100 || width > 2048 || height > 2048) throw new Error("Use an image between 100 and 2,048 pixels on each side.");
}
