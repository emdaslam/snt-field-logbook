/** Narrowest the NATURE OF WORK column may go in fit-on-one-page mode — wide
 *  enough to stay readable but well under the ~280pt it otherwise absorbs. */
export const MIN_NATURE_COL = 40;

/**
 * One-page leftover: pinned columns keep their content widths; the single
 * unpinned column (NATURE OF WORK — diary col 6, TA journal col 9) takes the
 * rest of the printable width. Dumping leftover onto DATE / TRAIN / TIME
 * made those cells wider than their text, squeezed the work column, and
 * shrank the fitted font (October diary vs August / September).
 */
export function fitLeftoverWidths(
  pinned: Record<number, number>,
  wrapCol: number | undefined,
  avail: number
): Record<number, number> {
  const used = Object.values(pinned).reduce((a, b) => a + b, 0);
  if (used <= 0) return { ...pinned };
  if (wrapCol == null) {
    const k = avail / used;
    const out: Record<number, number> = {};
    for (const [col, w] of Object.entries(pinned)) out[Number(col)] = w * k;
    return out;
  }
  return { ...pinned, [wrapCol]: Math.max(avail - used, 0) };
}
