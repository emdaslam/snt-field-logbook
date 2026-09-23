"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "./DataProvider";
import { useBackClose } from "@/lib/backButton";
import { Modal, Field, inputClass, PrimaryButton, Chip, Highlight } from "./ui";
import { api, fmtDate } from "@/lib/api";
import { AttachmentField } from "./Forms";
import { AttachmentsRow } from "./TaskManager";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import type { Attachment, Note } from "@/db/schema";

export function Notes({ focusNote }: { focusNote?: Note | null }) {
  const { notes, noteCategories, stationName, refresh, autoSync } = useData();
  const colorOf = (name: string) =>
    noteCategories.find((c) => c.name === name)?.color ?? "#64748b";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  // The native back key closes the open note form / category manager first
  useBackClose(adding || editing !== null || managing, () => {
    if (managing) setManaging(false);
    else if (adding) setAdding(false);
    else setEditing(null);
  });
  useBackClose(previewAtt !== null, () => setPreviewAtt(null));
  // The note opened from Global Search: clear the search/filters so it is
  // visible and expand that one card. Adjusted during render (React's
  // recommended pattern for deriving state from a prop), like PcdoExportModal.
  const [focusId, setFocusId] = useState<number | null>(null);
  const [prevFocus, setPrevFocus] = useState<Note | null>(null);
  if (focusNote && focusNote !== prevFocus) {
    setPrevFocus(focusNote);
    setFocusId(focusNote.id);
    setQ("");
    setCat("");
  } else if (!focusNote && prevFocus !== null) {
    setPrevFocus(null);
    setFocusId(null);
  }

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
      <div className="sticky top-0 z-10 space-y-2 bg-slate-100/95 p-3 backdrop-blur">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes…"
          className="w-full rounded-2xl border border-slate-200 bg-surface px-4 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
            className="rounded-full border border-dashed border-slate-400 px-2.5 py-0.5 text-xs font-semibold text-slate-500 transition hover:bg-surface hover:text-slate-700 active:scale-95"
          >
            + Edit categories
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-400 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 active:scale-[0.98]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          Add Important Note
        </button>

        {filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-surface p-8 text-center text-sm text-slate-400">
            No notes yet. Store installation dates, equipment details, contacts or standing instructions here.
          </p>
        )}

        {pinned.length > 0 && (
          <p className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
            Pinned
          </p>
        )}
        {pinned.map((n, i) => (
          <NoteCard key={n.id} note={n} onEdit={setEditing} onPin={togglePin} onOpen={setPreviewAtt} stationName={stationName} refresh={refresh} colorOf={colorOf} query={q} initiallyExpanded={focusId === n.id} index={i} />
        ))}

        {pinned.length > 0 && rest.length > 0 && (
          <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Other notes</p>
        )}
        {rest.map((n, i) => (
          <NoteCard key={n.id} note={n} onEdit={setEditing} onPin={togglePin} onOpen={setPreviewAtt} stationName={stationName} refresh={refresh} colorOf={colorOf} query={q} initiallyExpanded={focusId === n.id} index={pinned.length + i} />
        ))}
      </div>

      {(adding || editing) && (
        <NoteForm existing={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {managing && <CategoryManager onClose={() => setManaging(false)} />}
      {previewAtt && <AttachmentPreviewModal attachment={previewAtt} onClose={() => setPreviewAtt(null)} />}
    </div>
  );
}

function NoteCard({
  note,
  onEdit,
  onPin,
  onOpen,
  stationName,
  refresh,
  colorOf,
  query,
  initiallyExpanded = false,
  index = 0,
}: {
  note: Note;
  onEdit: (n: Note) => void;
  onPin: (n: Note) => void;
  onOpen: (a: Attachment) => void;
  stationName: (id: number | null) => string;
  refresh: () => Promise<void>;
  colorOf: (name: string) => string;
  query: string;
  initiallyExpanded?: boolean;
  index?: number;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const showBody = Boolean(note.body);
  const cardRef = useRef<HTMLDivElement>(null);
  const accent = colorOf(note.category);

  // A note opened from Global Search scrolls into view when it first mounts.
  useEffect(() => {
    if (initiallyExpanded) {
      cardRef.current?.scrollIntoView({ block: "center" });
    }
  }, [initiallyExpanded]);

  return (
    <div
      ref={cardRef}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className="card-rise relative overflow-hidden rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-1">
        <p className="min-w-0 flex-1 font-semibold tracking-tight text-slate-800">
          <Highlight text={note.title} query={query} />
        </p>
        <button
          onClick={() => onPin(note)}
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition active:scale-95 ${
            note.pinned ? "bg-amber-50 text-amber-500 ring-1 ring-inset ring-amber-100" : "text-slate-300 hover:bg-amber-50 hover:text-amber-400"
          }`}
          title={note.pinned ? "Unpin" : "Pin to top"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
          </svg>
        </button>
      </div>

      {showBody && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 block w-full pl-1 text-left"
          title={expanded ? "Show less" : "Show full note"}
        >
          <p
            className={`whitespace-pre-wrap text-sm leading-snug text-slate-600 ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            <Highlight text={note.body ?? ""} query={query} />
          </p>
          <span className="mt-1 inline-block text-xs font-semibold text-blue-600">
            {expanded ? "Show less" : "Read full note"}
          </span>
        </button>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
        <Chip label={note.category} color={colorOf(note.category)} />
        {note.stationId && <Chip label={stationName(note.stationId)} color="#0e7490" />}
        {note.refDate && <Chip label={fmtDate(note.refDate)} color="#7c3aed" />}
      </div>

      <div className="pl-1">
        <AttachmentsRow attachments={note.attachments ?? []} onOpen={onOpen} />
      </div>

      <div className="mt-2.5 flex gap-1.5 border-t border-slate-100 pt-2.5 pl-1">
        <button
          onClick={() => onEdit(note)}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-200 active:scale-95"
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
          className="rounded-full px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 active:scale-95"
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
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
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
      attachments,
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
        Pin to top
      </label>
      <AttachmentField value={attachments} onChange={setAttachments} />
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
