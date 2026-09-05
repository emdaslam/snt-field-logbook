/**
 * Offline data API.
 *
 * Same call surface the UI has always used, but every operation now runs
 * against the device's own IndexedDB store. Nothing here touches the network.
 */
import * as ldb from "./localdb";
import { markDayDirty, markDataDirty } from "./drivebackup";
import type {
  Note,
  NoteCategory,
  Station,
  Staff,
  Tag,
  DailyLog,
  DeficiencyTask,
  PlannedWork,
  FootplateDetail,
  FootplateBlock,
  FootplateJourney,
  FootplateRide,
  Material,
  MaterialReceipt,
  MaterialUsage,
  MaterialTransfer,
  MaterialStation,
  EquipmentType,
} from "@/db/schema";
import { isSpecialMovement, type PcdoWork, type CounterReset } from "@/lib/types";

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
    create: (b: Partial<Station>) => {
      markDataDirty();
      return ldb.insert<Partial<Station>>("stations", {
        name: b.name ?? "",
        code: b.code ?? null,
        distanceFromHq: b.distanceFromHq ?? "below8",
        variableKm: b.variableKm ?? null,
        travelMin: b.travelMin ?? 0,
        travelMax: b.travelMax ?? 0,
      }) as unknown as Promise<Station>;
    },
    update: (b: Partial<Station>) => {
      markDataDirty();
      return ldb.update("stations", b.id as number, {
        name: b.name,
        code: b.code ?? null,
        distanceFromHq: b.distanceFromHq ?? "below8",
        variableKm: b.variableKm ?? null,
        travelMin: b.travelMin ?? 0,
        travelMax: b.travelMax ?? 0,
      }) as unknown as Promise<Station>;
    },
    remove: (id: number) => {
      markDataDirty();
      return ldb.remove("stations", id);
    },
  },

  staff: {
    list: async () => asc(await ldb.readTable<Staff>("staff"), "name"),
    create: (b: Partial<Staff>) => {
      markDataDirty();
      return ldb.insert("staff", {
        name: b.name ?? "",
        designation: b.designation ?? null,
        pfNo: b.pfNo ?? null,
        buNo: b.buNo ?? null,
        phone: b.phone ?? null,
        email: b.email ?? null,
        department: b.department ?? null,
        payMetric: b.payMetric ?? null,
        pay: b.pay ?? null,
        taRate: b.taRate ?? null,
        stationIds: Array.isArray(b.stationIds) ? b.stationIds : [],
        headquartersStationId: b.headquartersStationId ?? null,
        isCurrentUser: b.isCurrentUser ?? false,
      }) as unknown as Promise<Staff>;
    },
    update: (b: Partial<Staff>) => {
      markDataDirty();
      return ldb.update("staff", b.id as number, {
        name: b.name,
        designation: b.designation ?? null,
        pfNo: b.pfNo ?? null,
        buNo: b.buNo ?? null,
        phone: b.phone ?? null,
        email: b.email ?? null,
        department: b.department ?? null,
        payMetric: b.payMetric ?? null,
        pay: b.pay ?? null,
        taRate: b.taRate ?? null,
        stationIds: Array.isArray(b.stationIds) ? b.stationIds : [],
        headquartersStationId: b.headquartersStationId ?? null,
        isCurrentUser: b.isCurrentUser ?? false,
      }) as unknown as Promise<Staff>;
    },
    remove: (id: number) => {
      markDataDirty();
      return ldb.remove("staff", id);
    },
  },

  tags: {
    list: async () => asc(await ldb.readTable<Tag>("tags"), "name"),
    create: (b: Partial<Tag>) => {
      // Only persist reminder fields when the caller set them explicitly —
      // otherwise the tag stays "unconfigured" and inherits the default rules.
      const row: Record<string, unknown> = {
        name: b.name ?? "",
        color: b.color ?? "#2563eb",
        needsSide: Boolean(b.needsSide),
      };
      if (b.remindEnabled !== undefined && b.remindEnabled !== null) {
        row.remindEnabled = b.remindEnabled;
        row.remindIntervalDays = b.remindIntervalDays ?? null;
        row.remindBeforeDays = b.remindBeforeDays ?? null;
      }
      markDataDirty();
      return ldb.insert("tags", row) as unknown as Promise<Tag>;
    },
    update: (b: Partial<Tag>) => {
      markDataDirty();
      return ldb.update("tags", b.id as number, {
        name: b.name ?? "",
        color: b.color ?? "#2563eb",
        needsSide: Boolean(b.needsSide),
        remindEnabled: b.remindEnabled ?? false,
        remindIntervalDays: b.remindIntervalDays ?? null,
        remindBeforeDays: b.remindBeforeDays ?? null,
      }) as unknown as Promise<Tag>;
    },
    remove: async (id: number) => {
      const rows = await ldb.readTable<Tag>("tags");
      const tag = rows.find((r) => r.id === id);
      if (tag?.name) await ldb.recordDeletedDefaultTag(tag.name);
      markDataDirty();
      return ldb.remove("tags", id);
    },
  },

  logs: {
    // staffId is accepted for call-site compatibility; on a single offline
    // device every entry belongs to this device, so nothing is filtered out.
    list: async (_staffId?: number | null) => {
      void _staffId;
      const rows = await ldb.readTable<DailyLog>("dailyLogs");
      return desc(
        rows.map((r) => ({
          ...r,
          hasDisconnections: Boolean(r.hasDisconnections),
          discSpecialWork: num(r.discSpecialWork),
          discFailure: num(r.discFailure),
          discMaintenance: num(r.discMaintenance),
          discNotPermitted: num(r.discNotPermitted),
          counterResets: counterResetsOf(r),
        })),
        "logDate"
      );
    },
    create: (b: Partial<DailyLog>) => {
      const row = normaliseLog(b);
      markDayDirty(row.logDate);
      return ldb.insert("dailyLogs", row) as unknown as Promise<DailyLog>;
    },
    update: async (b: Partial<DailyLog>) => {
      const row = normaliseLog(b);
      markDayDirty(row.logDate);
      const old = (await ldb.readTable<DailyLog>("dailyLogs")).find((r) => r.id === b.id);
      if (old?.logDate && old.logDate !== row.logDate) markDayDirty(old.logDate);
      return ldb.update("dailyLogs", b.id as number, row) as unknown as Promise<DailyLog>;
    },
    remove: async (id: number) => {
      const old = (await ldb.readTable<DailyLog>("dailyLogs")).find((r) => r.id === id);
      if (old?.logDate) markDayDirty(old.logDate);
      return ldb.remove("dailyLogs", id);
    },
  },

  deficiencies: {
    list: async () => desc(await ldb.readTable<DeficiencyTask>("deficiencyTasks"), "createdAt"),
    create: async (b: Partial<DeficiencyTask>) => {
      markDataDirty();
      return ldb.insert("deficiencyTasks", {
        department: b.department ?? "Signalling",
        stationId: b.stationId ?? null,
        title: b.title ?? "",
        description: b.description ?? null,
        priority: b.priority ?? "Normal",
        dueDate: b.dueDate || null,
        assignedStaffId: await staffForStation(b.stationId ?? null),
        status: b.status ?? "Pending",
        selectedForTomorrow: false,
        attachments: b.attachments ?? [],
        completedAt: null,
      }) as unknown as Promise<DeficiencyTask>;
    },
    update: async (b: Partial<DeficiencyTask>) => {
      markDataDirty();
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
      if (b.attachments !== undefined) patch.attachments = b.attachments;
      if (b.status !== undefined) {
        patch.status = b.status;
        patch.completedAt = b.status === "Completed" ? new Date().toISOString() : null;
        if (b.status === "Completed") patch.selectedForTomorrow = false;
      }
      return ldb.update("deficiencyTasks", b.id as number, patch) as unknown as Promise<DeficiencyTask>;
    },
    remove: (id: number) => {
      markDataDirty();
      return ldb.remove("deficiencyTasks", id);
    },
  },

  planned: {
    list: async (_staffId?: number | null) => {
      void _staffId;
      return desc(await ldb.readTable<PlannedWork>("plannedWorks"), "plannedDate");
    },
    create: (b: Partial<PlannedWork>) => {
      markDataDirty();
      return ldb.insert("plannedWorks", {
        title: b.title ?? "",
        description: b.description ?? null,
        plannedDate: b.plannedDate ?? "",
        stationId: b.stationId ?? null,
        convertFromId: b.convertFromId ?? null,
        department: b.department ?? "Signalling",
        materialRemarks: b.materialRemarks ?? null,
        ownerStaffId: b.ownerStaffId ?? null,
        status: b.status ?? "Pending",
        selectedForTomorrow: false,
        notified: false,
        attachments: b.attachments ?? [],
        completedAt: null,
      }) as unknown as Promise<PlannedWork>;
    },
    update: (b: Partial<PlannedWork>) => {
      markDataDirty();
      const patch: Record<string, unknown> = {};
      for (const k of [
        "title",
        "description",
        "plannedDate",
        "stationId",
        "department",
        "materialRemarks",
        "selectedForTomorrow",
        "notified",
      ] as const) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      if (b.attachments !== undefined) patch.attachments = b.attachments;
      if (b.status !== undefined) {
        patch.status = b.status;
        patch.completedAt = b.status === "Completed" ? new Date().toISOString() : null;
        if (b.status === "Completed") patch.selectedForTomorrow = false;
      }
      return ldb.update("plannedWorks", b.id as number, patch) as unknown as Promise<PlannedWork>;
    },
    remove: (id: number) => {
      markDataDirty();
      return ldb.remove("plannedWorks", id);
    },
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
    create: (b: Partial<Note>) => {
      markDataDirty();
      return ldb.insert("notes", {
        title: b.title ?? "",
        body: b.body ?? null,
        category: b.category ?? "General",
        stationId: b.stationId ?? null,
        refDate: b.refDate || null,
        pinned: Boolean(b.pinned),
        attachments: Array.isArray(b.attachments) ? b.attachments : [],
        ownerStaffId: b.ownerStaffId ?? null,
        updatedAt: new Date().toISOString(),
      }) as unknown as Promise<Note>;
    },
    update: (b: Partial<Note>) => {
      markDataDirty();
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const k of ["title", "body", "category", "stationId", "pinned", "attachments"] as const) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      if (b.refDate !== undefined) patch.refDate = b.refDate || null;
      return ldb.update("notes", b.id as number, patch) as unknown as Promise<Note>;
    },
    remove: (id: number) => {
      markDataDirty();
      return ldb.remove("notes", id);
    },
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
      markDataDirty();
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
      markDataDirty();
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
      if (current?.name) await ldb.recordDeletedDefaultCategory(current.name);
      markDataDirty();
      if (current) {
        const notes = await ldb.readTable<Note>("notes");
        for (const n of notes.filter((x) => x.category === current.name)) {
          await ldb.update("notes", n.id, { category: "General" });
        }
      }
      await ldb.remove("noteCategories", id);
    },
  },

  materials: {
    list: async () => asc(await ldb.readTable<Material>("materials"), "name"),
    create: (b: Partial<Material>) => {
      markDataDirty();
      return ldb.insert("materials", {
        name: String(b.name ?? "").trim() || "Unnamed material",
        requiredQty: num(b.requiredQty),
        minRequiredSpare: num(b.minRequiredSpare),
        unit: b.unit ?? "Nos",
        equipment: String(b.equipment ?? "").trim() || "general",
      }) as unknown as Promise<Material>;
    },
    update: (b: Partial<Material>) => {
      markDataDirty();
      return ldb.update("materials", b.id as number, {
        name: String(b.name ?? "").trim() || "Unnamed material",
        requiredQty: num(b.requiredQty),
        minRequiredSpare: num(b.minRequiredSpare),
        unit: b.unit ?? "Nos",
        equipment: String(b.equipment ?? "").trim() || "general",
      }) as unknown as Promise<Material>;
    },
    remove: async (id: number) => {
      markDataDirty();
      // Receipts, usages and transfers belong to the material — remove them along with it.
      const [receipts, usages, transfers] = await Promise.all([
        ldb.readTable<MaterialReceipt>("materialReceipts"),
        ldb.readTable<MaterialUsage>("materialUsages"),
        ldb.readTable<MaterialTransfer>("materialTransfers"),
      ]);
      await ldb.writeTable(
        "materialReceipts",
        receipts.filter((r) => r.materialId !== id)
      );
      await ldb.writeTable(
        "materialUsages",
        usages.filter((u) => u.materialId !== id)
      );
      await ldb.writeTable(
        "materialTransfers",
        transfers.filter((t) => t.materialId !== id)
      );
      return ldb.remove("materials", id);
    },
    /** Remove a material from a single station only: its requirement override,
     *  receipts and usages at that station. The material itself is only deleted
     *  when nothing is left of it — no requirement at any other station and no
     *  stock recorded anywhere. */
    removeFromStation: async (materialId: number, stationId: number) => {
      markDataDirty();
      const [stations, receipts, usages, transfers] = await Promise.all([
        ldb.readTable<MaterialStation>("materialStations"),
        ldb.readTable<MaterialReceipt>("materialReceipts"),
        ldb.readTable<MaterialUsage>("materialUsages"),
        ldb.readTable<MaterialTransfer>("materialTransfers"),
      ]);
      await ldb.writeTable(
        "materialStations",
        stations.filter((r) => !(r.materialId === materialId && r.stationId === stationId))
      );
      await ldb.writeTable(
        "materialReceipts",
        receipts.filter((r) => !(r.materialId === materialId && r.stationId === stationId))
      );
      await ldb.writeTable(
        "materialUsages",
        usages.filter((u) => !(u.materialId === materialId && u.stationId === stationId))
      );
      await ldb.writeTable(
        "materialTransfers",
        transfers.filter(
          (t) =>
            !(
              t.materialId === materialId &&
              (t.fromStationId === stationId || t.toStationId === stationId)
            )
        )
      );
      const stillAssigned = stations.some(
        (r) => r.materialId === materialId && r.stationId !== stationId
      );
      const stillStock =
        receipts.some((r) => r.materialId === materialId && r.stationId !== stationId) ||
        usages.some((u) => u.materialId === materialId && u.stationId !== stationId) ||
        transfers.some(
          (t) => t.materialId === materialId && (t.fromStationId !== stationId || t.toStationId !== stationId)
        );
      if (!stillAssigned && !stillStock) {
        await ldb.remove("materials", materialId);
      }
    },
  },

  equipmentTypes: {
    list: async () => asc(await ldb.readTable<EquipmentType>("equipmentTypes"), "name"),
    create: async (b: Partial<EquipmentType>) => {
      const name = String(b.name ?? "").trim();
      if (!name) return { error: "Name is required" } as EquipmentType & { error?: string };
      const rows = await ldb.readTable<EquipmentType>("equipmentTypes");
      if (rows.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
        return { error: "That equipment already exists" } as EquipmentType & { error?: string };
      }
      markDataDirty();
      return ldb.insert("equipmentTypes", { name }) as unknown as Promise<EquipmentType & { error?: string }>;
    },
    remove: async (id: number) => {
      const rows = await ldb.readTable<EquipmentType>("equipmentTypes");
      const row = rows.find((e) => e.id === id);
      if (row?.name) await ldb.recordDeletedDefaultEquipment(row.name);
      markDataDirty();
      return ldb.remove("equipmentTypes", id);
    },
  },

  materialReceipts: {
    list: async (materialId?: number | null) => {
      const rows = await ldb.readTable<MaterialReceipt>("materialReceipts");
      return (materialId ? rows.filter((r) => r.materialId === materialId) : rows).sort((a, b) =>
        b.date.localeCompare(a.date)
      );
    },
    create: (b: Partial<MaterialReceipt>) => {
      markDataDirty();
      return ldb.insert("materialReceipts", {
        materialId: num(b.materialId),
        qty: num(b.qty),
        date: b.date || toISODate(new Date()),
        stationId: b.stationId ?? null,
        room: b.room ?? "",
        remarks: b.remarks ?? "",
      }) as unknown as Promise<MaterialReceipt>;
    },
    remove: async (id: number) => {
      markDataDirty();
      // Usage / transfer rows that pointed at this batch lose the link (their
      // own quantities and stations are unchanged).
      const [usages, transfers] = await Promise.all([
        ldb.readTable<MaterialUsage>("materialUsages"),
        ldb.readTable<MaterialTransfer>("materialTransfers"),
      ]);
      if (usages.some((u) => u.receiptId === id)) {
        await ldb.writeTable(
          "materialUsages",
          usages.map((u) => (u.receiptId === id ? { ...u, receiptId: null } : u))
        );
      }
      if (transfers.some((t) => t.receiptId === id)) {
        await ldb.writeTable(
          "materialTransfers",
          transfers.map((t) => (t.receiptId === id ? { ...t, receiptId: null } : t))
        );
      }
      return ldb.remove("materialReceipts", id);
    },
  },

  materialUsages: {
    list: async (materialId?: number | null) => {
      const rows = await ldb.readTable<MaterialUsage>("materialUsages");
      return (materialId ? rows.filter((r) => r.materialId === materialId) : rows).sort((a, b) =>
        b.date.localeCompare(a.date)
      );
    },
    create: (b: Partial<MaterialUsage>) => {
      markDataDirty();
      return ldb.insert("materialUsages", {
        materialId: num(b.materialId),
        qty: num(b.qty),
        date: b.date || toISODate(new Date()),
        purpose: b.purpose ?? "",
        stationId: b.stationId ?? null,
        receiptId: b.receiptId ?? null,
      }) as unknown as Promise<MaterialUsage>;
    },
    remove: (id: number) => {
      markDataDirty();
      return ldb.remove("materialUsages", id);
    },
  },

  materialTransfers: {
    list: async (materialId?: number | null) => {
      const rows = await ldb.readTable<MaterialTransfer>("materialTransfers");
      return (materialId ? rows.filter((r) => r.materialId === materialId) : rows).sort((a, b) =>
        b.date.localeCompare(a.date)
      );
    },
    create: (b: Partial<MaterialTransfer>) => {
      markDataDirty();
      return ldb.insert("materialTransfers", {
        materialId: num(b.materialId),
        qty: num(b.qty),
        date: b.date || toISODate(new Date()),
        fromStationId: b.fromStationId ?? null,
        toStationId: b.toStationId ?? null,
        receiptId: b.receiptId ?? null,
        room: b.room ?? "",
        remarks: b.remarks ?? "",
      }) as unknown as Promise<MaterialTransfer>;
    },
    remove: (id: number) => {
      markDataDirty();
      return ldb.remove("materialTransfers", id);
    },
  },

  /** Station-specific requirement overrides: how many of a material are required
   *  and what minimum spare must be kept in hand at one station. A material
   *  without a row here uses its own requiredQty / minRequiredSpare defaults. */
  materialStations: {
    list: async () => ldb.readTable<MaterialStation>("materialStations"),
    /** Create or update the requirement for one (material × station) pair. */
    upsert: async (b: {
      materialId: number;
      stationId: number;
      requiredQty: number;
      minRequiredSpare: number;
    }) => {
      markDataDirty();
      const rows = await ldb.readTable<MaterialStation>("materialStations");
      const existing = rows.find(
        (r) => r.materialId === b.materialId && r.stationId === b.stationId
      );
      if (existing) {
        await ldb.writeTable(
          "materialStations",
          rows.map((r) =>
            r.id === existing.id
              ? { ...r, requiredQty: num(b.requiredQty), minRequiredSpare: num(b.minRequiredSpare) }
              : r
          )
        );
        return { ...existing, requiredQty: num(b.requiredQty), minRequiredSpare: num(b.minRequiredSpare) } as MaterialStation;
      }
      return ldb.insert("materialStations", {
        materialId: num(b.materialId),
        stationId: num(b.stationId),
        requiredQty: num(b.requiredQty),
        minRequiredSpare: num(b.minRequiredSpare),
      }) as unknown as Promise<MaterialStation>;
    },
    remove: async (id: number) => {
      markDataDirty();
      return ldb.remove("materialStations", id);
    },
    removeForMaterialStation: async (materialId: number, stationId: number) => {
      markDataDirty();
      const rows = await ldb.readTable<MaterialStation>("materialStations");
      await ldb.writeTable(
        "materialStations",
        rows.filter((r) => !(r.materialId === materialId && r.stationId === stationId))
      );
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
    timeDep: b.timeDep ?? null,
    timeArr: b.timeArr ?? null,
    returnTimeDep: b.returnTimeDep ?? null,
    returnTimeArr: b.returnTimeArr ?? null,
    // Travel mode for the HQ → station journey and (when by train) its number
    travelMode: b.travelMode === "train" ? "train" : "road",
    travelTrainNo: b.travelTrainNo ?? null,
    // Travel mode for the station → HQ return journey and (when by train) its number
    returnMode: b.returnMode === "train" ? "train" : "road",
    returnTrainNo: b.returnTrainNo ?? null,
    // Custom export rows — when non-empty each leg becomes its own line in
    // the Diary and TA Journal exports; otherwise the default two-leg layout
    // is used. Stored as an empty array rather than null so the DB layer has
    // a stable shape regardless of whether the user toggled the editor on.
    journeyLegs: Array.isArray(b.journeyLegs) ? b.journeyLegs : [],
    movementKind: b.movementKind ?? null,
    leaveKind: b.leaveKind ?? null,
    crFrom: b.crFrom ?? null,
    workDone: b.workDone ?? null,
    ta: null,
    taPercent: num(b.taPercent, 100),
    taAtVariableKm: b.taAtVariableKm ?? null,
    ownerStaffId: b.ownerStaffId ?? null,
    pcdoWork: b.pcdoWork ?? null,
    pcdoWorks: Array.isArray(b.pcdoWorks) ? b.pcdoWorks : [],
    pcdoStationId: b.pcdoStationId ?? null,
    pcdoDate: b.pcdoDate || null,
    hasDisconnections: Boolean(b.hasDisconnections),
    discSpecialWork: num(b.discSpecialWork),
    discFailure: num(b.discFailure),
    discMaintenance: num(b.discMaintenance),
    discNotPermitted: num(b.discNotPermitted),
    counterResets: counterResetsOf(b),
    inspectionKind: b.inspectionKind ?? null,
    inspectionStationId: b.inspectionStationId ?? null,
    inspectionTowardsStationId: b.inspectionTowardsStationId ?? null,
    inspectionJointDept: b.inspectionJointDept ?? null,
    inspectionPeriodicity: b.inspectionPeriodicity ?? null,
    inspectionRemindDays: b.inspectionRemindDays ?? null,
    inspectionSide: b.inspectionSide ?? null,
    footplateShift: b.footplateShift ?? null,
    footplateDirection: b.footplateDirection ?? null,
    footplateUp: b.footplateUp ?? null,
    footplateDown: b.footplateDown ?? null,
    footplateDay: b.footplateDay ?? null,
    footplateNight: b.footplateNight ?? null,
    footplateJourney: b.footplateJourney ?? null,
    footplateJourneys: Array.isArray(b.footplateJourneys) ? b.footplateJourneys : [],
    extraStops: Array.isArray(b.extraStops) ? b.extraStops : [],
    tagIds: b.tagIds ?? [],
    tagSides: b.tagSides ?? {},
    attachments: b.attachments ?? [],
  };
}

