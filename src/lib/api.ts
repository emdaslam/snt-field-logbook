/**
 * Offline data API.
 *
 * Same call surface the UI has always used, but every operation now runs
 * against the device's own IndexedDB store. Nothing here touches the network.
 */
import * as ldb from "./localdb";
import type {
  Note,
  NoteCategory,
  Station,
  Staff,
  Tag,
  DailyLog,
  DeficiencyTask,
  PlannedWork,
} from "@/db/schema";

const asc = <T extends Record<string, unknown>>(rows: T[], key: keyof T) =>
  [...rows].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")));

const desc = <T extends Record<string, unknown>>(rows: T[], key: keyof T) =>
  [...rows].sort((a, b) => String(b[key] ?? "").localeCompare(String(a[key] ?? "")));

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Resolve the staff member mapped to a station (for deficiency routing). */
async function staffForStation(stationId: number | null): Promise<number | null> {
  if (!stationId) return null;
  const rows = await ldb.readTable<Staff>("staff");
  const hit = rows.find((s) => Array.isArray(s.stationIds) && s.stationIds.includes(stationId));
  return hit ? hit.id : null;
}

export const api = {
  stations: {
    list: async () => asc(await ldb.readTable<Station>("stations"), "name"),
    create: (b: Partial<Station>) =>
      ldb.insert<Partial<Station>>("stations", { name: b.name ?? "", code: b.code ?? null }) as unknown as Promise<Station>,
    update: (b: Partial<Station>) =>
      ldb.update("stations", b.id as number, { name: b.name, code: b.code ?? null }) as unknown as Promise<Station>,
    remove: (id: number) => ldb.remove("stations", id),
  },

  staff: {
    list: async () => asc(await ldb.readTable<Staff>("staff"), "name"),
    create: (b: Partial<Staff>) =>
      ldb.insert("staff", {
        name: b.name ?? "",
        designation: b.designation ?? null,
        phone: b.phone ?? null,
        email: b.email ?? null,
        department: b.department ?? null,
        stationIds: Array.isArray(b.stationIds) ? b.stationIds : [],
        headquartersStationId: b.headquartersStationId ?? null,
        isCurrentUser: b.isCurrentUser ?? false,
      }) as unknown as Promise<Staff>,
    update: (b: Partial<Staff>) =>
      ldb.update("staff", b.id as number, {
        name: b.name,
        designation: b.designation ?? null,
        phone: b.phone ?? null,
        email: b.email ?? null,
        department: b.department ?? null,
        stationIds: Array.isArray(b.stationIds) ? b.stationIds : [],
        headquartersStationId: b.headquartersStationId ?? null,
        isCurrentUser: b.isCurrentUser ?? false,
      }) as unknown as Promise<Staff>,
    remove: (id: number) => ldb.remove("staff", id),
  },

  tags: {
    list: async () => asc(await ldb.readTable<Tag>("tags"), "name"),
    create: (b: Partial<Tag>) =>
      ldb.insert("tags", { name: b.name ?? "", color: b.color ?? "#2563eb" }) as unknown as Promise<Tag>,
    update: (b: Partial<Tag>) =>
      ldb.update("tags", b.id as number, { name: b.name, color: b.color }) as unknown as Promise<Tag>,
    remove: (id: number) => ldb.remove("tags", id),
  },

  logs: {
    // staffId is accepted for call-site compatibility; on a single offline
    // device every entry belongs to this device, so nothing is filtered out.
    list: async (_staffId?: number | null) => {
      void _staffId;
      const rows = await ldb.readTable<DailyLog>("dailyLogs");
      return desc(rows, "logDate");
    },
    create: (b: Partial<DailyLog>) => ldb.insert("dailyLogs", normaliseLog(b)) as unknown as Promise<DailyLog>,
    update: (b: Partial<DailyLog>) =>
      ldb.update("dailyLogs", b.id as number, normaliseLog(b)) as unknown as Promise<DailyLog>,
    remove: (id: number) => ldb.remove("dailyLogs", id),
  },

  deficiencies: {
    list: async () => desc(await ldb.readTable<DeficiencyTask>("deficiencyTasks"), "createdAt"),
    create: async (b: Partial<DeficiencyTask>) =>
      ldb.insert("deficiencyTasks", {
        department: b.department ?? "Signalling",
        stationId: b.stationId ?? null,
        title: b.title ?? "",
        description: b.description ?? null,
        priority: b.priority ?? "Normal",
        dueDate: b.dueDate || null,
        assignedStaffId: await staffForStation(b.stationId ?? null),
        status: b.status ?? "Pending",
        selectedForTomorrow: false,
        completedAt: null,
      }) as unknown as Promise<DeficiencyTask>,
    update: async (b: Partial<DeficiencyTask>) => {
      const patch: Record<string, unknown> = {};
      if (b.department !== undefined) patch.department = b.department;
      if (b.stationId !== undefined) {
        patch.stationId = b.stationId;
        patch.assignedStaffId = await staffForStation(b.stationId ?? null);
      }
      if (b.title !== undefined) patch.title = b.title;
      if (b.description !== undefined) patch.description = b.description;
      if (b.priority !== undefined) patch.priority = b.priority;
      if (b.dueDate !== undefined) patch.dueDate = b.dueDate || null;
      if (b.selectedForTomorrow !== undefined) patch.selectedForTomorrow = b.selectedForTomorrow;
      if (b.status !== undefined) {
        patch.status = b.status;
        patch.completedAt = b.status === "Completed" ? new Date().toISOString() : null;
        if (b.status === "Completed") patch.selectedForTomorrow = false;
      }
      return ldb.update("deficiencyTasks", b.id as number, patch) as unknown as Promise<DeficiencyTask>;
    },
    remove: (id: number) => ldb.remove("deficiencyTasks", id),
  },

  planned: {
    list: async (_staffId?: number | null) => {
      void _staffId;
      return desc(await ldb.readTable<PlannedWork>("plannedWorks"), "plannedDate");
    },
    create: (b: Partial<PlannedWork>) =>
      ldb.insert("plannedWorks", {
        title: b.title ?? "",
        description: b.description ?? null,
        plannedDate: b.plannedDate ?? "",
        stationId: b.stationId ?? null,
        materialRemarks: b.materialRemarks ?? null,
        ownerStaffId: b.ownerStaffId ?? null,
        status: b.status ?? "Pending",
        selectedForTomorrow: false,
        notified: false,
        completedAt: null,
      }) as unknown as Promise<PlannedWork>,
    update: (b: Partial<PlannedWork>) => {
      const patch: Record<string, unknown> = {};
      for (const k of [
        "title",
        "description",
        "plannedDate",
        "stationId",
        "materialRemarks",
        "selectedForTomorrow",
        "notified",
      ] as const) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      if (b.status !== undefined) {
        patch.status = b.status;
        patch.completedAt = b.status === "Completed" ? new Date().toISOString() : null;
        if (b.status === "Completed") patch.selectedForTomorrow = false;
      }
      return ldb.update("plannedWorks", b.id as number, patch) as unknown as Promise<PlannedWork>;
    },
    remove: (id: number) => ldb.remove("plannedWorks", id),
  },

  notes: {
    list: async () => {
      const rows = await ldb.readTable<Note>("notes");
      return [...rows].sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
      );
    },
    create: (b: Partial<Note>) =>
      ldb.insert("notes", {
        title: b.title ?? "",
        body: b.body ?? null,
        category: b.category ?? "General",
        stationId: b.stationId ?? null,
        refDate: b.refDate || null,
        pinned: Boolean(b.pinned),
        ownerStaffId: b.ownerStaffId ?? null,
        updatedAt: new Date().toISOString(),
      }) as unknown as Promise<Note>,
    update: (b: Partial<Note>) => {
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const k of ["title", "body", "category", "stationId", "pinned"] as const) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      if (b.refDate !== undefined) patch.refDate = b.refDate || null;
      return ldb.update("notes", b.id as number, patch) as unknown as Promise<Note>;
    },
    remove: (id: number) => ldb.remove("notes", id),
  },

  noteCategories: {
    list: async () => asc(await ldb.readTable<NoteCategory>("noteCategories"), "name"),
    create: async (b: Partial<NoteCategory>) => {
      const name = String(b.name ?? "").trim();
      if (!name) return { error: "Name is required" } as NoteCategory & { error?: string };
      const rows = await ldb.readTable<NoteCategory>("noteCategories");
      if (rows.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return { error: "That category already exists" } as NoteCategory & { error?: string };
      }
      return ldb.insert("noteCategories", { name, color: b.color ?? "#2563eb" }) as unknown as unknown as Promise<
        NoteCategory & { error?: string }
      >;
    },
    update: async (b: Partial<NoteCategory>) => {
      const rows = await ldb.readTable<NoteCategory>("noteCategories");
      const current = rows.find((c) => c.id === b.id);
      if (!current) return { error: "Not found" } as NoteCategory & { error?: string };
      const name = b.name !== undefined ? String(b.name).trim() : current.name;
      if (!name) return { error: "Name is required" } as NoteCategory & { error?: string };
      if (rows.some((c) => c.id !== b.id && c.name.toLowerCase() === name.toLowerCase())) {
        return { error: "That category already exists" } as NoteCategory & { error?: string };
      }
      const saved = await ldb.update("noteCategories", b.id as number, {
        name,
        color: b.color ?? current.color,
      });
      // Keep notes pointing at the renamed category
      if (name !== current.name) {
        const notes = await ldb.readTable<Note>("notes");
        for (const n of notes.filter((x) => x.category === current.name)) {
          await ldb.update("notes", n.id, { category: name });
        }
      }
      return saved as unknown as NoteCategory & { error?: string };
    },
    remove: async (id: number) => {
      const rows = await ldb.readTable<NoteCategory>("noteCategories");
      const current = rows.find((c) => c.id === id);
      if (current) {
        const notes = await ldb.readTable<Note>("notes");
        for (const n of notes.filter((x) => x.category === current.name)) {
          await ldb.update("notes", n.id, { category: "General" });
        }
      }
      await ldb.remove("noteCategories", id);
    },
  },

  /** Whole-database backup handled entirely on-device. */
  backup: {
    export: () => ldb.exportAll(),
    import: (payload: Record<string, unknown>) => ldb.importAll(payload),
  },

  seed: () => ldb.seedIfEmpty(),
};

