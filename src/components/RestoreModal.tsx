"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, PrimaryButton } from "./ui";
import { useData } from "./DataProvider";
import { BackupManifest } from "./BackupManifest";
import { summarizeBackup, formatBytes, type BackupSummary } from "@/lib/backup";
import { api } from "@/lib/api";

export function RestoreModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh, autoSync } = useData();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BackupSummary | null>(null);
  const [restored, setRestored] = useState<BackupSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Live-preview whatever JSON is currently in the box
  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    try {
      const s = summarizeBackup(JSON.parse(text));
      setPreview(s.valid ? s : null);
    } catch {
      setPreview(null);
    }
  }, [text]);

  useEffect(() => {
    if (!open) {
      setText("");
      setStatus(null);
      setError(null);
      setRestored(null);
    }
  }, [open]);

  async function loadFile(file: File) {
    try {
      const t = await file.text();
      setText(t);
      setError(null);
      setStatus(`Loaded “${file.name}” (${(file.size / 1024).toFixed(1)} KB). Review, then Restore.`);
    } catch (e) {
      setError("Could not read file: " + String(e));
    }
  }

  async function doRestore() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("That is not valid JSON. Paste the full contents of a backup file.");
      return;
    }
    const p = parsed as Record<string, unknown>;
    if (!p || typeof p !== "object" || (!p.stations && !p.dailyLogs && !p.staff)) {
      setError("This JSON does not look like an S&T backup file.");
      return;
    }
    if (!confirm("Restoring will REPLACE all current data. Continue?")) return;

    setBusy(true);
    setRestored(null);
    try {
      await api.backup.import(parsed as Record<string, unknown>);

      // Read the store back and confirm everything landed
      const nowSummary = summarizeBackup(await api.backup.export());
      const expected = summarizeBackup(parsed as Record<string, never>);
      setRestored(nowSummary);

      void autoSync();
      await refresh();

      if (nowSummary.totalRecords === expected.totalRecords) {
        setStatus(
          `✅ Restored successfully — all ${nowSummary.totalRecords} records (and ${nowSummary.attachments} attachments) are back.`
        );
      } else {
        setStatus(
          `⚠️ Restored ${nowSummary.totalRecords} of ${expected.totalRecords} expected records. Review the summary below.`
        );
      }
    } catch (e) {
      setError("Restore failed: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import / Restore Backup" wide>
      <p className="mb-3 text-sm text-slate-600">
        Choose a backup file, or paste the backup JSON directly if file selection is blocked on your device.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-blue-800 px-4 py-2.5 text-sm font-semibold text-blue-800"
        >
          📁 Choose backup file
        </button>
        <button
          onClick={async () => {
            try {
              const t = await navigator.clipboard.readText();
              setText(t);
              setStatus("Pasted from clipboard. Review, then Restore.");
            } catch {
              setError("Clipboard read blocked — paste manually into the box below.");
            }
          }}
          className="rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700"
        >
          ⧉ Paste from clipboard
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) loadFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>

      {status && !error && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            status.startsWith("⚠️") ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"
          }`}
        >
          {status}
        </div>
      )}
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {restored ? (
        <BackupManifest summary={restored} title="Restored into the app" />
      ) : (
        preview && (
          <>
            <BackupManifest summary={preview} title="This file will restore" />
            {preview.exportedAt && (
              <p className="-mt-1 mb-3 text-xs text-slate-400">
                Backup taken {new Date(preview.exportedAt).toLocaleString()} ·{" "}
                {formatBytes(new Blob([text]).size)}
              </p>
            )}
          </>
        )
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste backup JSON here…"
        className="h-48 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-[10px] leading-tight text-slate-700"
      />

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-400">Import replaces all existing data.</span>
        <PrimaryButton onClick={doRestore}>{busy ? "Restoring…" : "Restore Data"}</PrimaryButton>
      </div>
    </Modal>
  );
}
