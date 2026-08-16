import { qrSvg } from "@/lib/qr";
import { siteUrl } from "@/lib/seo";
import { InstallQrCardShell } from "@/components/retail/install-qr-card-shell";

/**
 * "Scan to shop on your phone" card.
 *
 * Complements InstallPrompt rather than duplicating it. That one relies on
 * `beforeinstallprompt`, which never fires on iOS Safari and isn't much use
 * on a desktop anyway — nobody wants a clothes shop pinned to their laptop
 * taskbar. The gap it leaves is the common case: someone browsing on a
 * desktop who would rather carry on from their phone. A QR closes that, and
 * covers iOS as a side effect.
 *
 * The QR is generated on the server, so it ships as inline SVG in the
 * prerendered HTML: no client JavaScript, no runtime cost, and it still
 * works when the service worker is serving the page offline.
 */
export async function InstallQrCard() {
  const url = siteUrl();
  const svg = await qrSvg(url);

  // Strip the XML prolog qrcode emits — it's invalid inside HTML — and drop
  // the fixed width/height so CSS can size it responsively.
  const inlineSvg = svg
    .replace(/<\?xml.*?\?>/, "")
    .replace(/ (width|height)="[^"]*"/g, "");

  return (
    <InstallQrCardShell
      // Shown without the scheme: shorter, and nobody types "https://".
      displayUrl={url.replace(/^https?:\/\//, "")}
      svg={inlineSvg}
    />
  );
}