function normaliseLog(b: Partial<DailyLog>) {
  return {
    logDate: b.logDate ?? "",
    stationMovement: b.stationMovement ?? null,
    workDone: b.workDone ?? null,
    ta: null,
    taPercent: num(b.taPercent, 100) || 100,
    ownerStaffId: b.ownerStaffId ?? null,
    pcdoWork: b.pcdoWork ?? null,
    pcdoStationId: b.pcdoStationId ?? null,
    pcdoDate: b.pcdoDate || null,
    hasDisconnections: Boolean(b.hasDisconnections),
    discSpecialWork: num(b.discSpecialWork),
    discFailure: num(b.discFailure),
    discMaintenance: num(b.discMaintenance),
    inspectionKind: b.inspectionKind ?? null,
    inspectionStationId: b.inspectionStationId ?? null,
    inspectionTowardsStationId: b.inspectionTowardsStationId ?? null,
    inspectionJointDept: b.inspectionJointDept ?? null,
    inspectionPeriodicity: b.inspectionPeriodicity ?? null,
    inspectionSide: null,
    footplateShift: b.footplateShift ?? null,
    footplateDirection: b.footplateDirection ?? null,
    footplateUp: b.footplateUp ?? null,
    footplateDown: b.footplateDown ?? null,
    tagIds: b.tagIds ?? [],
    attachments: b.attachments ?? [],
  };
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dayName(d: string | Date) {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return date.toLocaleDateString("en-US", { weekday: "short" });
}
