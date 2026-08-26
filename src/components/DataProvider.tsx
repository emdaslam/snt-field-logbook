"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { api, toISODate } from "@/lib/api";
import {
  computeInspectionDues,
  computeTagDues,
  INSPECTION_RULES,
  kindFromTagName,
  tagReminderConfigs,
} from "@/lib/inspections";
import { FONT_SIZE_ROOT, type AppTheme, type FontSize } from "@/lib/types";
import { isNative, scheduleDailyReminders } from "@/lib/native";
import { driveStatus, syncWithDrive, replaceDriveBackup, pullFromDrive, type DriveResult, type DriveProgress, type DriveConflictInfo } from "@/lib/drive";
import { lowStockAlerts, qtyWithUnit } from "@/lib/stock";
import { DriveConflictModal } from "./DriveConflictModal";
import type {
  Station,
  Staff,
  Tag,
  DailyLog,
  DeficiencyTask,
  PlannedWork,
  Note,
  NoteCategory,
  Material,
  MaterialReceipt,
  MaterialUsage,
  MaterialTransfer,
  MaterialStation,
} from "@/db/schema";

export type NotificationTarget =
  | { type: "log"; id: number }
  | { type: "deficiency"; id: number }
  | { type: "planned"; id: number }
  | { type: "materials" };

export type Notification = {
  id: string;
  title: string;
  detail: string;
  kind: "planned" | "due" | "inspection" | "tag" | "stock";
  /** Where tapping the notification should take the user */
  target?: NotificationTarget;
};

type Ctx = {
  loading: boolean;
  stations: Station[];
  staff: Staff[];
  tags: Tag[];
  logs: DailyLog[];
  deficiencies: DeficiencyTask[];
  planned: PlannedWork[];
  notes: Note[];
  noteCategories: NoteCategory[];
  notifications: Notification[];
  refresh: () => Promise<void>;
  stationName: (id: number | null) => string;
  staffName: (id: number | null) => string;
  currentUser: Staff | undefined;
  // Sync state
  online: boolean;
  syncing: boolean;
  driveSyncing: boolean;
  /** Live upload/download progress of a Drive backup or restore, or null when idle. */
  driveProgress: DriveProgress | null;
  lastSynced: Date | null;
  syncError: string | null;
  /** True while the local database has changes not yet pushed to Drive. */
  dirty: boolean;
  clearDirty: () => void;
  /** Manual Drive sync (may show the Google picker if not signed in). */
  doDriveSync: () => Promise<DriveResult>;
  // Appearance
  theme: AppTheme;
  setTheme: (v: AppTheme) => void;
  fontSize: FontSize;
  setFontSize: (v: FontSize) => void;
  // Scale (%) for the written content text (log entries, deficiencies, planned works)
  contentScale: number;
  setContentScale: (v: number) => void;
  // How many days before a due date to start warning (deficiency/planned work)
  reminderDays: number;
  setReminderDays: (v: number) => void;
  // Automatic Drive sync
  autoDriveSync: boolean;
  setAutoDriveSync: (v: boolean) => void;
  autoSync: () => Promise<void>;
  // Scope (mapped staff / stations)
  myStationsOnly: boolean;
  setMyStationsOnly: (v: boolean) => void;
  myStationIds: number[];
  myStationNames: string[];
  inScopeStation: (stationId: number | null) => boolean;
  inScopeMovement: (movement: string | null) => boolean;
};

const DataContext = createContext<Ctx | null>(null);

