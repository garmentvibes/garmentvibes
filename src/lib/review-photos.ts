// ---------------------------------------------------------------------------
// Customer photos on reviews.
//
// Photographs from people who actually bought the garment are the highest-trust
// thing on an apparel page — they show the fabric under someone's own lighting,
// on a body that is not a model's, which is exactly what the catalogue shots
// cannot do.
//
// Storage: photos are downscaled in the browser and kept as data URLs
// alongside the review, because reviews still live in localStorage. That
// forces the size discipline below, and it is not a bad thing — a 4MB phone
// photo helps nobody at 96px, and downscaling before upload is what a real
// implementation should do anyway. When reviews move to Supabase, the upload
// goes to Storage and this returns a bucket URL instead; the `photos` field on
// a review does not change shape.
//
// The limits are deliberately tight. localStorage is a few megabytes for the
// whole origin, shared with the cart, the wishlist and every other store, and
// filling it does not fail gracefully — it throws mid-write and can leave a
// partially-saved store behind.
// ---------------------------------------------------------------------------

/** Photos per review. Three tells the story; ten is an album. */
export const MAX_PHOTOS = 3;

/** Longest edge after downscaling, in pixels. */
export const MAX_DIMENSION = 900;

/** JPEG quality for the downscaled copy. */
export const JPEG_QUALITY = 0.72;

/**
 * Largest file accepted before downscaling. Phone photos are commonly 3-8MB;
 * anything past this is more likely a mistake than a photo of a kurta.
 */
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface PhotoValidation {
  ok: boolean;
  error?: string;
}

/**
 * Checks a file before any work is done on it.
 *
 * Type is checked rather than trusted from the extension, and HEIC is called
 * out by name because it is what an iPhone produces by default and the browser
 * cannot decode it — "unsupported file" would leave the customer with no idea
 * what to do.
 */
export function validatePhotoFile(file: { type: string; size: number; name?: string }): PhotoValidation {
  if (/\.hei[cf]$/i.test(file.name ?? "") || /hei[cf]/i.test(file.type)) {
    return {
      ok: false,
      error: "iPhone HEIC photos can't be read by browsers. Share it as JPEG, or screenshot it.",
    };
  }

  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    return { ok: false, error: "Photos must be JPEG, PNG or WebP" };
  }

  if (file.size > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      error: `That photo is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is ${MAX_SOURCE_BYTES / (1024 * 1024)}MB`,
    };
  }

  if (file.size === 0) return { ok: false, error: "That file is empty" };

  return { ok: true };
}

/**
 * Scales dimensions to fit inside a square of `max`, preserving aspect ratio.
 *
 * Never scales up: a small photo stays small rather than being stretched into
 * a larger, blurrier file.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number = MAX_DIMENSION
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= max && height <= max) return { width, height };

  const ratio = Math.min(max / width, max / height);
  // Rounded, and floored at 1 — a very wide, very short image would otherwise
  // round its height to zero and produce a canvas that cannot be drawn.
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** How many more photos may be added to a review that already has `current`. */
export function remainingSlots(current: number): number {
  return Math.max(0, MAX_PHOTOS - current);
}

/**
 * Reads a file, scales it down and returns a JPEG data URL.
 *
 * Browser-only — it needs an Image and a canvas. The pure parts above are
 * where the rules live so they can be tested without one.
 */
export async function downscaleToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file could not be read as an image"));
      img.src = objectUrl;
    });

    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process that image");
    context.drawImage(image, 0, 0, width, height);

    // JPEG regardless of what came in: a PNG photograph is several times
    // larger for no visible gain, and these are going into a size-constrained
    // store.
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    // Released whether or not the decode worked; a leaked object URL pins the
    // whole file in memory for the life of the page.
    URL.revokeObjectURL(objectUrl);
  }
}
