"use client";

import { useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { useData, type Notification } from "./DataProvider";
import { Calendar } from "./Calendar";
import { Timeline } from "./Timeline";
import { TaskManager } from "./TaskManager";
import { SearchView } from "./SearchView";
import { Settings } from "./Settings";
import { Notes } from "./Notes";
import { Reports } from "./Reports";
import { AttachmentsView } from "./AttachmentsView";
import { Materials } from "./Materials";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { MonthlyExportModal } from "./MonthlyExportModal";
import { TomorrowWorkModal } from "./TomorrowWorkModal";
import { PcdoExportModal } from "./PcdoExportModal";
import { LogDetailModal } from "./LogDetailModal";
import { DiaryExportModal } from "./DiaryExportModal";
import { InspectionExportModal } from "./InspectionExportModal";
import { DailyLogForm, DeficiencyForm, PlannedWorkForm } from "./Forms";
import { Onboarding } from "./Onboarding";
import { FeatureTutorials } from "./FeatureTutorials";
import { getPendingTutorials, markTutorialsSeen, type VersionTutorial } from "@/lib/tutorials";
import { isNative } from "@/lib/native";
import { tryCloseTop } from "@/lib/backButton";
import { APP_VERSION_BASE } from "@/lib/types";
import { toISODate, fmtDate } from "@/lib/api";
import { footplateDotColor, isFootplateLog } from "@/lib/movements";
import type { DailyLog, Attachment, DeficiencyTask, PlannedWork, Note } from "@/db/schema";

type View = "home" | "tasks" | "search" | "reports" | "notes" | "attachments" | "materials" | "settings";

export function AppShell() {
  const {
    loading,
    logs,
    tags,
    deficiencies,
    planned,
    notifications,
    currentUser,
    stations,
    refresh,
    syncing: autoSyncing,
    driveSyncing,
    driveProgress,
    dirty,
    doDriveSync,
    lastSynced,
    myStationsOnly,
    setMyStationsOnly,
    myStationNames,
  } = useData();
  const [view, setView] = useState<View>("home");
  // Tab history for the Android back button: each user tab change remembers
  // the tab it left, so back (with no overlay open) returns there instead of
  // jumping straight to Home.
  const viewHistory = useRef<View[]>([]);
  const go = (v: View) => {
    if (v === view) return;
    viewHistory.current.push(view);
    if (viewHistory.current.length > 24) viewHistory.current.shift();
    setView(v);
  };
  const [drawer, setDrawer] = useState(false);
  const [calCollapsed, setCalCollapsed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  // Bumped on every explicit "go to date" so the timeline re-scrolls even when
  // the target equals the currently selected date (which otherwise bails out of
  // the state change after the user scrolled the list away on their own).
  const [goToSignal, setGoToSignal] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);


  const [exportMenu, setExportMenu] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [tomorrowOpen, setTomorrowOpen] = useState(false);
  const [pcdoOpen, setPcdoOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [taOpen, setTaOpen] = useState(false);
  const [inspOpen, setInspOpen] = useState(false);
  const [exitToast, setExitToast] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("snt.onboardingDone") === "1";
    } catch {
      return false;
    }
  });
  const showOnboarding = !onboardingDone && stations.length === 0;

  // "What's New" tutorials for every major change the user has not seen yet.
  // Computed once from the version whose tutorials were last finished; hidden
  // while onboarding runs and cleared by the Tutorials modal when it closes.
  const [tutorialQueue, setTutorialQueue] = useState<VersionTutorial[]>(() =>
    typeof window === "undefined" ? [] : getPendingTutorials(),
  );

  // Close the header dropdowns when tapping anywhere outside them
  useEffect(() => {
    if (!notifOpen && !exportMenu) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const inNotif =
        (notifRef.current && notifRef.current.contains(t)) ||
        (notifPanelRef.current && notifPanelRef.current.contains(t));
      if (notifOpen && !inNotif) setNotifOpen(false);
      if (exportMenu && exportRef.current && !exportRef.current.contains(t)) setExportMenu(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setNotifOpen(false); setExportMenu(false); }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onEsc);
    };
  }, [notifOpen, exportMenu]);

  const [fabOpen, setFabOpen] = useState(false);
  const [logForm, setLogForm] = useState(false);
  const [editLog, setEditLog] = useState<DailyLog | null>(null);
  const [detailLog, setDetailLog] = useState<DailyLog | null>(null);
  const [selAttachment, setSelAttachment] = useState<Attachment | null>(null);
  const [searchDef, setSearchDef] = useState<DeficiencyTask | null>(null);
  const [searchPlan, setSearchPlan] = useState<PlannedWork | null>(null);
  // A note picked in Global Search — the Notes screen opens it expanded.
  const [searchNote, setSearchNote] = useState<Note | null>(null);
  // A material picked in Global Search — the Materials screen opens it expanded.
  const [searchMaterial, setSearchMaterial] = useState<number | null>(null);
  const [taskTab, setTaskTab] = useState<"deficiencies" | "planned" | "archive">("deficiencies");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [reportsDrill, setReportsDrill] = useState(false);
  const closeReportsDrill = useRef<() => void>(() => {});

  function openNotification(n: (typeof notifications)[number]) {
    setNotifOpen(false);
    const t = n.target;
    if (!t) return;
    if (t.type === "log") {
      const l = logs.find((x) => x.id === t.id);
      if (l) {
        go("home");
        setSelectedDate(l.logDate);
        setDetailLog(l);
      }
      return;
    }
    if (t.type === "deficiency") {
      if (deficiencies.some((d) => d.id === t.id)) {
        setTaskTab("deficiencies");
        go("tasks");
        setHighlightId("def-" + t.id);
      }
      return;
    }
    if (t.type === "planned") {
      if (planned.some((p) => p.id === t.id)) {
        setTaskTab("planned");
        go("tasks");
        setHighlightId("plan-" + t.id);
      }
      return;
    }
    if (t.type === "materials") {
      go("materials");
    }
  }
  const [defForm, setDefForm] = useState(false);
  const [planForm, setPlanForm] = useState(false);

  // Suggested "Affected Station" for a new deficiency: the station of the most
  // recent daily log entry (logs arrive newest-first). The user can change it.
  const defaultDefStationId = useMemo(() => {
    for (const l of logs) {
      const m = stations.find((s) => l.stationMovement === s.name);
      if (m) return m.id;
      const pcdoSt = Array.isArray(l.pcdoEntries)
        ? l.pcdoEntries.find((e) => e.stationId != null)?.stationId
        : null;
      if (pcdoSt) return pcdoSt;
      if (l.pcdoStationId) return l.pcdoStationId;
    }
    return null;
  }, [logs, stations]);

  const exitToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBack = useRef(0);

  // Latest overlay/view state read by the native back-button handler
  const shellState = useRef({
    view,
    detailLog,
    selAttachment,
    searchDef,
    searchPlan,
    editLog,
    logForm,
    defForm,
    planForm,
    fabOpen,
    drawer,
    monthlyOpen,
    tomorrowOpen,
    pcdoOpen,
    diaryOpen,
    taOpen,
    inspOpen,
    notifOpen,
    exportMenu,
    reportsDrill,
  });
  // Keep the snapshot fresh for the back-button handler (runs after commit,
  // so the handler always sees the latest overlay / view state)
  useEffect(() => {
    shellState.current = {
      view,
      detailLog,
      selAttachment,
      searchDef,
      searchPlan,
      editLog,
      logForm,
      defForm,
      planForm,
      fabOpen,
      drawer,
      monthlyOpen,
      tomorrowOpen,
      pcdoOpen,
      diaryOpen,
      taOpen,
      inspOpen,
      notifOpen,
      exportMenu,
      reportsDrill,
    };
  });

  // Android back button: close whatever is on screen first (modal / sheet /
  // drawer / tab), and only exit the app after two presses while on Home.
  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => void } | undefined;
    (async () => {
      const { App } = await import("@capacitor/app");
      handle = await App.addListener("backButton", async () => {
        const s = shellState.current;
        // Overlays owned by the view components (Reports' export modals, the
        // attachment preview, local forms) register themselves here
        if (tryCloseTop()) return;
        const closeTop: (() => void) | undefined = (
          [
            [s.detailLog, () => setDetailLog(null)],
            [s.selAttachment, () => setSelAttachment(null)],
            [s.searchDef, () => setSearchDef(null)],
            [s.searchPlan, () => setSearchPlan(null)],
            [s.editLog, () => setEditLog(null)],
            [s.logForm, () => setLogForm(false)],
            [s.defForm, () => setDefForm(false)],
            [s.planForm, () => setPlanForm(false)],
            [s.fabOpen, () => setFabOpen(false)],
            [s.drawer, () => setDrawer(false)],
            [s.monthlyOpen, () => setMonthlyOpen(false)],
            [s.tomorrowOpen, () => setTomorrowOpen(false)],
            [s.pcdoOpen, () => setPcdoOpen(false)],
            [s.diaryOpen, () => setDiaryOpen(false)],
            [s.taOpen, () => setTaOpen(false)],
            [s.inspOpen, () => setInspOpen(false)],
            [s.notifOpen, () => setNotifOpen(false)],
            [s.exportMenu, () => setExportMenu(false)],
            [s.reportsDrill, () => closeReportsDrill.current()],
          ] as [boolean, () => void][]
        ).find(([open]) => open)?.[1];

        if (closeTop) {
          closeTop();
          return;
        }
        // No overlay: return to the previously visited tab, if any
        const hist = viewHistory.current;
        const prev = hist[hist.length - 1];
        if (prev && prev !== s.view) {
          hist.pop();
          setView(prev);
          return;
        }
        // No overlay: on a non-home tab, go back Home first
        if (s.view !== "home") {
          setView("home");
          return;
        }
        // On Home: two presses within 2s exit the app
        const now = Date.now();
        if (now - lastBack.current < 2000) {
          await App.exitApp();
        } else {
          lastBack.current = now;
          setExitToast(true);
          if (exitToastTimer.current) clearTimeout(exitToastTimer.current);
          exitToastTimer.current = setTimeout(() => setExitToast(false), 2000);
        }
      });
    })();
    return () => {
      handle?.remove();
    };
  }, []);

  const activeDates = useMemo(() => new Set(logs.map((l) => l.logDate)), [logs]);

  /**
   * The timeline can only show a continuous range spanning all known entries
   * (plus today and 45 days back). This computes that range as ISO dates.
   */
  const timelineBounds = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const all = [
      ...logs.map((l) => l.logDate),
      ...deficiencies.map((d) => d.dueDate ?? ""),
      ...planned.map((p) => p.plannedDate),
    ]
      .filter(Boolean)
      .sort();

    const maxKnown = all.length ? new Date(all[all.length - 1] + "T00:00:00") : today;
    const end = maxKnown > today ? maxKnown : today;

    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 45);
    const minKnown = all.length ? new Date(all[0] + "T00:00:00") : defaultStart;
    const start = minKnown < defaultStart ? minKnown : defaultStart;

    return { startIso: toISODate(start), endIso: toISODate(end) };
  };

  /** Clamp an ISO date to the timeline range; announces when it moved. */
  const clampToRange = (iso: string, announce: boolean): string => {
    const { startIso, endIso } = timelineBounds();
    if (iso > endIso) {
      if (announce) alert(`No entry beyond ${fmtDate(endIso)}`);
      return endIso;
    }
    if (iso < startIso) {
      if (announce) alert(`No entry before ${fmtDate(startIso)}`);
      return startIso;
    }
    return iso;
  };

  /**
   * "Go to date" from the calendar header. Picking a date outside the
   * timeline range has nothing to show, so we land on the nearest boundary
   * date and say so.
   */
  const goToDate = (iso: string) => {
    const target = clampToRange(iso, true);
    setSelectedDate(target);
    setFocusedDate(target);
    setCalCursor(new Date(Number(target.slice(0, 4)), Number(target.slice(5, 7)) - 1, 1));
    setGoToSignal((n) => n + 1);
  };

  /**
   * After swiping the calendar to another month, point the timeline at that
   * month's 1st. Out-of-range dates clamp silently to the nearest boundary.
   */
  const jumpToMonth = (d: Date) => {
    const iso = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
    const target = clampToRange(iso, false);
    setSelectedDate(target);
    setFocusedDate(target);
    setGoToSignal((n) => n + 1);
  };

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const dateTagColors = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of logs) {
      const colors = (l.tagIds ?? [])
        .map((id) => tagsById.get(id)?.color)
        .filter((c): c is string => !!c);
      if (isFootplateLog(l)) colors.push(footplateDotColor(l, tags));
      if (!colors.length) continue;
      m.set(l.logDate, [...new Set([...(m.get(l.logDate) ?? []), ...colors])]);
    }
    return m;
  }, [logs, tagsById, tags]);

  async function doSync() {
    try {
      await doDriveSync();
    } finally {
      await refresh();
    }
  }

  const titles: Record<View, string> = {
    home: "S&T Field Logbook",
    tasks: "Task Manager",
    search: "Global Search",
    reports: "Reports",
    notes: "Important Notes",
    attachments: "Attachments",
    materials: "Materials",
    settings: "Settings",
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-700" />
          <p className="text-sm font-medium text-slate-500">Loading logbook…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-slate-100 shadow-xl">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between bg-gradient-to-r from-blue-950 via-blue-900 to-blue-800 px-3 py-3 text-white shadow-lg shadow-blue-900/30">
        <button onClick={() => setDrawer(true)} className="rounded-xl p-2 transition hover:bg-white/10 active:scale-95" aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold tracking-wide">{titles[view]}</h1>
        <div className="flex items-center gap-1">
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button onClick={() => { setNotifOpen((v) => !v); setExportMenu(false); }} className="relative rounded-xl p-2 transition hover:bg-white/10 active:scale-95" aria-label="Alerts" title="Alerts">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {notifications.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-0.5 text-[10px] font-bold text-blue-950 ring-2 ring-blue-900">
                  {notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div
                ref={notifPanelRef}
                className="fixed inset-x-3 top-14 z-30 mx-auto flex max-h-[min(70dvh,28rem)] w-auto max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-surface/95 text-slate-800 shadow-2xl shadow-slate-900/20 backdrop-blur"
              >
                <div className="flex flex-shrink-0 items-center justify-between px-3 pb-1.5 pt-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-900">Alerts</p>
                  {notifications.length > 0 && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {notifications.length} active
                    </span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 ring-1 ring-emerald-100">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                      </svg>
                    </span>
                    <p className="text-sm font-semibold text-slate-700">You&apos;re all caught up</p>
                    <p className="text-xs text-slate-400">No reminders or alerts right now.</p>
                  </div>
                ) : (
                  <div className="min-h-0 space-y-0.5 overflow-y-auto px-1.5 pb-1.5">
                    {notifications.map((n) => {
                      const meta = NOTIF_META[n.kind];
                      return (
                        <button
                          key={n.id}
                          onClick={() => openNotification(n)}
                          className="group flex w-full items-start gap-2.5 rounded-2xl px-2 py-2 text-left transition hover:bg-blue-50/70 active:scale-[0.99]"
                        >
                          <span
                            className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-inset ring-black/5"
                            style={{ backgroundColor: meta.color + "1f", color: meta.color }}
                          >
                            {meta.icon}
                          </span>
                          <span className="min-w-0 flex-1 overflow-hidden">
                            <span className="block break-words text-sm font-semibold leading-snug text-slate-800">{n.title}</span>
                            <span className="mt-0.5 block break-words text-xs leading-snug text-slate-500">{n.detail}</span>
                          </span>
                          {n.target && (
                            <svg
                              className="mt-1.5 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Export */}
          <div className="relative" ref={exportRef}>
            <button onClick={() => { setExportMenu((v) => !v); setNotifOpen(false); }} className="rounded-xl p-2 transition hover:bg-white/10 active:scale-95" aria-label="Export">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </button>
            {exportMenu && (
              <div className="absolute right-0 top-full mt-2 w-[min(240px,calc(100vw-88px))] rounded-2xl border border-slate-200/70 bg-surface/95 p-1.5 text-slate-800 shadow-2xl shadow-slate-900/20 backdrop-blur">
                <button
                  onClick={() => { setTomorrowOpen(true); setExportMenu(false); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                >
                  📄 Export Tomorrow&apos;s Work
                </button>
                <button
                  onClick={() => { setMonthlyOpen(true); setExportMenu(false); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                >
                  🗓️ Export Monthly List
                </button>
                <button
                  onClick={() => { setPcdoOpen(true); setExportMenu(false); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                >
                  ⭐ Export PCDO (Special Works)
                </button>
                <button
                  onClick={() => { setDiaryOpen(true); setExportMenu(false); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                >
                  📔 Export Diary
                </button>
                <button
                  onClick={() => { setTaOpen(true); setExportMenu(false); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                >
                  💰 Export TA Journal
                </button>
                <button
                  onClick={() => { setInspOpen(true); setExportMenu(false); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                >
                  🔁 Export Inspections
                </button>
              </div>
            )}
          </div>
          {/* Sync */}
          <button
            onClick={doSync}
            className="flex items-center gap-1 rounded-xl p-2 transition hover:bg-white/10 active:scale-95"
            aria-label="Sync"
            title={
              autoSyncing || driveSyncing
                ? driveProgress && driveProgress.total > 0
                  ? `Backing up… ${Math.round((driveProgress.done / driveProgress.total) * 100)}% (${
                      driveProgress.total - driveProgress.done
                    } of ${driveProgress.total} files left)`
                  : "Syncing…"
                : dirty
                  ? "Changes pending — tap to sync"
                  : "All changes synced to Drive"
            }
          >
            {autoSyncing || driveSyncing ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 2v6h-6M3 22v-6h6M3.5 9a9 9 0 0 1 14.85-3.36L21 8M20.5 15a9 9 0 0 1-14.85 3.36L3 16" />
                </svg>
                {driveProgress && driveProgress.total > 0 && (
                  <span className="min-w-5 text-center text-[10px] font-bold text-emerald-300">
                    {Math.round((driveProgress.done / driveProgress.total) * 100)}%
                  </span>
                )}
              </>
            ) : dirty ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-300">
                <path d="M21 2v6h-6M3 22v-6h6M3.5 9a9 9 0 0 1 14.85-3.36L21 8M20.5 15a9 9 0 0 1-14.85 3.36L3 16" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-300">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12.5l2.5 2.5L16 9" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {view === "home" && (
          <div key="home" className="home-enter flex h-full min-h-0 flex-col">
            {/* Sync + scope bar */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-blue-50 px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${
                    autoSyncing ? "animate-pulse bg-amber-500" : "bg-emerald-500"
                  }`}
                />
                <span className="truncate text-[11px] text-slate-600">
                  {autoSyncing
                    ? "Saving…"
                    : lastSynced
                      ? `Offline · saved ${lastSynced.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                      : "Offline · stored on this device"}
                </span>
              </div>
              <button
                onClick={() => setMyStationsOnly(!myStationsOnly)}
                className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                  myStationsOnly
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 bg-surface text-slate-600"
                }`}
                title={
                  myStationNames.length
                    ? "My stations: " + myStationNames.join(", ")
                    : "No stations mapped to your profile"
                }
              >
                {myStationsOnly ? `My Stations (${myStationNames.length})` : "All Stations"}
              </button>
            </div>
            {/* Top half: calendar */}
            <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50/50 to-surface shadow-sm">
              <Calendar
                activeDates={activeDates}
                dateTagColors={dateTagColors}
                selectedDate={selectedDate}
                focusedDate={focusedDate}
                onSelect={(d) => {
                  setSelectedDate(d);
                  setFocusedDate(d);
                  if (d) setCalCursor(new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1));
                }}
                collapsed={calCollapsed}
                cursor={calCursor}
                setCursor={setCalCursor}
                onGoToDate={goToDate}
                onMonthJump={jumpToMonth}
              />
              <button
                onClick={() => setCalCollapsed((v) => !v)}
                className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-1 text-xs text-slate-400 hover:bg-slate-50"
              >
                {calCollapsed ? "Expand calendar" : "Collapse calendar"}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0.28,1)] ${calCollapsed ? "" : "rotate-180"}`}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
            {/* Bottom half: timeline */}
            <div className="min-h-0 flex-1">
              <Timeline
                selectedDate={selectedDate}
                goToSignal={goToSignal}
                onOpen={(l) => { setDetailLog(l); }}
                onAddEntry={(iso) => {
                  setSelectedDate(iso);
                  setFocusedDate(iso);
                  setLogForm(true);
                }}
                onVisibleDateChange={(iso) => {
                  setFocusedDate(iso);
                  const y = Number(iso.slice(0, 4));
                  const m = Number(iso.slice(5, 7)) - 1;
                  if (calCursor.getFullYear() !== y || calCursor.getMonth() !== m) {
                    setCalCursor(new Date(y, m, 1));
                  }
                }}
              />
            </div>
          </div>
        )}
        {view !== "home" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === "tasks" && (
              <TaskManager tab={taskTab} setTab={setTaskTab} highlightId={highlightId} clearHighlight={() => setHighlightId(null)} />
            )}
            {view === "search" && (
              <SearchView
                onOpenLog={(l) => setDetailLog(l)}
                onOpenDef={(d) => setSearchDef(d)}
                onOpenPlan={(p) => setSearchPlan(p)}
                onOpenNote={(n) => { go("notes"); setSearchNote(n); }}
                onOpenMaterial={(id) => { go("materials"); setSearchMaterial(id); }}
              />
            )}
            {view === "reports" && (
              <Reports
                onOpenMonthly={() => setMonthlyOpen(true)}
                onOpenLog={(l) => setDetailLog(l)}
                onOpenDef={(d) => setSearchDef(d)}
                onOpenPlan={(p) => setSearchPlan(p)}
                onDrillChange={setReportsDrill}
                drillCloseRef={closeReportsDrill}
              />
            )}
            {view === "notes" && <Notes focusNote={searchNote} />}
            {view === "attachments" && <AttachmentsView onSelect={setSelAttachment} />}
            {view === "materials" && <Materials focusMaterialId={searchMaterial} />}
            {view === "settings" && <Settings />}
          </div>
        )}

        {/* FAB (home & tasks) */}
        {(view === "home" || view === "tasks") && (
          <button
            onClick={() => setFabOpen(true)}
            className="fixed bottom-24 right-[max(1rem,calc(50%-13rem))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-xl shadow-emerald-600/30 ring-1 ring-white/20 transition hover:scale-105 hover:from-emerald-300 hover:to-emerald-500 active:scale-95"
            aria-label="Quick add"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="z-20 flex border-t border-slate-200/70 bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur">
        {([
          ["home", "Home", "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
          ["tasks", "Tasks", "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
          ["search", "Search", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35"],
          ["reports", "Reports", "M3 3v18h18M18 17V9M13 17V5M8 17v-3"],
          ["notes", "Notes", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"],
        ] as [View, string, string][]).map(([key, label, path]) => (
          <button
            key={key}
            onClick={() => { go(key); if (key === "notes") setSearchNote(null); }}
            className={`mx-0.5 flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition active:scale-95 ${
              view === key ? "bg-blue-50 text-blue-700" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={view === key ? 2.4 : 2}>
              <path d={path} />
            </svg>
            {label}
          </button>
        ))}
      </nav>

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 flex bg-black/40 backdrop-blur-[2px]" onClick={() => setDrawer(false)}>
          <div className="w-72 max-w-[85%] rounded-r-3xl bg-gradient-to-b from-blue-950 via-blue-900 to-blue-800 p-5 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 border-b border-white/10 pb-4">
              <p className="text-lg font-bold tracking-tight">Railway S&amp;T</p>
              <p className="text-xs text-blue-200">Field Logbook</p>
              <p className="mt-1 text-[10px] text-blue-300/80">Developed by Aslam, JE/SIG/JMDG</p>
              {currentUser && (
                <div className="mt-3 rounded-xl bg-white/10 p-2.5 text-xs ring-1 ring-white/10">
                  <p className="font-semibold">{currentUser.name}</p>
                  <p className="text-blue-200">{currentUser.designation}</p>
                </div>
              )}
            </div>
            {(["home", "notes", "attachments", "materials", "settings"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => { go(v); if (v === "notes") setSearchNote(null); if (v === "materials") setSearchMaterial(null); setDrawer(false); }}
                className={`mb-1 block w-full rounded-xl px-3 py-2.5 text-left text-sm capitalize transition active:scale-[0.98] ${
                  view === v ? "bg-emerald-500 font-semibold shadow-lg shadow-emerald-900/40" : "text-blue-100 hover:bg-white/10"
                }`}
              >
                {v === "notes"
                  ? "Important Notes"
                  : v === "attachments"
                    ? "Attachments"
                    : v === "materials"
                      ? "Materials"
                      : v}
              </button>
            ))}
          </div>
          <div className="flex-1" />
        </div>
      )}

      {/* FAB sheet */}
      {fabOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-[2px]" onClick={() => setFabOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-surface p-4 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
            <h3 className="mb-3 text-center text-sm font-bold tracking-tight text-blue-900">Quick Add</h3>
            <div className="space-y-2">
              <SheetBtn label="Add Daily Log" icon={<IconLog />} color="#2563eb" onClick={() => { setFabOpen(false); setLogForm(true); }} />
              <SheetBtn label="Add Deficiency Task" icon={<IconWrench />} color="#b45309" onClick={() => { setFabOpen(false); setDefForm(true); }} />
              <SheetBtn label="Add Future Planned Work" icon={<IconCalendar />} color="#059669" onClick={() => { setFabOpen(false); setPlanForm(true); }} />
            </div>
          </div>
        </div>
      )}

      {/* Forms & modals */}
      {logForm && (
        <DailyLogForm open onClose={() => setLogForm(false)} initialDate={view === "home" ? selectedDate ?? undefined : undefined} />
      )}
      {editLog && <DailyLogForm open onClose={() => setEditLog(null)} existing={editLog} />}
      {defForm && <DeficiencyForm open onClose={() => setDefForm(false)} defaultStationId={defaultDefStationId} />}
      {planForm && <PlannedWorkForm open onClose={() => setPlanForm(false)} />}
      {searchDef && <DeficiencyForm open onClose={() => setSearchDef(null)} existing={searchDef} />}
      {searchPlan && <PlannedWorkForm open onClose={() => setSearchPlan(null)} existing={searchPlan} />}
      <MonthlyExportModal open={monthlyOpen} onClose={() => setMonthlyOpen(false)} />
      <TomorrowWorkModal open={tomorrowOpen} onClose={() => setTomorrowOpen(false)} />
      <PcdoExportModal open={pcdoOpen} onClose={() => setPcdoOpen(false)} />
      <DiaryExportModal open={diaryOpen} onClose={() => setDiaryOpen(false)} initialMode="diary" />
      <DiaryExportModal open={taOpen} onClose={() => setTaOpen(false)} initialMode="ta" />
      <InspectionExportModal open={inspOpen} onClose={() => setInspOpen(false)} />
      <LogDetailModal log={detailLog} onClose={() => setDetailLog(null)} onEdit={(l) => setEditLog(l)} />
      <AttachmentPreviewModal attachment={selAttachment} onClose={() => setSelAttachment(null)} />

      {exitToast && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          Press back again to exit
        </div>
      )}

      {showOnboarding && (
        <Onboarding
          onComplete={async () => {
            try {
              localStorage.setItem("snt.onboardingDone", "1");
              markTutorialsSeen(APP_VERSION_BASE);
            } catch {
              /* storage unavailable */
            }
            setOnboardingDone(true);
            setTutorialQueue([]);
            await refresh();
          }}
        />
      )}

      {tutorialQueue.length > 0 && !showOnboarding && (
        <FeatureTutorials tutorials={tutorialQueue} onClose={() => setTutorialQueue([])} />
      )}
    </div>
  );
}

function StrokeIcon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function IconLog({ size = 18 }: { size?: number }) {
  return (
    <StrokeIcon size={size}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </StrokeIcon>
  );
}

function IconWrench({ size = 18 }: { size?: number }) {
  return (
    <StrokeIcon size={size}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />
    </StrokeIcon>
  );
}

function IconCalendar({ size = 18 }: { size?: number }) {
  return (
    <StrokeIcon size={size}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </StrokeIcon>
  );
}

function IconRepeat({ size = 18 }: { size?: number }) {
  return (
    <StrokeIcon size={size}>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </StrokeIcon>
  );
}

function IconTag({ size = 18 }: { size?: number }) {
  return (
    <StrokeIcon size={size}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </StrokeIcon>
  );
}

function IconBox({ size = 18 }: { size?: number }) {
  return (
    <StrokeIcon size={size}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </StrokeIcon>
  );
}

const NOTIF_META: Record<Notification["kind"], { icon: ReactNode; color: string }> = {
  planned: { icon: <IconCalendar size={16} />, color: "#2563eb" },
  due: { icon: <IconWrench size={16} />, color: "#dc2626" },
  inspection: { icon: <IconRepeat size={16} />, color: "#0284c7" },
  tag: { icon: <IconTag size={16} />, color: "#7c3aed" },
  stock: { icon: <IconBox size={16} />, color: "#d97706" },
};

function SheetBtn({ label, icon, color, onClick }: { label: string; icon: ReactNode; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-surface p-3 text-left shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: color + "1f", color }}>
        {icon}
      </span>
      <span className="font-semibold text-slate-800">{label}</span>
    </button>
  );
}
