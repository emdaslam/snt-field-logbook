import { registerPlugin } from "@capacitor/core";
import { api } from "./api";
import { isNative } from "./native";
import { summarizeBackup, type BackupPayload } from "./backup";

/**
 * Google Drive sync. Works only inside the Android app (native Google
 * Sign-In); the web preview reports "Android app only". The whole database is
 * pushed as a single JSON backup into the app's private Drive app-data folder
 * and pulled back on demand. Conflict rule: last-write-wins using the
 * backup's exportedAt stamp stored locally as the sync version.
 */

const DRIVE_FILE_NAME = "snt-logbook-backup.json";
const AUTH_KEY = "snt.drive.auth";
const VERSION_KEY = "snt.drive.version";
const EMAIL_KEY = "snt.drive.email";

export type DriveAuth = { accessToken: string; email: string; displayName: string };

export type DriveResult = {
  ok: boolean;
  message: string;
  imported?: boolean;
};

export type DriveStatus = {
  available: boolean;
  email: string | null;
  lastSynced: string | null;
};

type GoogleDriveNative = {
  isConfigured: () => Promise<{ configured: boolean }>;
  signIn: () => Promise<DriveAuth>;
  signOut: () => Promise<void>;
};

const GoogleDrive = registerPlugin<GoogleDriveNative>("GoogleDrive");

let authState: DriveAuth | null = null;

function getStoredAuth(): DriveAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as DriveAuth) : null;
  } catch {
    return null;
  }
}

function storeAuth(auth: DriveAuth) {
  authState = auth;
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    localStorage.setItem(EMAIL_KEY, auth.email);
  } catch {
    /* storage unavailable */
  }
}

function clearStoredAuth() {
  authState = null;
  try {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* storage unavailable */
  }
}

function getVersion(): string | null {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
}

function setVersion(v: string) {
  try {
    localStorage.setItem(VERSION_KEY, v);
  } catch {
    /* storage unavailable */
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong";
}

/** True when the Google Drive plugin is configured with a client ID. */
export async function driveIsConfigured(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const r = await GoogleDrive.isConfigured();
    return r.configured;
  } catch {
    return false;
  }
}

export function driveStatus(): DriveStatus {
  return {
    available: isNative(),
    email: getStoredEmail(),
    lastSynced: getVersion(),
  };
}

function getStoredEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

/** Ask the user to pick a Google account and return the Drive auth. */
export async function signInToDrive(): Promise<DriveAuth> {
  if (!isNative()) throw new Error("Drive sync works only in the Android app.");
  return signInFresh();
}

async function signInFresh(): Promise<DriveAuth> {
  const auth = await GoogleDrive.signIn();
  storeAuth(auth);
  return auth;
}

async function loadAuth(): Promise<DriveAuth> {
  if (authState?.accessToken) return authState;
  const stored = getStoredAuth();
  if (stored?.accessToken) {
    authState = stored;
    return stored;
  }
  return signInFresh();
}

/** Drive REST call with a fresh bearer token; re-signs in once on 401. */
async function authorizedFetch(url: string, init?: RequestInit): Promise<Response> {
  let auth = await loadAuth();
  let res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${auth.accessToken}`, ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    auth = await signInFresh();
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${auth.accessToken}`, ...(init?.headers ?? {}) },
    });
  }
  return res;
}

async function findFile(token: string): Promise<{ id: string } | null> {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}'`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&q=${q}`;
  const res = await authorizedFetch(url);
  if (!res.ok) throw new Error(`Could not reach Google Drive (${res.status})`);
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0] ?? null;
}

async function uploadFile(token: string, existingId: string | null, body: string): Promise<void> {
  if (existingId) {
    const url = `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`;
    const res = await authorizedFetch(url, {
      method: "PATCH",
      body,
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Upload to Drive failed (${res.status})`);
    return;
  }
  const boundary = `snt${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: DRIVE_FILE_NAME, parents: ["appDataFolder"] });
  const multipart = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    body,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
  const res = await authorizedFetch(url, {
    method: "POST",
    body: multipart,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
  });
  if (!res.ok) throw new Error(`Upload to Drive failed (${res.status})`);
}

async function downloadFile(token: string, id: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  const res = await authorizedFetch(url);
  if (!res.ok) throw new Error(`Could not download the Drive backup (${res.status})`);
  return res.text();
}

/** Push the current database to Drive. Returns the newest exportedAt. */
export async function pushToDrive(): Promise<DriveResult> {
  if (!isNative()) return { ok: false, message: "Drive sync works only in the Android app." };
  try {
    const auth = await loadAuth();
    const payload = (await api.backup.export()) as Record<string, unknown> & { exportedAt?: string };
    const body = JSON.stringify(payload);
    const existing = await findFile(auth.accessToken);
    await uploadFile(auth.accessToken, existing?.id ?? null, body);
    if (payload.exportedAt) setVersion(payload.exportedAt);
    const kb = Math.max(1, Math.round(body.length / 1024));
    return { ok: true, message: `Synced to Drive (${kb} KB).` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/** Pull the Drive backup and restore it if it is newer than the last sync. */
export async function pullFromDrive(): Promise<DriveResult> {
  if (!isNative()) return { ok: false, message: "Drive sync works only in the Android app." };
  try {
    const auth = await loadAuth();
    const existing = await findFile(auth.accessToken);
    if (!existing) return { ok: false, message: "No backup found on Drive yet — sync once first." };
    const text = await downloadFile(auth.accessToken, existing.id);
    const payload = JSON.parse(text) as BackupPayload;
    const remote = typeof payload.exportedAt === "string" ? payload.exportedAt : null;
    const local = getVersion();
    if (remote && local && remote <= local) {
      return { ok: true, message: "Already up to date with Drive." };
    }
    const summary = summarizeBackup(payload);
    if (!summary.valid) throw new Error("Drive backup looks invalid");
    await api.backup.import(payload as unknown as Record<string, unknown>);
    if (remote) setVersion(remote);
    return { ok: true, imported: true, message: `Imported ${summary.totalRecords} records from Drive.` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/**
 * Two-way sync. Last-write-wins using the backup's exportedAt stamp. The
 * remote copy is never overwritten without proof the local copy is at least
 * as new: if the local version is unknown (fresh install) or older than the
 * remote backup, the remote backup is restored first.
 */
export async function syncWithDrive(): Promise<DriveResult> {
  if (!isNative()) return { ok: false, message: "Drive sync works only in the Android app." };
  try {
    const auth = await loadAuth();
    const existing = await findFile(auth.accessToken);
    if (!existing) {
      return pushToDrive();
    }
    const text = await downloadFile(auth.accessToken, existing.id);
    const payload = JSON.parse(text) as BackupPayload;
    const remote = typeof payload.exportedAt === "string" ? payload.exportedAt : null;
    const local = getVersion();
    const remoteNewer = !!remote && (local === null || remote > local);
    if (!remoteNewer) {
      const pushed = await pushToDrive();
      if (!pushed.ok) return pushed;
      return { ok: true, message: pushed.message };
    }
    const summary = summarizeBackup(payload);
    if (!summary.valid) throw new Error("Drive backup looks invalid");
    await api.backup.import(payload as unknown as Record<string, unknown>);
    if (remote) setVersion(remote);
    return { ok: true, imported: true, message: `Imported ${summary.totalRecords} records from Drive.` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

export async function signOutFromDrive(): Promise<DriveResult> {
  try {
    await GoogleDrive.signOut();
  } catch {
    /* already signed out */
  }
  clearStoredAuth();
  return { ok: true, message: "Signed out of Google Drive." };
}
