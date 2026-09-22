export type ExportPageMode = "fit" | "two" | "earlier";

/**
 * Diary / TA remember Fit / Two pages / Earlier in `snt.exportPageMode`.
 * Other exports (PCDO, monthly, inspections…) have no page-layout toggle, so
 * they always use Earlier (manual text size) — a leftover Fit/Two choice
 * must not hide the size field or auto-shrink those reports.
 */
export function resolveExportPageMode(
  onePage: boolean,
  saved: string | null,
  legacy: string | null,
  hasTwoBody: boolean
): ExportPageMode {
  if (!onePage) return "earlier";
  if (saved === "fit" || saved === "earlier" || (saved === "two" && hasTwoBody)) return saved;
  if (legacy != null) return legacy === "1" ? "fit" : "earlier";
  return "fit";
}
