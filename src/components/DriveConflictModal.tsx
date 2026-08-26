"use client";

import { Modal } from "./ui";
import type { DriveConflictInfo } from "@/lib/drive";

/**
 * Shown when a sync finds the device's data differs from the signed-in
 * account's Drive backup. Neither side has been touched yet — the user picks
 * which one wins, with a warning about what each direction overwrites.
 */
export function DriveConflictModal({
  conflict,
  busy,
  onClose,
  onPush,
  onPull,
}: {
  conflict: DriveConflictInfo;
  busy: boolean;
  onClose: () => void;
  onPush: () => void;
  onPull: () => void;
}) {
  const local = `${conflict.localRecords.toLocaleString()} records · ${conflict.localDays} day${conflict.localDays === 1 ? "" : "s"}`;
  const remote = `${conflict.remoteRecords.toLocaleString()} records · ${conflict.remoteDays} day${conflict.remoteDays === 1 ? "" : "s"}`;

  return (
    <Modal open onClose={busy ? () => {} : onClose} title="Different data on this account">
      <p className="text-sm text-slate-600">
        The data on this device does not match the backup on{" "}
        <span className="font-semibold text-slate-800">{conflict.remoteEmail}</span>. Syncing now would
        overwrite one of them, so nothing has been changed yet.
      </p>

      <div className="my-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">This device</span>
          <span className="text-right font-semibold text-slate-800">{local}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Google Drive account</span>
          <span className="text-right font-semibold text-slate-800">{remote}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <button
            onClick={onPush}
            disabled={busy}
            className="w-full rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use this device&apos;s data
          </button>
          <p className="mt-1 text-xs font-medium text-red-600">
            Warning: the backup on the account is replaced by this device&apos;s data. Anything only in the
            account is lost.
          </p>
        </div>
        <div>
          <button
            onClick={onPull}
            disabled={busy}
            className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use the account&apos;s data
          </button>
          <p className="mt-1 text-xs font-medium text-red-600">
            Warning: the data on this device is replaced by the account&apos;s backup. Anything only on this
            device is lost.
          </p>
        </div>
        <button
          onClick={onClose}
          disabled={busy}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
