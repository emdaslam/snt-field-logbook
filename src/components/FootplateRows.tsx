import type { ReactNode } from "react";
import type { FootplateBlock, FootplateDetail } from "@/db/schema";

function isBlock(b: FootplateBlock | FootplateDetail | null | undefined): b is FootplateBlock {
  return Boolean(b && typeof b === "object" && "direction" in b);
}

/**
 * Detail rows for the trains recorded on a footplate inspection. Handles the
 * new per-shift direction blocks (Day/Night each with Up/Down) and the legacy
 * UP/DN detail columns from older saves.
 */
export function FootplateDetailRows({
  log,
  rowClass = "mt-1 text-xs text-sky-800",
}: {
  log: {
    footplateDay?: FootplateBlock | FootplateDetail | null;
    footplateNight?: FootplateBlock | FootplateDetail | null;
    footplateUp?: FootplateDetail | null;
    footplateDown?: FootplateDetail | null;
  };
  rowClass?: string;
}) {
  const parts: ReactNode[] = [];
  const row = (label: string, d: FootplateDetail, key: string) => {
    if (!d.trainNo) return null;
    return (
      <p key={key} className={rowClass}>
        <strong>{label}</strong> — Train {d.trainNo}
        {d.engineNo ? ` · Engine ${d.engineNo}` : ""}
        {d.lpName ? ` · LP ${d.lpName}` : ""}
        {d.alpName ? ` · ALP ${d.alpName}` : ""}
        {d.tmrName ? ` · TMR ${d.tmrName}` : ""}
        {d.remarks ? ` · ${d.remarks}` : ""}
      </p>
    );
  };
  const pushShift = (shift: string, b: FootplateBlock | FootplateDetail | null | undefined) => {
    if (!b) return;
    if (isBlock(b)) {
      if (b.up?.trainNo) parts.push(row(`${shift} UP`, b.up, `${shift}U`));
      if (b.down?.trainNo) parts.push(row(`${shift} DN`, b.down, `${shift}D`));
    } else if (b.trainNo) {
      parts.push(row(shift, b, shift));
    }
  };
  pushShift("Day", log.footplateDay);
  pushShift("Night", log.footplateNight);
  if (log.footplateUp?.trainNo) parts.push(row("UP", log.footplateUp, "up"));
  if (log.footplateDown?.trainNo) parts.push(row("DN", log.footplateDown, "down"));
  return <>{parts}</>;
}
