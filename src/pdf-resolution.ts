// Bound the backing bitmap rather than reducing every HiDPI screen to DPR 2.
// The pixel budget matches PDF.js's desktop viewer default (2 ** 25).
export function pdfResolution(width: number, height: number, deviceScale: number) {
  const requested = Number.isFinite(deviceScale) && deviceScale > 0 ? deviceScale : 1;
  const ratio = Math.min(
    requested,
    Math.sqrt(2 ** 25 / (width * height)),
    8192 / width,
    8192 / height,
  );
  return {
    ratio,
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
  };
}
