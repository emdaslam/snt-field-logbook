"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { api } from "@/lib/api";
import { inputClass, PrimaryButton, Chip, Modal, Field } from "./ui";
import { DEPARTMENTS } from "@/lib/types";
import { BackupModal } from "./BackupModal";
import { RestoreModal } from "./RestoreModal";
import type { Staff } from "@/db/schema";

export function Settings() {
  const { stations, staff, tags, currentUser, refresh } = useData();
  const [newStation, setNewStation] = useState({ name: "", code: "" });
  const [newTag, setNewTag] = useState({ name: "", color: "#2563eb" });
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const [addStaff, setAddStaff] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

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
        <div className="mb-3 flex gap-2">
          <input className={inputClass} placeholder="Tag name" value={newTag.name} onChange={(e) => setNewTag({ ...newTag, name: e.target.value })} />
          <input type="color" value={newTag.color} onChange={(e) => setNewTag({ ...newTag, color: e.target.value })} className="h-10 w-12 rounded-lg border border-slate-300" />
          <button
            onClick={async () => {
              if (!newTag.name) return;
              await api.tags.create(newTag);
              setNewTag({ name: "", color: "#2563eb" });
              await refresh();
            }}
            className="rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t.id} className="flex items-center gap-1">
              <Chip label={t.name} color={t.color} />
              <button onClick={async () => { await api.tags.remove(t.id); await refresh(); }} className="text-xs text-red-500">×</button>
            </span>
          ))}
        </div>
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

      {(editStaff || addStaff) && (
        <StaffEditor
          existing={editStaff}
          onClose={() => { setEditStaff(null); setAddStaff(false); }}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-blue-900">{title}</h3>
      {children}
    </div>
  );
}