/**
 * The PCDO special works of a log entry. New entries store a department-wise
 * list (`pcdoWorks`); older entries kept a single free-text `pcdoWork` with no
 * department — those are returned as one legacy entry under the "" department.
 */
export function pcdoWorkEntries(
  l:
    | { pcdoWorks?: PcdoWork[] | null; pcdoWork?: string | null }
    | null
    | undefined
): PcdoWork[] {
  if (!l) return [];
  const list = Array.isArray(l.pcdoWorks) && l.pcdoWorks.length > 0 ? l.pcdoWorks : null;
  if (list) return list;
  const legacy = (l.pcdoWork ?? "").trim();
  return legacy ? [{ department: "", work: legacy }] : [];
}

/** True when a daily log is a claimable TA day: a movement away from HQ to a
 *  station fixed above 8 km, or to a variable station where the log confirms
 *  the work was done at/after its KMs marker — at a claimable TA percent.
 *  A Footplate day is a working tour away from HQ (departure → return), so it
 *  always qualifies for TA — the rate stays the manual 100/70/30 pick. */
export function isTaClaimable(
  l: DailyLog,
  stations: Station[],
  hq: Station | null | undefined
): boolean {
  if (isSpecialMovement(l)) return false;
  const p = l.taPercent ?? 100;
  if (p !== 100 && p !== 70 && p !== 30) return false;
  // A Footplate day is a working tour away from HQ (departure → return), so
  // it always qualifies for TA — the rate stays the manual 100/70/30 pick.
  if (l.movementKind === "footplate") return true;
  const t = (l.stationMovement ?? "").trim().toLowerCase();
  if (!t) return false;
  if (hq && (t === (hq.name ?? "").toLowerCase() || (hq.code && t === hq.code.toLowerCase()))) {
    return false;
  }
  const st = stations.find(
    (s) => s.name.toLowerCase() === t || (s.code && s.code.toLowerCase() === t)
  );
  if (!st) return false;
  if (st.distanceFromHq === "variable") {
    if (l.taAtVariableKm !== true) return false;
  } else if (st.distanceFromHq !== "above8") {
    return false;
  }
  return true;
}

