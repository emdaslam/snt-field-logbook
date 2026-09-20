import { registerPlugin } from "@capacitor/core";

/**
 * Save a base64 file to a user-chosen location via the native DocumentSave
 * plugin, which uses Android's Storage Access Framework. The bytes are staged
 * to the app cache in small chunks first so a large JSON/PDF does not go over
 * the Capacitor bridge in one shot (that killed the app and left a 0-byte file).
 */
export type DocumentSaveOptions = {
  filename: string;
  /** Base64-encoded file content. */
  data: string;
  mimeType?: string;
};

type DocumentSaveNative = {
  save: (options: { filename: string; mimeType?: string; cacheFile?: string }) => Promise<void>;
};

const DocumentSave = registerPlugin<DocumentSaveNative>("DocumentSave");

const CACHE_FILE = "pending-save.bin";
const BRIDGE_CHUNK = 240_000;

export function saveViaPicker(options: DocumentSaveOptions): Promise<void> {
  return stageAndSave(options.filename, options.data, options.mimeType ?? "application/octet-stream");
}

async function stageAndSave(filename: string, base64: string, mimeType: string): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  await writeCacheBase64(CACHE_FILE, base64);
  try {
    await DocumentSave.save({ filename, mimeType, cacheFile: CACHE_FILE });
  } finally {
    try {
      await Filesystem.deleteFile({ path: CACHE_FILE, directory: Directory.Cache });
    } catch {
      /* leftover cache file is overwritten on the next save */
    }
  }
}

/** Write base64 to the app cache in Binder-safe chunks. */
export async function writeCacheBase64(path: string, base64: string): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const first = base64.slice(0, BRIDGE_CHUNK) || "";
  await Filesystem.writeFile({ path, data: first, directory: Directory.Cache, recursive: true });
  for (let i = BRIDGE_CHUNK; i < base64.length; i += BRIDGE_CHUNK) {
    await Filesystem.appendFile({
      path,
      data: base64.slice(i, i + BRIDGE_CHUNK),
      directory: Directory.Cache,
    });
  }
}

/** True when the user backed out of the system save dialog. */
export function isSaveCancelled(error: unknown): boolean {
  return String(error).toLowerCase().includes("cancelled");
}

/** UTF-8-safe base64 for text payloads (the JSON backup). */
export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const step = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(i + step, bytes.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}
