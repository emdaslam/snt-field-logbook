"use client";

import { useEffect, useState } from "react";
import { useData } from "./DataProvider";
import { api } from "@/lib/api";
import { inputClass, PrimaryButton, Chip, Modal, Field } from "./ui";
import { DEPARTMENTS } from "@/lib/types";
import { BackupModal } from "./BackupModal";
import { RestoreModal } from "./RestoreModal";
import { FONT_SIZES, FONT_SIZE_LABEL, CONTENT_FONT_MIN, CONTENT_FONT_MAX, DEFAULT_CONTENT_FONT_SIZE } from "@/lib/types";
import {
  driveIsConfigured,
  driveStatus,
  signInToDrive,
  signOutFromDrive,
  syncWithDrive,
  pullFromDrive,
  type DriveResult,
} from "@/lib/drive";
import type { Staff, Tag } from "@/db/schema";

export function Settings() {
  const { stations, staff, tags, currentUser, refresh, fontSize, setFontSize } = useData();
  const [newStation, setNewStation] = useState({ name: "", code: "" });
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const [addStaff, setAddStaff] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<{ tag: Tag | null } | null>(null);

  // Numeric export text size (10–96). Only the written text inside exported
  // PDFs scales with this; the app UI uses the small/medium/large buttons.
  const [contentFontSize, setContentFontSize] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("snt.contentFontSize"));
      if (Number.isFinite(v) && v >= CONTENT_FONT_MIN && v <= CONTENT_FONT_MAX) {
        return Math.round(v);
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_CONTENT_FONT_SIZE;
  });

  const changeContentFontSize = (v: number) => {
    const clamped = Math.min(CONTENT_FONT_MAX, Math.max(CONTENT_FONT_MIN, v));
    setContentFontSize(clamped);
    try {
      localStorage.setItem("snt.contentFontSize", String(clamped));
    } catch {
      /* ignore */
    }
  };

  const stationLabel = (ids: number[]) =>
    ids.length === 0
      ? "No stations"
      : ids.map((id) => stations.find((s) => s.id === id)?.name ?? "?").join(", ");

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Current User Profile */}
      <Section title="My Profile">
        {currentUser ? (
          <div>
            <p className="text-sm">
              <span className="font-semibold">{currentUser.name}</span> · {currentUser.designation ?? "—"}
            </p>
            <p className="text-xs text-slate-500">{currentUser.department} · {stationLabel(currentUser.stationIds)}</p>
            <button
              onClick={() => setEditStaff(currentUser)}
              className="mt-2 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white"
            >
              Edit My Profile
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No current user set. Add staff and mark one as “current user”.</p>
        )}
      </Section>

      {/* Google Drive sync */}
      <DriveSyncSection />

      {/* Stations */}
      <Section title="Manage Stations">
        <div className="mb-3 flex gap-2">
          <input className={inputClass} placeholder="Station name" value={newStation.name} onChange={(e) => setNewStation({ ...newStation, name: e.target.value })} />
          <input className="w-24 rounded-lg border border-slate-300 px-2 text-sm" placeholder="Code" value={newStation.code} onChange={(e) => setNewStation({ ...newStation, code: e.target.value })} />
          <button
            onClick={async () => {
              if (!newStation.name) return;
              await api.stations.create(newStation);
              setNewStation({ name: "", code: "" });
              await refresh();
            }}
            className="rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white"
          >
            Add
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {stations.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span>{s.name} {s.code && <span className="text-slate-400">({s.code})</span>}</span>
              <button onClick={async () => { if (confirm("Remove station?")) { await api.stations.remove(s.id); await refresh(); } }} className="text-xs text-red-600">Remove</button>
            </li>
          ))}
        </ul>
      </Section>

      {/* Staff Directory (editable) */}
      <Section title="Staff Directory">
        <div className="mb-3 flex justify-end">
          <button onClick={() => setAddStaff(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
            + Add Staff
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {staff.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {s.name} {s.isCurrentUser && <Chip label="You" color="#059669" />}
                </p>
                <p className="text-xs text-slate-500">{s.designation ?? "—"} · {s.department ?? "—"}</p>
                <p className="text-xs text-slate-400">Stations: {stationLabel(s.stationIds)}</p>
                <p className="text-xs text-slate-400">
                  HQ: {stations.find((x) => x.id === s.headquartersStationId)?.name ?? "not set"}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button onClick={() => setEditStaff(s)} className="text-xs font-medium text-blue-700">Edit</button>
                <button onClick={async () => { if (confirm("Delete this staff member?")) { await api.staff.remove(s.id); await refresh(); } }} className="text-xs font-medium text-red-600">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Tags */}
      <Section title="Manage Custom Tags">
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setEditingTag({ tag: null })}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            + Add Tag
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  <Chip label={t.name} color={t.color} />
                  {t.needsSide && (
                    <span className="text-[10px] font-medium text-slate-400">asks for side</span>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  {t.remindEnabled ? (
                    <>
                      🔔 every {t.remindIntervalDays || "—"} day{t.remindIntervalDays !== 1 ? "s" : ""} · warn{" "}
                      {t.remindBeforeDays || "—"} day{t.remindBeforeDays !== 1 ? "s" : ""} before
                    </>
                  ) : (
                    "no reminder"
                  )}
                </span>
              </span>
              <span className="flex flex-shrink-0 gap-2">
                <button onClick={() => setEditingTag({ tag: t })} className="text-xs font-medium text-blue-700">
                  Edit
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Delete this tag? It will be removed from all entries.")) {
                      await api.tags.remove(t.id);
                      await refresh();
                    }
                  }}
                  className="text-xs font-medium text-red-600"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
          {tags.length === 0 && <p className="py-3 text-sm text-slate-400">No custom tags yet.</p>}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Toggle <strong>Remind me</strong> to get a notification for any tag’s next due date — inspection
          tags (e.g. “point oiling”, “monthly inspection”) are tracked per station/side, every other tag by
          its last use. Tick <strong>asks for side</strong> to be asked which station side the work was done
          towards when the tag is picked in a log entry.
        </p>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <p className="mb-2 text-sm text-slate-600">Font size (applies to the whole app and all PDF exports)</p>
        <div className="flex gap-2">
          {FONT_SIZES.map((f) => (
            <button
              key={f}
              onClick={() => setFontSize(f)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize ${
                fontSize === f
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              {FONT_SIZE_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
          <label className="min-w-0 flex-1 text-sm text-slate-700">
            Export text size
            <span className="block text-xs text-slate-400">
              Only the written text in exported PDFs — the app is unaffected.
            </span>
          </label>
          <input
            type="number"
            min={CONTENT_FONT_MIN}
            max={CONTENT_FONT_MAX}
            value={contentFontSize}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (!Number.isFinite(v)) return;
              changeContentFontSize(v);
            }}
            className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-center text-sm text-slate-800"
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Export text size is asked again at the top of every PDF export, defaulting to this value.
        </p>
      </Section>

      {/* Backup */}
      <Section title="Data Backup & Restore">
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => setBackupOpen(true)}>Export Database (JSON)</PrimaryButton>
          <button
            onClick={() => setRestoreOpen(true)}
            className="rounded-lg border border-blue-800 px-4 py-2.5 text-sm font-semibold text-blue-800"
          >
            Import / Restore JSON
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          This app works fully offline — all records live on this device only. Export a backup file regularly
          and keep it somewhere safe; importing it restores everything. Importing replaces all existing data.
        </p>
      </Section>

      {/* About */}
      <Section title="About">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-900 text-2xl font-black text-white">
            S&amp;T
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">S&amp;T Field Logbook</p>
            <p className="text-xs text-slate-500">Version 1.5</p>
            <p className="mt-1 text-xs text-slate-500">
              Developed by <span className="font-semibold text-slate-700">E.MD. Aslam, JE/SIG/JMDG</span>
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          An offline logbook for daily entries, inspections, deficiencies, planned works, PCDO records and
          reports. All data stays on this device.
        </p>
      </Section>

      {(editStaff || addStaff) && (
        <StaffEditor
          existing={editStaff}
          onClose={() => { setEditStaff(null); setAddStaff(false); }}
        />
      )}
      {editingTag && (
        <TagEditor
          existing={editingTag.tag}
          onClose={async () => { setEditingTag(null); await refresh(); }}
        />
      )}
      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
      <RestoreModal open={restoreOpen} onClose={() => setRestoreOpen(false)} />
    </div>
  );
}

function StaffEditor({ existing, onClose }: { existing: Staff | null; onClose: () => void }) {
  const { stations, staff, refresh } = useData();
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    designation: existing?.designation ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    department: existing?.department ?? "Signalling",
    stationIds: existing?.stationIds ?? [],
    headquartersStationId: existing?.headquartersStationId ?? null,
    isCurrentUser: existing?.isCurrentUser ?? false,
  });
  const [saving, setSaving] = useState(false);

  const anyCurrent = staff.some((s) => s.isCurrentUser && s.id !== existing?.id);

  function toggleStation(id: number) {
    setForm((f) => ({
      ...f,
      stationIds: f.stationIds.includes(id) ? f.stationIds.filter((x) => x !== id) : [...f.stationIds, id],
    }));
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    // If setting this staff as current user, unset any other current user first
    if (form.isCurrentUser && anyCurrent) {
      const others = staff.filter((s) => s.isCurrentUser && s.id !== existing?.id);
      for (const o of others) {
        await api.staff.update({ ...o, isCurrentUser: false });
      }
    }
    if (existing) await api.staff.update({ id: existing.id, ...form });
    else await api.staff.create(form);
    await refresh();
    setSaving(false);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={existing ? "Edit Staff" : "Add Staff"}>
      <Field label="Name">
        <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Designation">
        <input className={inputClass} value={form.designation ?? ""} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <input className={inputClass} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className={inputClass} value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
      </div>
      <Field label="Department">
        <select className={inputClass} value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="Headquarters Station">
        <select
          className={inputClass}
          value={form.headquartersStationId ?? ""}
          onChange={(e) =>
            setForm({ ...form, headquartersStationId: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">— Select headquarters —</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">
          Used as the “from” station for every movement in the Diary export.
        </span>
      </Field>

      <Field label="Assigned Stations (select multiple)">
        <div className="flex flex-wrap gap-2">
          {stations.length === 0 && <p className="text-xs text-slate-400">Add stations first.</p>}
          {stations.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              color="#0e7490"
              active={form.stationIds.includes(s.id)}
              onClick={() => toggleStation(s.id)}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">Tap to attach/detach. One person can hold multiple stations.</p>
      </Field>
      <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.isCurrentUser}
          onChange={(e) => setForm({ ...form, isCurrentUser: e.target.checked })}
          className="h-4 w-4 accent-emerald-600"
        />
        Set as current user (this device)
      </label>
      <div className="mt-4 flex justify-end">
        <PrimaryButton onClick={save}>{saving ? "Saving…" : "Save"}</PrimaryButton>
      </div>
    </Modal>
  );
}

function TagEditor({ existing, onClose }: { existing: Tag | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    color: existing?.color ?? "#2563eb",
    needsSide: existing?.needsSide ?? false,
    // Reminders are on by default (the built-in rule applies until the user
    // sets an interval); unchecking switches this tag's reminders off.
    remindEnabled: existing?.remindEnabled ?? true,
    remindIntervalDays: existing?.remindIntervalDays ? String(existing.remindIntervalDays) : "",
    remindBeforeDays: existing?.remindBeforeDays ? String(existing.remindBeforeDays) : "",
  });
  const [saving, setSaving] = useState(false);

  const interval = Number(form.remindIntervalDays) || null;
  const before = Number(form.remindBeforeDays) || null;

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      color: form.color,
      needsSide: form.needsSide,
      remindEnabled: form.remindEnabled,
      remindIntervalDays: form.remindEnabled ? interval : null,
      remindBeforeDays: form.remindEnabled ? before : null,
    };
    if (existing) await api.tags.update({ id: existing.id, ...payload });
    else await api.tags.create(payload);
    setSaving(false);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={existing ? "Edit Tag" : "Add Tag"}>
      <Field label="Tag name">
        <input
          className={inputClass}
          value={form.name}
          placeholder="e.g. monthly inspection"
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Colour">
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          className="h-10 w-16 rounded-lg border border-slate-300"
        />
      </Field>

      <label className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.needsSide}
          onChange={(e) => setForm({ ...form, needsSide: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-emerald-600"
        />
        <span>
          Ask for the side — &ldquo;towards which station&rdquo; — when this tag is selected
          during a log entry.
        </span>
      </label>

      <label className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.remindEnabled}
          onChange={(e) => setForm({ ...form, remindEnabled: e.target.checked })}
          className="h-4 w-4 accent-emerald-600"
        />
        Remind me about this tag’s next due date
      </label>

      {form.remindEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Periodicity (days)">
            <input
              type="number"
              min={1}
              className={inputClass}
              placeholder="e.g. 15"
              value={form.remindIntervalDays}
              onChange={(e) => setForm({ ...form, remindIntervalDays: e.target.value })}
            />
            <span className="mt-1 block text-xs text-slate-400">
              How many days between each occurrence.
            </span>
          </Field>
          <Field label="Warn before due (days)">
            <input
              type="number"
              min={0}
              className={inputClass}
              placeholder="e.g. 5"
              value={form.remindBeforeDays}
              onChange={(e) => setForm({ ...form, remindBeforeDays: e.target.value })}
            />
            <span className="mt-1 block text-xs text-slate-400">
              Start warning this many days before the due date.
            </span>
          </Field>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <PrimaryButton onClick={save}>{saving ? "Saving…" : "Save"}</PrimaryButton>
      </div>
    </Modal>
  );
}

function DriveSyncSection() {
  const { refresh, autoDriveSync, setAutoDriveSync } = useData();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [busy, setBusy] = useState<"signin" | "signout" | "sync" | "import" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const c = await driveIsConfigured();
      if (!live) return;
      setConfigured(c);
      setEmail(driveStatus().email);
      setLastSynced(driveStatus().lastSynced);
    })();
    return () => {
      live = false;
    };
  }, []);

  function report(r: DriveResult) {
    setMsg({ ok: r.ok, text: r.message });
    setEmail(driveStatus().email);
    setLastSynced(driveStatus().lastSynced);
  }

  async function doSignIn() {
    setBusy("signin");
    setMsg(null);
    try {
      const auth = await signInToDrive();
      setMsg({ ok: true, text: `Signed in as ${auth.email}.` });
      setEmail(auth.email);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Sign-in failed" });
    }
    setBusy(null);
  }

  async function doSignOut() {
    setBusy("signout");
    setMsg(null);
    report(await signOutFromDrive());
    setBusy(null);
  }

  async function doSync() {
    setBusy("sync");
    setMsg(null);
    const r = await syncWithDrive();
    report(r);
    if (r.ok && r.imported) await refresh();
    setBusy(null);
  }

  async function doImport() {
    setBusy("import");
    setMsg(null);
    const r = await pullFromDrive();
    report(r);
    if (r.ok && r.imported) await refresh();
    setBusy(null);
  }

  const status = driveStatus();

  return (
    <Section title="Google Drive Sync">
      {!status.available && (
        <p className="text-sm text-slate-500">Drive sync is available in the Android app.</p>
      )}
      {status.available && configured === false && (
        <p className="text-sm text-slate-500">
          Not configured — this build needs a Google OAuth client ID before Drive sync can work.
        </p>
      )}
      {status.available && configured && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {email ? `Signed in as ${email}` : "Not signed in yet"}
            {lastSynced && ` · Last sync ${new Date(lastSynced).toLocaleString()}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {!email ? (
              <PrimaryButton onClick={doSignIn} disabled={busy !== null}>
                {busy === "signin" ? "Signing in…" : "Sign in with Google"}
              </PrimaryButton>
            ) : (
              <button
                onClick={doSignOut}
                disabled={busy !== null}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Sign out
              </button>
            )}
            <PrimaryButton onClick={doSync} disabled={busy !== null} className="bg-emerald-700 hover:bg-emerald-800">
              {busy === "sync" ? "Syncing…" : "Sync to Drive"}
            </PrimaryButton>
            <button
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Import from Drive
            </button>
          </div>
          {msg && (
            <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
          )}
          <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-700">Automatic cloud sync</span>
              <span className="block text-xs text-slate-400">
                Syncs to Drive when you add a new daily log entry and once on the first app open of the
                day.
              </span>
            </span>
            <input
              type="checkbox"
              checked={autoDriveSync}
              onChange={(e) => setAutoDriveSync(e.target.checked)}
              className="h-4 w-4 flex-shrink-0 accent-emerald-600"
            />
          </label>
          {confirming && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                Import replaces the data on this device with the Drive backup.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    setConfirming(false);
                    void doImport();
                  }}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Import
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-blue-900">{title}</h3>
      {children}
    </div>
  );
}
