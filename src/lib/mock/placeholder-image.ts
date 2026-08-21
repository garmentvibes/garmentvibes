// Placeholder product art, until real photography exists.
//
// These used to be inlined as `data:image/svg+xml,...` URIs, which put roughly
// a kilobyte of URL-encoded markup into the HTML per image — /shop alone was
// 111KB, almost all of it this. They are now real files under
// public/placeholders/, written by scripts/placeholders/generate.mjs, which
// makes them cacheable, keeps them out of the document, and lets next/image
// treat them as images rather than opaque strings.
//
// A `.svg` extension is load-bearing: next/image applies `unoptimized`
// automatically when it sees one, which is what we want here — there is
// nothing for the optimiser to do to a rectangle and a word, and routing SVG
// through it would need `dangerouslyAllowSVG`.

export const PLACEHOLDER_WIDTH = 600;
export const PLACEHOLDER_HEIGHT = 800;

export interface PlaceholderSpec {
  label: string;
  bg: string;
  fg: string;
}

/**
 * Every placeholder any imported module has asked for, keyed by its path.
 *
 * Populated as a side effect of `placeholderImage()` because the call site is
 * the only place that knows the label and colour — once it has returned a
 * path, that information is gone. The generator imports the catalogue and
 * reads this back to decide which files to write, so the set of files can
 * never drift from the set of paths the app actually references.
 */
const registry = new Map<string, PlaceholderSpec>();

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function placeholderImage(label: string, bg: string, fg = "#ffffff") {
  // Colour is part of the filename, not just the label: the same garment is
  // shown in several colourways, and they must not collapse onto one file.
  const path = `/placeholders/${slugify(label)}-${bg.replace("#", "").toLowerCase()}.svg`;
  registry.set(path, { label, bg, fg });
  return path;
}

export function placeholderRegistry(): ReadonlyMap<string, PlaceholderSpec> {
  return registry;
}

/** XML-escapes text destined for an SVG body. */
function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The SVG for one placeholder.
 *
 * Colours are validated rather than interpolated blindly. These come from our
 * own catalogue today, but an SVG is an active document — a browser opening
 * one directly will run script inside it — so the file must not become a way
 * to smuggle markup in through a product name.
 */
export function placeholderSvg({ label, bg, fg }: PlaceholderSpec) {
  for (const colour of [bg, fg]) {
    if (!/^#[0-9a-fA-F]{3,8}$/.test(colour)) {
      throw new Error(`Placeholder colour must be a hex literal, got: ${colour}`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PLACEHOLDER_WIDTH}" height="${PLACEHOLDER_HEIGHT}" viewBox="0 0 ${PLACEHOLDER_WIDTH} ${PLACEHOLDER_HEIGHT}">
  <rect width="${PLACEHOLDER_WIDTH}" height="${PLACEHOLDER_HEIGHT}" fill="${bg}"/>
  <text x="300" y="400" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${escapeXml(label)}</text>
</svg>
`;
}
