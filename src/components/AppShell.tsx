"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useData } from "./DataProvider";
import { Calendar } from "./Calendar";
import { Timeline } from "./Timeline";
import { TaskManager } from "./TaskManager";
import { SearchView } from "./SearchView";
import { Settings } from "./Settings";
import { Notes } from "./Notes";
import { Reports } from "./Reports";
import { AttachmentsView } from "./AttachmentsView";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { MonthlyExportModal } from "./MonthlyExportModal";
import { TomorrowWorkModal } from "./TomorrowWorkModal";
import { PcdoExportModal } from "./PcdoExportModal";
import { LogDetailModal } from "./LogDetailModal";
import { DiaryExportModal } from "./DiaryExportModal";
import { InspectionExportModal } from "./InspectionExportModal";
import { DailyLogForm, DeficiencyForm, PlannedWorkForm } from "./Forms";
import { Onboarding } from "./Onboarding";
import { isNative } from "@/lib/native";
import type { DailyLog, Attachment, DeficiencyTask, PlannedWork } from "@/db/schema";

type View = "home" | "tasks" | "search" | "reports" | "notes" | "attachments" | "settings";

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
    lastSynced,
    myStationsOnly,
    setMyStationsOnly,
    myStationNames,
  } = useData();
  const [view, setView] = useState<View>("home");
  const [drawer, setDrawer] = useState(false);
  const [calCollapsed, setCalCollapsed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);


  const [exportMenu, setExportMenu] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [tomorrowOpen, setTomorrowOpen] = useState(false);
  const [pcdoOpen, setPcdoOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
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

  // Close the header dropdowns when tapping anywhere outside them
  useEffect(() => {
    if (!notifOpen && !exportMenu) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (notifOpen && notifRef.current && !notifRef.current.contains(t)) setNotifOpen(false);
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
  const [taskTab, setTaskTab] = useState<"deficiencies" | "planned" | "archive">("deficiencies");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  function openNotification(n: (typeof notifications)[number]) {
    setNotifOpen(false);
    const t = n.target;
    if (!t) return;
    if (t.type === "log") {
      const l = logs.find((x) => x.id === t.id);
      if (l) {
        setView("home");
        setSelectedDate(l.logDate);
        setDetailLog(l);
      }
      return;
    }
    if (t.type === "deficiency") {
      if (deficiencies.some((d) => d.id === t.id)) {
        setTaskTab("deficiencies");
        setView("tasks");
        setHighlightId("def-" + t.id);
      }
      return;
    }
    if (t.type === "planned") {
      if (planned.some((p) => p.id === t.id)) {
        setTaskTab("planned");
        setView("tasks");
        setHighlightId("plan-" + t.id);
      }
    }
  }
  const [defForm, setDefForm] = useState(false);
  const [planForm, setPlanForm] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
    inspOpen,
    notifOpen,
    exportMenu,
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
      inspOpen,
      notifOpen,
      exportMenu,
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
            [s.inspOpen, () => setInspOpen(false)],
            [s.notifOpen, () => setNotifOpen(false)],
            [s.exportMenu, () => setExportMenu(false)],
          ] as [boolean, () => void][]
        ).find(([open]) => open)?.[1];

        if (closeTop) {
          closeTop();
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

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const dateTagColors = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of logs) {
      if (!l.tagIds?.length) continue;
      const colors = l.tagIds
        .map((id) => tagsById.get(id)?.color)
        .filter((c): c is string => !!c);
      if (!colors.length) continue;
      m.set(l.logDate, [...new Set([...(m.get(l.logDate) ?? []), ...colors])]);
    }
    return m;
  }, [logs, tagsById]);

  async function doSync() {
    setSyncing(true);
    await refresh();
    setTimeout(() => setSyncing(false), 500);
  }

  const titles: Record<View, string> = {
    home: "S&T Field Logbook",
    tasks: "Task Manager",
    search: "Global Search",
    reports: "Reports",
    notes: "Important Notes",
    attachments: "Attachments",
    settings: "Settings",
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-800" />
          <p className="text-sm text-slate-500">Loading logbook…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-slate-100 shadow-xl">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between bg-blue-900 px-3 py-3 text-white shadow-md">
        <button onClick={() => setDrawer(true)} className="rounded-lg p-1.5 hover:bg-blue-800" aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{titles[view]}</h1>
        <div className="flex items-center gap-1">
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button onClick={() => { setNotifOpen((v) => !v); setExportMenu(false); }} className="relative rounded-lg p-1.5 hover:bg-blue-800" aria-label="Alerts" title="Alerts">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {notifications.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-0.5 text-[10px] font-bold text-blue-900">
                  {notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-1 max-h-[70vh] w-[min(288px,calc(100vw-88px))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-xl">
                <p className="px-2 py-1 text-xs font-bold uppercase text-blue-900">Alerts</p>
                {notifications.length === 0 && <p className="px-2 py-3 text-sm text-slate-400">No active alerts</p>}
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className={`text-xs ${n.kind === "due" ? "text-red-600" : n.kind === "inspection" ? "text-sky-600" : n.kind === "tag" ? "text-violet-600" : "text-emerald-600"}`}>{n.detail}</p>
                    {n.target && (
                      <p className="mt-0.5 text-[10px] font-medium text-blue-600">Tap to open entry →</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Export */}
          <div className="relative" ref={exportRef}>
            <button onClick={() => { setExportMenu((v) => !v); setNotifOpen(false); }} className="rounded-lg p-1.5 hover:bg-blue-800" aria-label="Export">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </button>
            {exportMenu && (
              <div className="absolute right-0 top-full mt-1 w-[min(240px,calc(100vw-88px))] rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl">
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
                  onClick={() => { setInspOpen(true); setExportMenu(false); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50"
                >
                  🔁 Export Inspections
                </button>
              </div>
            )}
          </div>
          {/* Sync */}
          <button onClick={doSync} className="rounded-lg p-1.5 hover:bg-blue-800" aria-label="Sync">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={syncing ? "animate-spin" : ""}>
              <path d="M21 2v6h-6M3 22v-6h6M3.5 9a9 9 0 0 1 14.85-3.36L21 8M20.5 15a9 9 0 0 1-14.85 3.36L3 16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {view === "home" && (
          <div className="flex h-full min-h-0 flex-col">
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
                    : "border border-slate-300 bg-white text-slate-600"
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
            <div className="border-b border-slate-200 bg-white shadow-sm">
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
              />
              <button
                onClick={() => setCalCollapsed((v) => !v)}
                className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-1 text-xs text-slate-400 hover:bg-slate-50"
              >
                {calCollapsed ? "Expand calendar" : "Collapse calendar"}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={calCollapsed ? "" : "rotate-180"}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
            {/* Bottom half: timeline */}
            <div className="min-h-0 flex-1">
              <Timeline
                selectedDate={selectedDate}
                onOpen={(l) => { setDetailLog(l); }}
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
              />
            )}
            {view === "reports" && <Reports onOpenMonthly={() => setMonthlyOpen(true)} />}
            {view === "notes" && <Notes />}
            {view === "attachments" && <AttachmentsView onSelect={setSelAttachment} />}
            {view === "settings" && <Settings />}
          </div>
        )}

        {/* FAB (home & tasks) */}
        {(view === "home" || view === "tasks") && (
          <button
            onClick={() => setFabOpen(true)}
            className="fixed bottom-20 right-[max(1rem,calc(50%-13rem))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-white shadow-lg transition hover:bg-emerald-500"
            aria-label="Quick add"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="z-20 flex border-t border-slate-200 bg-white">
        {([
          ["home", "Home", "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
          ["tasks", "Tasks", "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
          ["search", "Search", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35"],
          ["reports", "Reports", "M3 3v18h18M18 17V9M13 17V5M8 17v-3"],
          ["notes", "Notes", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"],
        ] as [View, string, string][]).map(([key, label, path]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              view === key ? "text-blue-800" : "text-slate-400"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={path} />
            </svg>
            {label}
          </button>
        ))}
      </nav>

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setDrawer(false)}>
          <div className="w-64 max-w-[80%] bg-blue-900 p-5 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 border-b border-blue-800 pb-4">
              <p className="text-lg font-bold">Railway S&amp;T</p>
              <p className="text-xs text-blue-200">Field Logbook</p>
              <p className="mt-1 text-[10px] text-blue-300/80">Developed by Aslam, JE/SIG/JMDG</p>
              {currentUser && (
                <div className="mt-3 rounded-lg bg-blue-800/60 p-2 text-xs">
                  <p className="font-semibold">{currentUser.name}</p>
                  <p className="text-blue-200">{currentUser.designation}</p>
                </div>
              )}
            </div>
            {(["home", "tasks", "search", "reports", "notes", "attachments", "settings"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setDrawer(false); }}
                className={`mb-1 block w-full rounded-lg px-3 py-2.5 text-left text-sm capitalize ${
                  view === v ? "bg-emerald-500 font-semibold" : "hover:bg-blue-800"
                }`}
              >
                {v === "tasks"
                  ? "Task Manager"
                  : v === "search"
                    ? "Search"
                    : v === "notes"
                      ? "Important Notes"
                      : v === "attachments"
                        ? "Attachments"
                        : v}
              </button>
            ))}
          </div>
          <div className="flex-1 bg-slate-900/40" />
        </div>
      )}

      {/* FAB sheet */}
      {fabOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50" onClick={() => setFabOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300" />
            <h3 className="mb-3 text-center text-sm font-semibold text-blue-900">Quick Add</h3>
            <div className="space-y-2">
              <SheetBtn label="Add Daily Log" icon="📝" color="#2563eb" onClick={() => { setFabOpen(false); setLogForm(true); }} />
              <SheetBtn label="Add Deficiency Task" icon="🔧" color="#b45309" onClick={() => { setFabOpen(false); setDefForm(true); }} />
              <SheetBtn label="Add Future Planned Work" icon="📅" color="#059669" onClick={() => { setFabOpen(false); setPlanForm(true); }} />
            </div>
          </div>
        </div>
      )}

      {/* Forms & modals */}
      {logForm && <DailyLogForm open onClose={() => setLogForm(false)} />}
      {editLog && <DailyLogForm open onClose={() => setEditLog(null)} existing={editLog} />}
      {defForm && <DeficiencyForm open onClose={() => setDefForm(false)} />}
      {planForm && <PlannedWorkForm open onClose={() => setPlanForm(false)} />}
      {searchDef && <DeficiencyForm open onClose={() => setSearchDef(null)} existing={searchDef} />}
      {searchPlan && <PlannedWorkForm open onClose={() => setSearchPlan(null)} existing={searchPlan} />}
      <MonthlyExportModal open={monthlyOpen} onClose={() => setMonthlyOpen(false)} />
      <TomorrowWorkModal open={tomorrowOpen} onClose={() => setTomorrowOpen(false)} />
      <PcdoExportModal open={pcdoOpen} onClose={() => setPcdoOpen(false)} />
      <DiaryExportModal open={diaryOpen} onClose={() => setDiaryOpen(false)} />
      <InspectionExportModal open={inspOpen} onClose={() => setInspOpen(false)} />
      <LogDetailModal log={detailLog} onClose={() => setDetailLog(null)} onEdit={(l) => setEditLog(l)} />
      <AttachmentPreviewModal attachment={selAttachment} onClose={() => setSelAttachment(null)} />

      {exitToast && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          Press back again to exit
        </div>
      )}

      {showOnboarding && (
        <Onboarding
          onComplete={async () => {
            try {
              localStorage.setItem("snt.onboardingDone", "1");
            } catch {
              /* storage unavailable */
            }
            setOnboardingDone(true);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function SheetBtn({ label, icon, color, onClick }: { label: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full text-lg" style={{ backgroundColor: color + "22" }}>
        {icon}
      </span>
      <span className="font-medium text-slate-800">{label}</span>
    </button>
  );
}
