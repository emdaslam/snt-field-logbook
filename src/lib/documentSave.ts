import { registerPlugin } from "@capacitor/core";

/**
 * Save a base64 file to a user-chosen location via the native DocumentSave
 * plugin, which uses Android's Storage Access Framework. On Android 10+ scoped
 * storage blocks direct writes to public folders such as /Documents, so PDFs
 * and backups go through the system "Save to…" picker instead.
 */
export type DocumentSaveOptions = {
  filename: string;
  /** Base64-encoded file content. */
  data: string;
  mimeType?: string;
};

type DocumentSaveNative = {
  save: (options: DocumentSaveOptions) => Promise<void>;
};

const DocumentSave = registerPlugin<DocumentSaveNative>("DocumentSave");

export function saveViaPicker(options: DocumentSaveOptions): Promise<void> {
  return DocumentSave.save(options);
}

/** True when the user backed out of the system save dialog. */
export function isSaveCancelled(error: unknown): boolean {
  return String(error).toLowerCase().includes("cancelled");
}

/** UTF-8-safe base64 for text payloads (the JSON backup). */
export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
