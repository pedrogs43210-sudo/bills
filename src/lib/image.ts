import { SCAN_IMAGE_MAX_EDGE } from "./receipt";

/**
 * Downscale a photo to a base64 JPEG (no data: prefix), at the scanning model's own resolution
 * ceiling. Shrinking further to save tokens is a false economy: the lost detail is exactly the
 * decimal point and the small print, and a misread price costs more than a cent.
 */
export async function downscaleToBase64Jpeg(file: File, maxEdge = SCAN_IMAGE_MAX_EDGE): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
