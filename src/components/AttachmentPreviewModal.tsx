"use client";

import { useState } from "react";
import { Modal } from "./ui";
import { PdfViewer } from "./PdfViewer";
import { shareAttachmentNative, openAttachmentNative } from "@/lib/native";
import type { Attachment } from "@/db/schema";

function blobUrlFromDataUrl(dataUrl: string): string {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** Web-preview fallback for "Open with": hand the file to the browser. */
function openAttachmentWeb(name: string, dataUrl: string): boolean {
  try {
    const url = blobUrlFromDataUrl(dataUrl);
    const w = window.open(url, "_blank");
    if (!w) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shared attachment preview: images and PDFs open inside the app, plus
 * "Open with another app" (Android ACTION_VIEW) and "Share" actions.
 */
export function AttachmentPreviewModal({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState("");

  return (
    <Modal open={Boolean(attachment)} onClose={onClose} title={attachment?.name ?? "Attachment"} wide>
      {attachment?.type.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          className="mx-auto max-h-[70vh] rounded-lg"
        />
      ) : attachment?.type === "application/pdf" ? (
        <PdfViewer key={attachment.dataUrl} dataUrl={attachment.dataUrl} name={attachment.name} />
      ) : attachment ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-sm text-slate-600">This file type cannot be previewed here.</p>
        </div>
      ) : null}

      {attachment && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            disabled={Boolean(busy)}
            onClick={async () => {
              setBusy("open");
              const ok = await openAttachmentNative(attachment.name, attachment.dataUrl);
              if (!ok && !openAttachmentWeb(attachment.name, attachment.dataUrl)) {
                alert("Couldn't open this file on this device.");
              }
              setBusy("");
            }}
            className="rounded-lg border border-blue-800 px-4 py-2 text-sm font-semibold text-blue-800"
          >
            Open with another app
          </button>
          <button
            disabled={Boolean(busy)}
            onClick={async () => {
              setBusy("share");
              const ok = await shareAttachmentNative(attachment.name, attachment.dataUrl);
              if (!ok) alert("Sharing isn't available on this device.");
              setBusy("");
            }}
            className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Share
          </button>
        </div>
      )}
    </Modal>
  );
}
