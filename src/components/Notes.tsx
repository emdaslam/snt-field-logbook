"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, PrimaryButton, Chip } from "./ui";
import { api, fmtDate } from "@/lib/api";
import type { Note } from "@/db/schema";

export function Notes() {
  const { notes, noteCategories, stationName, refresh, autoSync } = useData();
  const colorOf = (name: string) =>
    noteCategories.find((c) => c.name === name)?.color ?? "#64748b";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return notes.filter((n) => {
      if (cat && n.category !== cat) return false;
      if (!ql) return true;
      return `${n.title} ${n.body ?? ""}`.toLowerCase().includes(ql);
    });
  }, [notes, q, cat]);

  const pinned = filtered.filter((n) => n.pinned);
  const rest = filtered.filter((n) => !n.pinned);

  async function togglePin(n: Note) {
    await api.notes.update({ id: n.id, pinned: !n.pinned });
    void autoSync();
    await refresh();
  }

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 space-y-2 border-b border-slate-200 bg-slate-50 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes…"
          className="w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip label="All" color="#334155" active={cat === ""} onClick={() => setCat("")} />
          {noteCategories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              color={c.color}
              active={cat === c.name}
              onClick={() => setCat(cat === c.name ? "" : c.name)}
            />
          ))}
          <button
            onClick={() => setManaging(true)}
            className="rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-white"
          >
            + Edit categories
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <button
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          + Add Important Note
        </button>

        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            No notes yet. Store installation dates, equipment details, contacts or standing instructions here.
          </p>
        )}

        {pinned.length > 0 && (
          <p className="px-1 text-xs font-bold uppercase tracking-wide text-amber-700">📌 Pinned</p>
        )}
        {pinned.map((n) => (
          <NoteCard key={n.id} note={n} onEdit={setEditing} onPin={togglePin} stationName={stationName} refresh={refresh} colorOf={colorOf} />
        ))}

        {pinned.length > 0 && rest.length > 0 && (
          <p className="px-1 pt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Other notes</p>
        )}
        {rest.map((n) => (
          <NoteCard key={n.id} note={n} onEdit={setEditing} onPin={togglePin} stationName={stationName} refresh={refresh} colorOf={colorOf} />
        ))}
      </div>

      {(adding || editing) && (
        <NoteForm existing={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {managing && <CategoryManager onClose={() => setManaging(false)} />}
    </div>
  );
}

function NoteCard({
  note,
  onEdit,
  onPin,
  stationName,
  refresh,
  colorOf,
}: {
  note: Note;
  onEdit: (n: Note) => void;
  onPin: (n: Note) => void;
  stationName: (id: number | null) => string;
  refresh: () => Promise<void>;
  colorOf: (name: string) => string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 font-semibold text-slate-800">{note.title}</p>
        <button
          onClick={() => onPin(note)}
          className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-sm ${
            note.pinned ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
          }`}
          title={note.pinned ? "Unpin" : "Pin to top"}
        >
          📌
        </button>
      </div>

      {note.body && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{note.body}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip label={note.category} color={colorOf(note.category)} />
        {note.stationId && <Chip label={stationName(note.stationId)} color="#0e7490" />}
        {note.refDate && <Chip label={fmtDate(note.refDate)} color="#7c3aed" />}
      </div>

      <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
        <button
          onClick={() => onEdit(note)}
          className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
        >
          Edit
        </button>
        <button
          onClick={async () => {
            if (confirm("Delete this note?")) {
              await api.notes.remove(note.id);
              await refresh();
            }
          }}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function NoteForm({ existing, onClose }: { existing: Note | null; onClose: () => void }) {
  const { stations, currentUser, noteCategories, refresh, autoSync } = useData();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [category, setCategory] = useState(
    existing?.category ?? noteCategories[0]?.name ?? "General"
  );
  const [stationId, setStationId] = useState<number | null>(existing?.stationId ?? null);
  const [refDate, setRefDate] = useState(existing?.refDate ?? "");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const payload = {
      id: existing?.id,
      title,
      body,
      category,
      stationId,
      refDate: refDate || null,
      pinned,
      ownerStaffId: existing?.ownerStaffId ?? currentUser?.id ?? null,
    };
    if (existing) await api.notes.update(payload);
    else await api.notes.create(payload);
    void autoSync();
    await refresh();
    setSaving(false);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={existing ? "Edit Note" : "Add Important Note"}>
      <Field label="Title">
        <input
          className={inputClass}
          value={title}
          placeholder="e.g. Point machine installed at NOSSAM"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Details">
        <textarea
          className={inputClass}
          rows={5}
          value={body ?? ""}
          placeholder="Installation date, make/model, serial numbers, contacts, instructions…"
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <Field label="Category">
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {noteCategories.map((c) => (
            <option key={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Station (optional)">
          <select
            className={inputClass}
            value={stationId ?? ""}
            onChange={(e) => setStationId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— None —</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date (e.g. installation)">
          <input
            type="date"
            className={inputClass}
            value={refDate ?? ""}
            onChange={(e) => setRefDate(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          className="h-4 w-4 accent-amber-500"
        />
        📌 Pin to top
      </label>
      <div className="mt-4 flex justify-end">
        <PrimaryButton onClick={save}>{saving ? "Saving…" : "Save Note"}</PrimaryButton>
      </div>
    </Modal>
  );
}

function CategoryManager({ onClose }: { onClose: () => void }) {
  const { noteCategories, notes, refresh, autoSync } = useData();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#2563eb");

  const countFor = (n: string) => notes.filter((x) => x.category === n).length;

  async function add() {
    const t = name.trim();
    if (!t) return;
    const res = await api.noteCategories.create({ name: t, color });
    if (res?.error) return setError(res.error);
    setName("");
    setColor("#2563eb");
    setError(null);
    void autoSync();
    await refresh();
  }

  async function saveEdit() {
    if (editId == null) return;
    const res = await api.noteCategories.update({ id: editId, name: editName.trim(), color: editColor });
    if (res?.error) return setError(res.error);
    setEditId(null);
    setError(null);
    void autoSync();
    await refresh();
  }

  return (
    <Modal open onClose={onClose} title="Manage Note Categories">
      <div className="mb-3 flex gap-2">
        <input
          className={inputClass}
          placeholder="New category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-12 flex-shrink-0 rounded-lg border border-slate-300"
        />
        <button onClick={add} className="flex-shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">
          Add
        </button>
      </div>

      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {noteCategories.map((c) => (
          <li key={c.id} className="px-3 py-2">
            {editId === c.id ? (
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-10 w-12 flex-shrink-0 rounded-lg border border-slate-300"
                />
                <button onClick={saveEdit} className="flex-shrink-0 text-xs font-semibold text-emerald-700">
                  Save
                </button>
                <button onClick={() => setEditId(null)} className="flex-shrink-0 text-xs text-slate-400">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Chip label={c.name} color={c.color} />
                  <span className="text-xs text-slate-400">{countFor(c.name)} note(s)</span>
                </span>
                <span className="flex flex-shrink-0 gap-2">
                  <button
                    onClick={() => { setEditId(c.id); setEditName(c.name); setEditColor(c.color); setError(null); }}
                    className="text-xs font-medium text-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      const n = countFor(c.name);
                      if (
                        confirm(
                          n
                            ? `Delete “${c.name}”? ${n} note(s) will move to General.`
                            : `Delete “${c.name}”?`
                        )
                      ) {
                        await api.noteCategories.remove(c.id);
                        await refresh();
                      }
                    }}
                    className="text-xs font-medium text-red-600"
                  >
                    Delete
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">
        Renaming a category updates every note using it. Deleting moves its notes to General.
      </p>
    </Modal>
  );
}
