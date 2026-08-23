import { describe, expect, it } from "vitest";

import {
  ACCEPTED_TYPES,
  MAX_PHOTOS,
  MAX_SOURCE_BYTES,
  fitWithin,
  remainingSlots,
  validatePhotoFile,
} from "./review-photos";

const ok = (over: Partial<{ type: string; size: number; name: string }> = {}) => ({
  type: "image/jpeg",
  size: 500_000,
  name: "kurta.jpg",
  ...over,
});

describe("validatePhotoFile", () => {
  it("accepts every type the browser can decode", () => {
    for (const type of ACCEPTED_TYPES) {
      expect(validatePhotoFile(ok({ type })).ok, type).toBe(true);
    }
  });

  it("rejects a type the browser cannot decode", () => {
    expect(validatePhotoFile(ok({ type: "image/tiff", name: "x.tif" })).ok).toBe(false);
    expect(validatePhotoFile(ok({ type: "application/pdf", name: "x.pdf" })).ok).toBe(false);
  });

  // HEIC is what an iPhone produces by default, so this is the most likely
  // rejection a real customer will hit. "Unsupported file" would leave them
  // with no idea what to do about it.
  it("names HEIC specifically and says what to do", () => {
    const byType = validatePhotoFile(ok({ type: "image/heic", name: "IMG_0001.heic" }));
    expect(byType.ok).toBe(false);
    expect(byType.error).toMatch(/JPEG/);

    // Some browsers report an empty or generic type for HEIC, so the
    // extension has to be checked too.
    const byName = validatePhotoFile(ok({ type: "", name: "IMG_0001.HEIC" }));
    expect(byName.ok).toBe(false);
    expect(byName.error).toMatch(/JPEG/);
  });

  it("rejects a file past the size ceiling, and says how big it was", () => {
    const result = validatePhotoFile(ok({ size: MAX_SOURCE_BYTES + 1 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/12MB/);
  });

  it("accepts a file exactly at the ceiling", () => {
    expect(validatePhotoFile(ok({ size: MAX_SOURCE_BYTES })).ok).toBe(true);
  });

  it("rejects an empty file", () => {
    expect(validatePhotoFile(ok({ size: 0 })).ok).toBe(false);
  });
});

describe("fitWithin", () => {
  it("leaves a small image alone rather than stretching it", () => {
    expect(fitWithin(400, 300, 900)).toEqual({ width: 400, height: 300 });
  });

  it("scales the longest edge down to the limit", () => {
    expect(fitWithin(1800, 1200, 900)).toEqual({ width: 900, height: 600 });
    expect(fitWithin(1200, 1800, 900)).toEqual({ width: 600, height: 900 });
  });

  it("preserves aspect ratio", () => {
    const { width, height } = fitWithin(4032, 3024, 900);
    expect(width / height).toBeCloseTo(4032 / 3024, 2);
  });

  it("leaves an image exactly at the limit alone", () => {
    expect(fitWithin(900, 900, 900)).toEqual({ width: 900, height: 900 });
  });

  // A panorama would otherwise round its short edge to zero, and a canvas of
  // height 0 cannot be drawn to.
  it("never rounds an edge down to zero", () => {
    const { height } = fitWithin(20000, 10, 900);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("handles a degenerate size without producing NaN", () => {
    expect(fitWithin(0, 0, 900)).toEqual({ width: 0, height: 0 });
  });
});

describe("remainingSlots", () => {
  it("counts down to the cap", () => {
    expect(remainingSlots(0)).toBe(MAX_PHOTOS);
    expect(remainingSlots(MAX_PHOTOS - 1)).toBe(1);
    expect(remainingSlots(MAX_PHOTOS)).toBe(0);
  });

  it("never goes negative", () => {
    expect(remainingSlots(MAX_PHOTOS + 5)).toBe(0);
  });
});
