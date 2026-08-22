export type BackupPayload = {
  exportedAt?: string;
  version?: number;
  stations?: unknown[];
  staff?: unknown[];
  tags?: unknown[];
  dailyLogs?: unknown[];
  deficiencyTasks?: unknown[];
  plannedWorks?: unknown[];
  notes?: unknown[];
  noteCategories?: unknown[];
  materials?: unknown[];
  materialReceipts?: unknown[];
  materialUsages?: unknown[];
  materialStations?: unknown[];
  equipmentTypes?: unknown[];
  settings?: Record<string, string>;
};

export const BACKUP_TABLES = [
  { key: "dailyLogs", label: "Daily Logs" },
  { key: "deficiencyTasks", label: "Deficiency Tasks" },
  { key: "plannedWorks", label: "Planned Works" },
  { key: "materials", label: "Materials" },
  { key: "materialReceipts", label: "Material Receipts" },
  { key: "materialUsages", label: "Material Usage" },
  { key: "materialStations", label: "Material Station Requirements" },
  { key: "equipmentTypes", label: "Equipment" },
  { key: "stations", label: "Stations" },
  { key: "staff", label: "Staff" },
  { key: "tags", label: "Tags" },
  { key: "notes", label: "Important Notes" },
  { key: "noteCategories", label: "Note Categories" },
] as const;

export type BackupSummary = {
  counts: Record<string, number>;
  attachments: number;
  settings: number;
  totalRecords: number;
  exportedAt: string | null;
  valid: boolean;
};

/** Produce a human-readable manifest of exactly what a backup contains. */
export function summarizeBackup(payload: BackupPayload | null): BackupSummary {
  const counts: Record<string, number> = {};
  let totalRecords = 0;

  for (const t of BACKUP_TABLES) {
    const arr = payload?.[t.key];
    const n = Array.isArray(arr) ? arr.length : 0;
    counts[t.key] = n;
    totalRecords += n;
  }

  // Count embedded photo/file attachments inside daily logs
  let attachments = 0;
  const logs = payload?.dailyLogs;
  if (Array.isArray(logs)) {
    for (const l of logs) {
      const a = (l as { attachments?: unknown }).attachments;
      if (Array.isArray(a)) attachments += a.length;
    }
  }

  const settings =
    payload?.settings && typeof payload.settings === "object"
      ? Object.keys(payload.settings).length
      : 0;

  const valid =
    !!payload &&
    typeof payload === "object" &&
    BACKUP_TABLES.some((t) => Array.isArray(payload[t.key]));

  return {
    counts,
    attachments,
    settings,
    totalRecords,
    exportedAt: typeof payload?.exportedAt === "string" ? payload.exportedAt : null,
    valid,
  };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Marker set by the server on logs shared from another staff member. */
export const SHARED_MARKER = "__shared__";
export function isSharedLog(l: { stationMovement: string | null }) {
  return l.stationMovement === SHARED_MARKER;
}
