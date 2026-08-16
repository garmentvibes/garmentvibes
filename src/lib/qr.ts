import QRCode from "qrcode";

// QR generation, server-side only.
//
// Deliberately not a hosted QR service (api.qrserver.com and friends): that
// would put a third-party request on the page, leak which pages are being
// viewed to that service, and be blocked outright by our img-src CSP. An
// inline SVG generated at build time costs nothing at runtime, works
// offline, and needs no CSP change because markup isn't a fetch.

/**
 * Returns the QR as an inline SVG string.
 *
 * Error-correction level M tolerates roughly 15% damage, which is the usual
 * choice for a code that will be scanned off a screen — enough robustness
 * without inflating the module count and making it harder to scan from a
 * distance.
 */
export async function qrSvg(text: string) {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1, // quiet zone, in modules — 1 is enough for on-screen scanning
    width: 320,
    color: {
      dark: "#1c1917", // neutral-900, matching the storefront
      light: "#ffffff",
    },
  });
}
