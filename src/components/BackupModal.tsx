"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, PrimaryButton } from "./ui";
import { BackupManifest } from "./BackupManifest";
import { summarizeBackup, formatBytes, type BackupSummary } from "@/lib/backup";
import { api } from "@/lib/api";
import { isNative, saveTextFileNative } from "@/lib/native";

type SaveHandle = { createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> };
type PickerWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<SaveHandle>;
};

export function BackupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [json, setJson] = useState<string>("");
  const [status, setStatus] = useState<string>("Preparing backup…");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const filename = `snt-backup-${new Date().toISOString().slice(0, 10)}.json`;

  // Fetch the backup payload as soon as the modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setJson("");
    setError(null);
    setSummary(null);
    setStatus("Preparing backup…");
    (async () => {
      try {
        const text = JSON.stringify(await api.backup.export(), null, 2);
        if (cancelled) return;
        const s = summarizeBackup(JSON.parse(text));
        setJson(text);
        setSummary(s);
        setStatus(
          `Backup ready · ${s.totalRecords} records · ${formatBytes(new Blob([text]).size)}`
        );
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
        setStatus("Could not build backup");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  /** Method 1: File System Access API (best on Chrome/Edge, works in iframes) */
  async function saveViaPicker() {
    const w = window as PickerWindow;
    if (!w.showSaveFilePicker) return false;
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "JSON backup", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      setStatus("✅ Saved successfully");
      return true;
    } catch (e) {
      // User cancelled the picker — treat as handled, don't fall through
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("Save cancelled");
        return true;
      }
      return false;
    }
  }

  /** Method 2: classic blob + anchor download */
  function saveViaAnchor() {
    try {
      const blob = new Blob([json], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2000);
      return true;
    } catch {
      return false;
    }
  }

  async function download() {
    if (!json) return;
    setBusy(true);
    setError(null);
    // On the Android app the browser file picker is unreliable — write the file
    // straight to Documents via the Filesystem plugin and open the share sheet.
    if (isNative()) {
      const ok = await saveTextFileNative(filename, json);
      setStatus(
        ok
          ? "Saved — pick “Save to device” / Files in the share sheet to store it."
          : "Could not save the backup on this device — try “Copy JSON”."
      );
      setBusy(false);
      return;
    }
    const ok = await saveViaPicker();
    if (!ok) {
      const ok2 = saveViaAnchor();
      setStatus(
        ok2
          ? "Download triggered. If nothing appeared, use “Open in new tab” or “Copy JSON” below."
          : "Download blocked by the browser — use “Open in new tab” or “Copy JSON” below."
      );
    }
    setBusy(false);
  }

  /** Method 3: open the raw JSON in a new tab (user can Save As) */
  function openInNewTab() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener");
    if (!w) {
      // Popup blocked — fall back to writing into a new document
      setStatus("Pop-up blocked. Please allow pop-ups, or use “Copy JSON”.");
    } else {
      setStatus("Opened in a new tab — use your browser’s Save As to store the file.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /** Method 4: copy to clipboard */
  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setStatus("✅ Backup JSON copied to clipboard");
    } catch {
      // Fallback to selecting the textarea
      taRef.current?.focus();
      taRef.current?.select();
      const ok = document.execCommand?.("copy");
      setStatus(ok ? "✅ Copied to clipboard" : "Select the text below and copy manually (Ctrl/Cmd+C).");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export Backup (JSON)" wide>
      <p className="mb-2 text-sm text-slate-600">
        A complete snapshot of everything you have entered — every daily log (including attached photos and
        files), deficiency task, planned work, station, staff member and tag. Importing this file restores all
        of it exactly.
      </p>

      <div
        className={`mb-3 rounded-lg px-3 py-2 text-sm ${
          error ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"
        }`}
      >
        {error ? `Error: ${error}` : status}
      </div>

      {summary && <BackupManifest summary={summary} />}

      <div className="mb-3 flex flex-wrap gap-2">
        <PrimaryButton onClick={download}>{busy ? "Saving…" : "⬇ Save as file"}</PrimaryButton>
        <button
          onClick={openInNewTab}
          disabled={!json}
          className="rounded-lg border border-blue-800 px-4 py-2.5 text-sm font-semibold text-blue-800 disabled:opacity-40"
        >
          ↗ Open in new tab
        </button>
        <button
          onClick={copyJson}
          disabled={!json}
          className="rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-40"
        >
          ⧉ Copy JSON
        </button>
      </div>

      <p className="mb-1 text-xs font-medium text-slate-500">
        Raw backup (select all &amp; copy if the buttons are blocked):
      </p>
      <textarea
        ref={taRef}
        readOnly
        value={json}
        onFocus={(e) => e.currentTarget.select()}
        className="h-48 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-[10px] leading-tight text-slate-700"
      />
    </Modal>
  );
}
