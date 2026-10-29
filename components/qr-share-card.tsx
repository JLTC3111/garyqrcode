"use client";
import { useEffect, useState } from "react";
import { ArrowDownToLine, QrCode } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";
import { DEFAULT_QR_DESTINATION, type PublicQr } from "@/lib/qr";

export default function QrShareCard({ locale, previewSrc }: { locale: Locale; previewSrc?: string }) {
  const t = (text: string) => translate(locale, text);
  const [qr, setQr] = useState<PublicQr>({ destination: DEFAULT_QR_DESTINATION, imageUrl: previewSrc || "/api/qr/image", version: "default", mode: "generate", updatedAt: null });
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (previewSrc) return;
    const controller = new AbortController();
    fetch("/api/qr", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || typeof (value as PublicQr).imageUrl !== "string" || !(value as PublicQr).imageUrl.startsWith("/")) throw new Error();
      setQr(value as PublicQr);
    }).catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, [previewSrc]);
  return <section className="qr-share-card" aria-labelledby="qr-share-title">
    <div className="qr-share-copy"><span className="qr-share-eyebrow"><QrCode size={15} />{t("KEEP THE CONNECTION")}</span><h2 id="qr-share-title">{t("Your next step, on your phone.")}</h2><p>{t("Scan the Gary QR code to open the customer page, or download it to share.")}</p>{!unavailable && <a className="qr-download" href={qr.imageUrl} download={`gary-customer-connect-qr.${qr.mode === "upload" ? "png" : "svg"}`}><ArrowDownToLine size={15} />{t("Download QR code")}</a>}</div>
    <div className="public-qr-image">{unavailable ? <p role="status">{t("The QR code is temporarily unavailable.")}</p> : <img src={qr.imageUrl} width={134} height={152} alt={t("Gary QR code for the customer page")} onError={() => setUnavailable(true)} />}</div>
  </section>;
}
