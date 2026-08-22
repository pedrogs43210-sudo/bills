import { SCAN_IMAGE_MAX_EDGE } from "./receipt";
import { QUALITY_EDGE, assessGray, toGrayscale, type PhotoQuality } from "./photoQuality";

export type PreparedPhoto = {
  /** base64 JPEG, no data: prefix. */
  base64: string;
  /**
   * What the pixels look like. Null when the browser would not hand them over — a canvas tainted
   * by a cross-origin image, or a `getImageData` that throws. A photo we could not measure is
   * always allowed through: refusing to scan because the check itself failed would be the worst of
   * both worlds.
   */
  quality: PhotoQuality | null;
};

/**
 * Downscale a photo to a base64 JPEG (no data: prefix), at the scanning model's own resolution
 * ceiling. Shrinking further to save tokens is a false economy: the lost detail is exactly the
 * decimal point and the small print, and a misread price costs more than a cent.
 *
 * The quality check rides along here rather than living in its own function, because decoding a
 * 12-megapixel photo is the expensive part and doing it twice would be visible as a pause on a
 * cheap phone. One decode, two uses.
 */
export async function downscaleToBase64Jpeg(
  file: File,
  maxEdge = SCAN_IMAGE_MAX_EDGE
): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const quality = measure(bitmap);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), quality };
}

/**
 * Measure the photo at a fixed size, whatever the phone produced.
 *
 * The resample is the whole reason this is separate. Variance of the Laplacian scales with
 * resolution, so measuring the full-size image would mean a flagship's 12MP photo and a cheap
 * handset's 5MP photo of the same receipt score differently — and any threshold would then be a
 * statement about the phone rather than about the picture. Everything is judged at QUALITY_EDGE.
 */
function measure(bitmap: ImageBitmap): PhotoQuality | null {
  try {
    const s = Math.min(1, QUALITY_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * s));
    const h = Math.max(1, Math.round(bitmap.height * s));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(bitmap, 0, 0, w, h);
    const { data } = cx.getImageData(0, 0, w, h);
    return assessGray(toGrayscale(data, w, h), w, h);
  } catch {
    // Never fatal. A photo that cannot be measured is a photo that gets scanned.
    return null;
  }
}
