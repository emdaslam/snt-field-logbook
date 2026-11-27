// Signature images uploaded in the profile. Each is stored on the staff row as
// a JSON blob carrying the base64 data URL plus its pixel dimensions, so the PDF
// renderer can lay the image out without an async image decode.

export type SignatureImage = { dataUrl: string; w: number; h: number };

/** Parse the stored JSON blob; null when absent or malformed. */
export function parseSignature(raw: string | null | undefined): SignatureImage | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SignatureImage>;
    return v?.dataUrl ? { dataUrl: v.dataUrl, w: v.w || 0, h: v.h || 0 } : null;
  } catch {
    return null;
  }
}

/** Encode a signature for storage on the staff row. */
export function encodeSignature(img: SignatureImage): string {
  return JSON.stringify({ dataUrl: img.dataUrl, w: img.w, h: img.h });
}

/**
 * An `<img>` block the PDF renderer embeds over the matching signature /
 * designation label. Word and Excel ignore `<img>`, so the signature is a PDF-
 * only artefact. Returns "" when no signature is stored — the existing blank
 * line stays as before.
 *
 * `anchor` picks the horizontal centre: "center" (default) puts it on the page
 * centre for the bottom-line reports; "col" with `col` centres it over the
 * Nth column of the preceding TA signature-lines block (the claiming-TA slot).
 */
export function signatureImgHtml(
  raw: string | null | undefined,
  opts: { sign: "plain" | "ta"; anchor?: "center" | "col"; col?: number } = { sign: "plain" }
): string {
  const img = parseSignature(raw);
  if (!img || !img.dataUrl) return "";
  const anchor = opts.anchor === "col" ? `col:${opts.col ?? 0}` : "center";
  return `<img class="sigimg" data-sign="${opts.sign}" data-anchor="${anchor}" data-w="${img.w}" data-h="${img.h}" src="${img.dataUrl}"/>`;
}
