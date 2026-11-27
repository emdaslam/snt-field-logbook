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
 * centre; "col" with `col` centres it over the Nth column of the preceding TA
 * signature-lines block (the claiming-TA slot); "right" centres it over the
 * right-hand designation line rendered just below it (give its text in
 * `alignText` and the same `alignPad` the paragraph uses).
 */
export function signatureImgHtml(
  raw: string | null | undefined,
  opts: {
    sign: "plain" | "ta";
    anchor?: "center" | "col" | "right";
    col?: number;
    alignText?: string;
    alignPad?: number;
  } = { sign: "plain" }
): string {
  const img = parseSignature(raw);
  if (!img || !img.dataUrl) return "";
  const anchor =
    opts.anchor === "col" ? `col:${opts.col ?? 0}` : opts.anchor === "right" ? "right" : "center";
  const align =
    opts.anchor === "right"
      ? ` data-anchor-text="${attrEsc(opts.alignText ?? "")}" data-anchor-pad="${opts.alignPad ?? 0}"`
      : "";
  return `<img class="sigimg" data-sign="${opts.sign}" data-anchor="${anchor}" data-w="${img.w}" data-h="${img.h}"${align} src="${img.dataUrl}"/>`;
}

function attrEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