export function useData() {
  const c = useContext(DataContext);
  if (!c) throw new Error("useData must be used within DataProvider");
  return c;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState<Station[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [deficiencies, setDeficiencies] = useState<DeficiencyTask[]>([]);
  const [planned, setPlanned] = useState<PlannedWork[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteCategories, setNoteCategories] = useState<NoteCategory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialReceipts, setMaterialReceipts] = useState<MaterialReceipt[]>([]);
  const [materialUsages, setMaterialUsages] = useState<MaterialUsage[]>([]);
  const [materialTransfers, setMaterialTransfers] = useState<MaterialTransfer[]>([]);
  const [materialStations, setMaterialStations] = useState<MaterialStation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [driveSyncing, setDriveSyncing] = useState(false);
  const [driveProgress, setDriveProgress] = useState<DriveProgress | null>(null);
  const [driveConflict, setDriveConflict] = useState<DriveConflictInfo | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [myStationsOnly, setMyStationsOnlyState] = useState(false);
  const [fontSize, setFontSizeState] = useState<FontSize>("large");
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window === "undefined") return "light";
    try {
      return localStorage.getItem("snt.theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [autoDriveSync, setAutoDriveSyncState] = useState(true);
  const [reminderDays, setReminderDaysState] = useState(3);
  const [contentScale, setContentScaleState] = useState(100);

  const applyFontSize = useCallback((v: FontSize) => {
    if (typeof document !== "undefined") {
      document.documentElement.style.fontSize = FONT_SIZE_ROOT[v];
    }
  }, []);

  const applyTheme = useCallback((v: AppTheme) => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = v;
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const setTheme = useCallback((v: AppTheme) => {
    setThemeState(v);
    try {
      localStorage.setItem("snt.theme", v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("snt.fontSize");
      if (saved === "small" || saved === "medium" || saved === "large") {
        setFontSizeState(saved);
        applyFontSize(saved);
        return;
      }
    } catch {
      /* ignore */
    }
    applyFontSize("large");
  }, [applyFontSize]);

  const setFontSize = useCallback(
    (v: FontSize) => {
      setFontSizeState(v);
      applyFontSize(v);
      try {
        localStorage.setItem("snt.fontSize", v);
      } catch {
        /* ignore */
      }
    },
    [applyFontSize]
  );

  const setMyStationsOnly = useCallback((v: boolean) => {
    setMyStationsOnlyState(v);
    try {
      localStorage.setItem("snt.myStationsOnly", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      setMyStationsOnlyState(localStorage.getItem("snt.myStationsOnly") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const setReminderDays = useCallback((v: number) => {
    const clamped = Math.min(30, Math.max(1, Math.round(v) || 1));
    setReminderDaysState(clamped);
    try {
      localStorage.setItem("snt.reminderDays", String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("snt.reminderDays"));
      if (Number.isFinite(v) && v >= 1 && v <= 30) setReminderDaysState(Math.round(v));
    } catch {
      /* ignore */
    }
  }, []);

  const applyContentScale = useCallback((v: number) => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.contentScale = String(v);
    }
  }, []);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("snt.contentScale"));
      if (v === 100 || v === 125 || v === 150) {
        setContentScaleState(v);
        applyContentScale(v);
        return;
      }
    } catch {
      /* ignore */
    }
    applyContentScale(100);
  }, [applyContentScale]);

  const setContentScale = useCallback(
    (v: number) => {
      const s = v === 125 || v === 150 ? v : 100;
      setContentScaleState(s);
      applyContentScale(s);
      try {
        localStorage.setItem("snt.contentScale", String(s));
      } catch {
        /* ignore */
      }
    },
    [applyContentScale]
  );

  const setAutoDriveSync = useCallback((v: boolean) => {
    setAutoDriveSyncState(v);
    try {
      localStorage.setItem("snt.autoDriveSync", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      setAutoDriveSyncState(localStorage.getItem("snt.autoDriveSync") !== "0");
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      // Identify who we are first — private data is scoped to this staff member
      const sfPre = await api.staff.list();
      const meId = sfPre.find((s) => s.isCurrentUser)?.id ?? null;
      const [st, sf, tg, lg, df, pl, nt, nc, mt, rc, us, tr, ms] = await Promise.all([
        api.stations.list(),
        Promise.resolve(sfPre),
        api.tags.list(),
        api.logs.list(meId),
        api.deficiencies.list(),
        api.planned.list(meId),
        api.notes.list(),
        api.noteCategories.list(),
        api.materials.list(),
        api.materialReceipts.list(),
        api.materialUsages.list(),
        api.materialTransfers.list(),
        api.materialStations.list(),
      ]);
      setStations(st);
      setStaff(sf);
      setTags(tg);
      setLogs(lg);
      setDeficiencies(df);
      setPlanned(pl);
      setNotes(nt);
      setNoteCategories(nc);
      setMaterials(mt);
      setMaterialReceipts(rc);
      setMaterialUsages(us);
      setMaterialTransfers(tr);
      setMaterialStations(ms);
      setLastSynced(new Date());
      setSyncError(null);
      setOnline(true);
    } catch (e) {
      setSyncError(String(e));
      setOnline(false);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  /**
   * Manual Drive sync — the "Sync" button in the header and Settings. Runs in
   * the Android app and may show the Google account picker when there is no
   * session yet. Clears the pending-changes flag on success.
   */
  const doDriveSync = useCallback(
    async (interactive = true): Promise<DriveResult> => {
      setDriveSyncing(true);
      setDriveProgress(null);
      try {
        const r = await syncWithDrive(interactive, setDriveProgress);
        if (r.ok) {
          setDirty(false);
          if (r.imported) await refresh();
        } else if (r.conflict) {
          // The device data and the account's backup differ — ask which to keep.
          setDriveConflict(r.conflict);
        }
        return r;
      } finally {
        setDriveSyncing(false);
        setDriveProgress(null);
      }
    },
    [refresh]
  );

  /** Carry out the side the user picked in the conflict dialog. */
  const resolveDriveConflict = useCallback(
    async (direction: "push" | "pull") => {
      setDriveSyncing(true);
      setDriveProgress(null);
      try {
        const r =
          direction === "push"
            ? await replaceDriveBackup(true, setDriveProgress)
            : await pullFromDrive(true, setDriveProgress);
        if (r.ok) {
          setDirty(false);
          if (direction === "pull") await refresh();
        }
      } finally {
        setDriveSyncing(false);
        setDriveProgress(null);
        setDriveConflict(null);
      }
    },
    [refresh]
  );

  /**
   * Automatic Drive sync — silent and best-effort. Runs only in the Android
   * app when auto-sync is switched on and the user is signed in to Drive.
   * Never shows the account picker; failures are ignored. Marks the database
   * as having pending changes, which the sync icon surfaces, and clears that
   * flag only once the local data has actually been pushed to Drive.
   */
  const autoSync = useCallback(async () => {
    setDirty(true);
    if (!autoDriveSync) return;
    if (!isNative()) return;
    if (!driveStatus().email) return;
    await doDriveSync(false);
  }, [autoDriveSync, doDriveSync]);

  useEffect(() => {
    (async () => {
      try {
        await api.seed();
      } catch {
        /* first run may race; refresh anyway */
      }
      await refresh();
      // First app-open of the day: sync once automatically. The stamp is only
      // written when a sync was actually attempted, so signing in to Drive or
      // switching auto-sync on later in the day still triggers it on the next
      // app open.
      try {
        const day = toISODate(new Date());
        if (localStorage.getItem("snt.drive.lastAutoSyncDay") === day) return;
        if (!autoDriveSync) return;
        if (!isNative() || !driveStatus().email) return;
        await doDriveSync(false);
        localStorage.setItem("snt.drive.lastAutoSyncDay", day);
      } catch {
        /* auto-sync is best-effort — silent */
      }
    })();
  }, [refresh, autoDriveSync, doDriveSync]);

  // Offline app: nothing to poll. We only re-read local storage when the app
  // regains focus, in case another tab/window changed something.
  useEffect(() => {
    const POLL_MS = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer || POLL_MS <= 0) return;
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        refresh();
      }, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    start();

    const onFocus = () => refresh();
    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    const onVisibility = () => {
      if (!document.hidden) refresh();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      setOnline(navigator.onLine);
    }

    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Notification logic: planned works & deficiencies within the configurable
  // reminder window (default 3 days prior), plus overdue items.
  useEffect(() => {
    const stationNameFor = (id: number | null) =>
      stations.find((s) => s.id === id)?.name ?? "Unassigned";
    const notes: Notification[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const warnUntil = new Date(today);
    warnUntil.setDate(today.getDate() + reminderDays);

    for (const p of planned) {
      if (p.status !== "Pending") continue;
      const pd = new Date(p.plannedDate + "T00:00:00");
      if (pd <= warnUntil && pd >= today) {
        const days = Math.round((pd.getTime() - today.getTime()) / 86400000);
        notes.push({
          id: "plan-" + p.id,
          title: p.title,
          detail: `Planned work ${days === 0 ? "today" : `in ${days} day${days > 1 ? "s" : ""}`} (${p.plannedDate}) · ${stationNameFor(p.stationId)}`,
          kind: "planned",
          target: { type: "planned", id: p.id },
        });
      }
    }
    for (const d of deficiencies) {
      if (d.status !== "Pending" || !d.dueDate) continue;
      const dd = new Date(d.dueDate + "T00:00:00");
      if (dd <= warnUntil) {
        const overdue = dd < today;
        notes.push({
          id: "def-" + d.id,
          title: d.title,
          detail:
            (overdue ? `Overdue (due ${d.dueDate})` : `Due soon (${d.dueDate})`) +
            ` · ${stationNameFor(d.stationId)}`,
          kind: "due",
          target: { type: "deficiency", id: d.id },
        });
      }
    }
    // Periodic inspection reminders (monthly / fortnightly maintenance / quarterly)
    const resolveInspStation = (r: {
      inspectionStationId?: number | null;
      inspectionTowardsStationId?: number | null;
      inspectionSide?: string | null;
      inspectionJointDept?: string | null;
      stationMovement?: string | null;
    }) => {
      const at = stations.find((s) => s.id === r.inspectionStationId);
      const tw = stations.find((s) => s.id === r.inspectionTowardsStationId);
      const both = r.inspectionSide === "Both";
      return {
        id: at?.id ?? null,
        name: at?.name ?? ((r.stationMovement || "").trim() || "Unspecified station"),
        towardsId: both ? null : (tw?.id ?? null),
        towards: both ? "Both sides" : (tw?.name ?? "Unspecified side"),
      };
    };
    for (const due of computeInspectionDues(
      logs,
      toISODate(new Date()),
      resolveInspStation,
      tagReminderConfigs(tags)
    )) {
      const rule = INSPECTION_RULES[due.kind];
      // The "towards … side" phrasing is only shown when the user explicitly
      // selected the side (asks-for-side) on the tag driving this schedule;
      // otherwise notifications stay station-only.
      const sideChosen =
        due.kind !== "footplate" &&
        due.towards &&
        due.towards !== "Unspecified side" &&
        tags.some((t) => t.needsSide && kindFromTagName(t.name) === due.kind);
      notes.push({
        id: "insp-" + due.key,
        title:
          `${rule.label} — ${due.station}` +
          (due.jointDept ? ` (with ${due.jointDept})` : ""),
        detail:
          (due.overdue
            ? `Overdue by ${Math.abs(due.daysLeft)} day${Math.abs(due.daysLeft) !== 1 ? "s" : ""} (was due ${due.nextDue})`
            : due.daysLeft === 0
              ? `Due today (${due.nextDue})`
              : `Due in ${due.daysLeft} day${due.daysLeft !== 1 ? "s" : ""} (${due.nextDue})`) +
          (sideChosen
            ? ` · at ${due.station}, towards ${due.towards} side`
            : ` · at ${due.station}`) +
          (due.jointDept ? ` with ${due.jointDept}` : ""),
        kind: "inspection",
        target: due.sourceLogId ? { type: "log", id: due.sourceLogId } : undefined,
      });
    }
    // Reminders for custom tags with "Remind me" switched on in Settings
    for (const due of computeTagDues(logs, tags, toISODate(new Date()))) {
      notes.push({
        id: "tag-" + due.tagId,
        title: `${due.tagName} — due ${due.nextDue}`,
        detail:
          (due.overdue
            ? `Overdue by ${Math.abs(due.daysLeft)} day${Math.abs(due.daysLeft) !== 1 ? "s" : ""} (last done ${due.lastDone})`
            : due.daysLeft === 0
              ? `Due today (last done ${due.lastDone})`
              : `Due in ${due.daysLeft} day${due.daysLeft !== 1 ? "s" : ""} (last done ${due.lastDone})`),
        kind: "tag",
        target: due.sourceLogId ? { type: "log", id: due.sourceLogId } : undefined,
      });
    }

    // Low-stock alerts — a station's in-hand balance for a material fell below
    // that station's effective minimum required spare.
    for (const a of lowStockAlerts(materials, materialStations, materialReceipts, materialUsages, stationNameFor, materialTransfers)) {
      notes.push({
        id: `stock-${a.material.id}-${a.stationId ?? "unassigned"}`,
        title: `${a.material.name} — low stock`,
        detail: `Only ${qtyWithUnit(a.inHand, a.material.unit)} in hand at ${a.stationLabel}, minimum required ${qtyWithUnit(a.minRequiredSpare, a.material.unit)}`,
        kind: "stock",
        target: { type: "materials" },
      });
    }

    setNotifications(notes);
  }, [planned, deficiencies, logs, stations, tags, reminderDays, materials, materialStations, materialReceipts, materialUsages, materialTransfers]);

  /** True when the current user already made a log entry for today. */
  const hasEntryToday = useMemo(() => {
    const today = toISODate(new Date());
    return logs.some((l) => l.logDate === today);
  }, [logs]);

  // Keep the phone's notification panel in sync: four reminders a day
  // (8:00 / 12:00 / 16:00 / 20:00) but only while something is actually
  // pending. Each reminder lists the pending items with their full detail.
  // When today's log entry is still missing, four "no entry today" reminders
  // (9:00 / 12:00 / 15:00 / 18:00) nag until the entry is added.
  // Only runs on the Android app.
  useEffect(() => {
    if (!isNative()) return;
    scheduleDailyReminders(
      notifications.map((n) => ({ kind: n.kind, title: n.title, detail: n.detail })),
      { noEntryToday: !hasEntryToday }
    );
  }, [notifications, hasEntryToday]);

  const stationName = useCallback(
    (id: number | null) => stations.find((s) => s.id === id)?.name ?? "Unassigned",
    [stations]
  );
  const staffName = useCallback(
    (id: number | null) => staff.find((s) => s.id === id)?.name ?? "Unassigned",
    [staff]
  );
  const currentUser = staff.find((s) => s.isCurrentUser);

  // Stations mapped to the signed-in staff member
  const myStationIds = useMemo(() => currentUser?.stationIds ?? [], [currentUser]);
  const myStationNames = useMemo(
    () =>
      myStationIds
        .map((id) => stations.find((s) => s.id === id)?.name)
        .filter((n): n is string => Boolean(n)),
    [myStationIds, stations]
  );

  const inScopeStation = useCallback(
    (stationId: number | null) => {
      if (!myStationsOnly) return true;
      if (myStationIds.length === 0) return true;
      return stationId != null && myStationIds.includes(stationId);
    },
    [myStationsOnly, myStationIds]
  );

  const inScopeMovement = useCallback(
    (movement: string | null) => {
      if (!myStationsOnly) return true;
      if (myStationNames.length === 0) return true;
      if (!movement) return false;
      const m = movement.toLowerCase();
      return myStationNames.some((n) => m.includes(n.toLowerCase()));
    },
    [myStationsOnly, myStationNames]
  );

  return (
    <DataContext.Provider
      value={{
        loading,
        stations,
        staff,
        tags,
        logs,
        deficiencies,
        planned,
        notes,
        noteCategories,
        notifications,
        refresh,
        stationName,
        staffName,
        currentUser,
        online,
        syncing,
        driveSyncing,
        driveProgress,
        lastSynced,
        syncError,
        dirty,
        clearDirty: () => setDirty(false),
        doDriveSync,
        myStationsOnly,
        setMyStationsOnly,
        myStationIds,
        myStationNames,
        inScopeStation,
        inScopeMovement,
        fontSize,
        setFontSize,
        theme,
        setTheme,
        contentScale,
        setContentScale,
        reminderDays,
        setReminderDays,
        autoDriveSync,
        setAutoDriveSync,
        autoSync,
      }}
    >
      {children}
      {driveConflict && (
        <DriveConflictModal
          conflict={driveConflict}
          busy={driveSyncing}
          onClose={() => setDriveConflict(null)}
          onPush={() => void resolveDriveConflict("push")}
          onPull={() => void resolveDriveConflict("pull")}
        />
      )}
    </DataContext.Provider>
  );
}