/** The counter resets recorded on a log entry, sanitised (an old entry that
 *  predates counter resets simply has none). */
export function counterResetsOf(
  l: { counterResets?: CounterReset[] | null } | null | undefined
): CounterReset[] {
  if (!l) return [];
  if (!Array.isArray(l.counterResets)) return [];
  return l.counterResets
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      equipment:
        r.equipment === "MSDAC" || r.equipment === "UFSBI Block Instrument" || r.equipment === "BPAC"
          ? r.equipment
          : "MSDAC",
      stationId: r.stationId ?? null,
      nextStationId: r.nextStationId ?? null,
      failures: num(r.failures),
      testing: num(r.testing),
    }))
    .filter((r) => r.failures > 0 || r.testing > 0);
}

/** Total counter resets (failure + testing) recorded on a log entry. */
export function counterResetTotal(l: { counterResets?: CounterReset[] | null } | null | undefined): number {
  return counterResetsOf(l).reduce((n, r) => n + r.failures + r.testing, 0);
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Money value rounded to paise (2 decimals) only — never to a whole rupee —
 * with Indian digit grouping. Decimal amounts keep their decimals ("192.85"),
 * whole rupees drop the trailing ".00" ("350"). Used by the TA Journal export
 * and its preview, which show the amount as entered, without rounding off.
 */
export function formatRupee(v: number): string {
  const x = Math.round(v * 100) / 100;
  return x.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function dayName(d: string | Date) {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

/** "Day,Night" (stored footplateShift) → "Day + Night" for display. */
export function formatFootplateShifts(shift: string | null | undefined) {
  return (shift ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" + ");
}

function isBlock(b: FootplateBlock | FootplateDetail | null | undefined): b is FootplateBlock {
  return Boolean(b && typeof b === "object" && "direction" in b);
}

/** "Day (Both) + Night (Up)" summary of a footplate entry, with legacy fallback. */
export function formatFootplateSummary(l: {
  footplateShift?: string | null;
  footplateDay?: FootplateBlock | null;
  footplateNight?: FootplateBlock | null;
  footplateDirection?: string | null;
}) {
  const parts: string[] = [];
  if (isBlock(l.footplateDay) && l.footplateDay.direction)
    parts.push(`Day (${l.footplateDay.direction})`);
  if (isBlock(l.footplateNight) && l.footplateNight.direction)
    parts.push(`Night (${l.footplateNight.direction})`);
  if (parts.length) return parts.join(" + ");
  const base = formatFootplateShifts(l.footplateShift);
  return l.footplateDirection ? `${base} (${l.footplateDirection})` : base;
}

/** Human-readable train list for a footplate entry (new Day/Night blocks, legacy UP/DN). */
export function footplateTrainList(l: {
  footplateDay?: FootplateBlock | FootplateDetail | null;
  footplateNight?: FootplateBlock | FootplateDetail | null;
  footplateUp?: FootplateDetail | null;
  footplateDown?: FootplateDetail | null;
}) {
  const parts: string[] = [];
  const push = (shift: string, b: FootplateBlock | FootplateDetail | null | undefined) => {
    if (!b) return;
    if (isBlock(b)) {
      if (b.up?.trainNo) parts.push(`${shift} UP ${b.up.trainNo}`);
      if (b.down?.trainNo) parts.push(`${shift} DN ${b.down.trainNo}`);
    } else if (b.trainNo) {
      parts.push(`${shift} ${b.trainNo}`);
    }
  };
  push("Day", l.footplateDay);
  push("Night", l.footplateNight);
  if (l.footplateUp?.trainNo) parts.push(`UP ${l.footplateUp.trainNo}`);
  if (l.footplateDown?.trainNo) parts.push(`DN ${l.footplateDown.trainNo}`);
  return parts.join(", ");
}

/** All Footplate rides on a log — `footplateJourneys` when present, else the first-ride columns. */
export function footplateRidesOf(l: {
  footplateJourneys?: FootplateRide[] | null;
  footplateJourney?: FootplateJourney | null;
  footplateDay?: FootplateBlock | FootplateDetail | null;
  footplateNight?: FootplateBlock | FootplateDetail | null;
  footplateShift?: string | null;
}): FootplateRide[] {
  if (Array.isArray(l.footplateJourneys) && l.footplateJourneys.length > 0) {
    return l.footplateJourneys;
  }
  if (l.footplateJourney) {
    return [
      {
        boardingStationId: l.footplateJourney.boardingStationId,
        otherEndStationId: l.footplateJourney.otherEndStationId,
        shift: l.footplateJourney.shift ?? l.footplateShift ?? null,
        day: (l.footplateDay as FootplateBlock) ?? null,
        night: (l.footplateNight as FootplateBlock) ?? null,
      },
    ];
  }
  if (l.footplateDay || l.footplateNight) {
    return [
      {
        boardingStationId: 0,
        otherEndStationId: 0,
        shift: l.footplateShift ?? null,
        day: (l.footplateDay as FootplateBlock) ?? null,
        night: (l.footplateNight as FootplateBlock) ?? null,
      },
    ];
  }
  return [];
}

export function footplateTrainListFromRide(ride: {
  day?: FootplateBlock | FootplateDetail | null;
  night?: FootplateBlock | FootplateDetail | null;
}) {
  return footplateTrainList({
    footplateDay: ride.day,
    footplateNight: ride.night,
  });
}

/** True when the log's inspection station or any Footplate ride endpoint matches. */
export function logMatchesInspectionStation(
  l: {
    inspectionStationId?: number | null;
    footplateJourneys?: FootplateRide[] | null;
    footplateJourney?: FootplateJourney | null;
    footplateDay?: FootplateBlock | FootplateDetail | null;
    footplateNight?: FootplateBlock | FootplateDetail | null;
    footplateShift?: string | null;
  },
  stationId: number
) {
  if (l.inspectionStationId === stationId) return true;
  return footplateRidesOf(l).some(
    (r) => r.boardingStationId === stationId || r.otherEndStationId === stationId
  );
}
