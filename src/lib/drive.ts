import { registerPlugin } from "@capacitor/core";
import { api } from "./api";
import { isNative } from "./native";
import { summarizeBackup, formatBytes, type BackupPayload } from "./backup";
import {
  INDEX_NAME,
  DATA_NAME,
  LEGACY_NAME,
  dayFileName,
  dateFromDayFile,
  isSeededSharded,
  markShardedSeeded,
  readDirtyDays,
  readDataDirty,
  clearDirty,
  buildDataPayload,
  groupLogsByDate,
} from "./drivebackup";

/**
 * Google Drive sync. Works only inside the Android app (native Google
 * Sign-In); the web preview reports "Android app only". The database is kept
 * on Drive as a per-day sharded backup (see drivebackup.ts): one small file
 * per log date, one data file for the non-log tables, and a tiny index. A
 * sync uploads only the touched day(s), never the whole database, so it stays
 * fast and small even with months of photos. Restore pulls the index, the
 * data file and every day file and imports them all at once.
 *
 * Conflict rule: last-write-wins using the backup's exportedAt stamp stored
 * locally as the sync version.
 *
 * Sessions persist across app restarts. The native plugin remembers the last
 * signed-in Google account, so a silent token refresh (getAccessToken) hands
 * back a valid token without showing any UI. The interactive sign-in picker is
 * only used for the explicit "Sign in" action in Settings — auto-sync and the
 * header sync button never interrupt the user with a login prompt.
 */

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
  getAccessToken: (opts?: { email?: string }) => Promise<DriveAuth>;
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

/**
 * Silently ask the native layer for a fresh token, reusing the previously
 * signed-in account. No UI is ever shown. Returns null when there is no usable
 * session (not signed in, signed out, or offline without a cached token).
 */
async function trySilentRefresh(): Promise<DriveAuth | null> {
  if (!isNative()) return null;
  try {
    const fresh = await GoogleDrive.getAccessToken({ email: getStoredEmail() ?? undefined });
    if (fresh?.accessToken) {
      storeAuth(fresh);
      return fresh;
    }
  } catch {
    /* not signed in / offline / needs consent — fall through */
  }
  return null;
}

/**
 * Resolve a Drive auth for a request. Order: in-memory token, a silent native
 * refresh (keeps the user logged in across restarts), the stored token, and
 * only if `interactive` (and nothing above worked) the account picker. For
 * non-interactive flows (auto-sync) the picker is never shown.
 */
async function currentAuth(interactive: boolean): Promise<DriveAuth | null> {
  if (authState?.accessToken) return authState;
  const fresh = await trySilentRefresh();
  if (fresh) return fresh;
  const stored = getStoredAuth();
  if (stored?.accessToken) {
    authState = stored;
    return stored;
  }
  if (!interactive) return null;
  return signInFresh();
}

/** Drive REST call with a fresh bearer token; re-signs in once on 401. */
async function authorizedFetch(
  url: string,
  init?: RequestInit,
  interactive = true
): Promise<Response> {
  const auth = await currentAuth(interactive);
  if (!auth) throw new Error("Not signed in to Google Drive.");
  const call = (token: string) =>
    fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  let res = await call(auth.accessToken);
  if (res.status === 401) {
    // Token expired — refresh silently before bothering the user.
    const fresh = await trySilentRefresh();
    if (fresh) {
      res = await call(fresh.accessToken);
    }
    if (res.status === 401 && interactive) {
      const again = await signInFresh();
      res = await call(again.accessToken);
    }
  }
  return res;
}

type DriveFile = { id: string; name: string };

async function listAppDataFiles(interactive: boolean): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const fields = encodeURIComponent("nextPageToken, files(id,name)");
    const url =
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=${fields}&pageSize=1000` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const res = await authorizedFetch(url, undefined, interactive);
    if (!res.ok) throw new Error(`Could not reach Google Drive (${res.status})`);
    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

async function uploadFile(
  existingId: string | null,
  name: string,
  body: string,
  interactive: boolean
): Promise<void> {
  if (existingId) {
    const url = `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`;
    const res = await authorizedFetch(
      url,
      {
        method: "PATCH",
        body,
        headers: { "Content-Type": "application/json" },
      },
      interactive
    );
    if (!res.ok) throw new Error(`Upload to Drive failed (${res.status})`);
    return;
  }
  const boundary = `snt${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name, parents: ["appDataFolder"] });
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
  const res = await authorizedFetch(
    url,
    {
      method: "POST",
      body: multipart,
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    },
    interactive
  );
  if (!res.ok) throw new Error(`Upload to Drive failed (${res.status})`);
}

async function downloadFile(id: string, interactive: boolean): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  const res = await authorizedFetch(url, undefined, interactive);
  if (!res.ok) throw new Error(`Could not download the Drive backup (${res.status})`);
  return res.text();
}

async function deleteFile(id: string, interactive: boolean): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${id}`;
  const res = await authorizedFetch(url, { method: "DELETE" }, interactive);
  if (!res.ok && res.status !== 404) throw new Error(`Could not remove a Drive file (${res.status})`);
}

/**
 * Push the local database to Drive as per-day files + a data file + an index.
 * Only touched days and changed tables are uploaded, so a normal sync never
 * re-sends the whole backup. The first push after an upgrade does a full pass
 * (splitting everything into day files) and then supersedes the old single
 * JSON backup, which is deleted only once the sharded copy is safe on Drive.
 */
export async function pushToDrive(interactive = true): Promise<DriveResult> {
  if (!isNative()) return { ok: false, message: "Drive sync works only in the Android app." };
  try {
    const auth = await currentAuth(interactive);
    if (!auth) return { ok: false, message: "Not signed in to Google Drive." };
    const payload = (await api.backup.export()) as Record<string, unknown> & { exportedAt?: string };
    const logs = Array.isArray(payload.dailyLogs) ? payload.dailyLogs : [];
    const files = await listAppDataFiles(interactive);
    const byName = new Map(files.map((f) => [f.name, f.id]));

    const seeded = isSeededSharded();
    const dirtyDays = new Set(seeded ? readDirtyDays() : []);
    const dataDirty = !seeded || readDataDirty();
    const groups = groupLogsByDate(logs);
    const localDates = [...groups.keys()].sort();

    // Nothing changed and every expected file is already on Drive → no-op.
    if (seeded && dirtyDays.size === 0 && !dataDirty) {
      const allPresent = localDates.every((d) => byName.has(dayFileName(d)));
      const orphanDay = files.some((f) => {
        const d = dateFromDayFile(f.name);
        return d !== null && !groups.has(d);
      });
      if (allPresent && !orphanDay && byName.has(DATA_NAME) && byName.has(INDEX_NAME)) {
        return { ok: true, message: "Already up to date." };
      }
    }

    const exportedAt = payload.exportedAt ?? new Date().toISOString();
    let uploadedBytes = 0;
    let changed = false;

    // Upload every touched or missing day; drop day files whose date is gone.
    for (const [date, dayLogs] of groups) {
      if (seeded && !dirtyDays.has(date) && byName.has(dayFileName(date))) continue;
      const body = JSON.stringify({ date, exportedAt, logs: dayLogs });
      await uploadFile(byName.get(dayFileName(date)) ?? null, dayFileName(date), body, interactive);
      uploadedBytes += body.length;
      changed = true;
    }
    for (const f of files) {
      const d = dateFromDayFile(f.name);
      if (d !== null && !groups.has(d)) {
        await deleteFile(f.id, interactive);
        changed = true;
      }
    }

    // Non-log tables: re-upload only when they changed or are missing.
    const dataBody = JSON.stringify(buildDataPayload(payload));
    if (!seeded || dataDirty || !byName.has(DATA_NAME)) {
      await uploadFile(byName.get(DATA_NAME) ?? null, DATA_NAME, dataBody, interactive);
      uploadedBytes += dataBody.length;
      changed = true;
    }

    if (!changed) {
      clearDirty();
      return { ok: true, message: "Already up to date." };
    }

    // Tiny index — rewritten whenever anything changed so the exportedAt stamp
    // advances (this is what last-write-wins compares against).
    const indexBody = JSON.stringify({ version: 2, exportedAt, days: localDates });
    await uploadFile(byName.get(INDEX_NAME) ?? null, INDEX_NAME, indexBody, interactive);

    // The old single-file backup is superseded once the sharded copy is safe.
    const legacyId = byName.get(LEGACY_NAME);
    if (legacyId) await deleteFile(legacyId, interactive);

    setVersion(exportedAt);
    markShardedSeeded();
    clearDirty();
    const dayLabel = groups.size === 1 ? "1 day" : `${groups.size} days`;
    return { ok: true, message: `Synced to Drive (${dayLabel}, ${formatBytes(uploadedBytes)}).` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/** Download everything sharded on Drive and import it in one go. */
async function pullSharded(interactive: boolean, byName: Map<string, string>): Promise<DriveResult> {
  const indexId = byName.get(INDEX_NAME);
  if (!indexId) throw new Error("Drive backup looks invalid");
  const index = JSON.parse(await downloadFile(indexId, interactive)) as {
    version?: number;
    exportedAt?: string;
    days?: string[];
  };
  if (!Array.isArray(index.days)) throw new Error("Drive backup looks invalid");
  const remote = typeof index.exportedAt === "string" ? index.exportedAt : null;
  const local = getVersion();
  if (remote && local && remote <= local) {
    return { ok: true, message: "Already up to date with Drive." };
  }

  const dataId = byName.get(DATA_NAME);
  if (!dataId) throw new Error("Drive backup looks invalid");
  const data = JSON.parse(await downloadFile(dataId, interactive)) as Record<string, unknown>;

  const allLogs: unknown[] = [];
  for (const date of index.days) {
    const id = byName.get(dayFileName(date));
    if (!id) throw new Error(`Drive backup is incomplete (missing ${date}).`);
    const day = JSON.parse(await downloadFile(id, interactive)) as { logs?: unknown[] };
    if (Array.isArray(day.logs)) allLogs.push(...day.logs);
  }

  const payload: Record<string, unknown> = {
    ...data,
    dailyLogs: allLogs,
    exportedAt: remote ?? new Date().toISOString(),
    version: 2,
  };
  const summary = summarizeBackup(payload);
  if (!summary.valid) throw new Error("Drive backup looks invalid");
  await api.backup.import(payload as unknown as Record<string, unknown>);
  if (remote) setVersion(remote);
  markShardedSeeded();
  clearDirty();
  return { ok: true, imported: true, message: `Imported ${summary.totalRecords} records from Drive.` };
}

/** Pull the (old single-file) Drive backup and restore it if it is newer. */
async function importLegacy(legacyId: string, interactive: boolean): Promise<DriveResult> {
  const text = await downloadFile(legacyId, interactive);
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
  clearDirty();
  return { ok: true, imported: true, message: `Imported ${summary.totalRecords} records from Drive.` };
}

/** Pull the Drive backup and restore it if it is newer than the last sync. */
export async function pullFromDrive(interactive = true): Promise<DriveResult> {
  if (!isNative()) return { ok: false, message: "Drive sync works only in the Android app." };
  try {
    const auth = await currentAuth(interactive);
    if (!auth) return { ok: false, message: "Not signed in to Google Drive." };
    const files = await listAppDataFiles(interactive);
    const byName = new Map(files.map((f) => [f.name, f.id]));

    const indexId = byName.get(INDEX_NAME);
    if (indexId) return pullSharded(interactive, byName);

    const legacyId = byName.get(LEGACY_NAME);
    if (legacyId) return importLegacy(legacyId, interactive);

    return { ok: false, message: "No backup found on Drive — sync once first." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/**
 * Two-way sync. Last-write-wins using the backup's exportedAt stamp. The
 * remote copy is never overwritten without proof the local copy is at least
 * as new: if the local version is unknown (fresh install) or older than the
 * remote backup, the remote backup is restored first.
 *
 * `interactive` controls whether a missing/expired session may show the
 * account picker. Auto-sync passes false so it stays completely silent.
 */
export async function syncWithDrive(interactive = true): Promise<DriveResult> {
  if (!isNative()) return { ok: false, message: "Drive sync works only in the Android app." };
  try {
    const auth = await currentAuth(interactive);
    if (!auth) return { ok: false, message: "Not signed in to Google Drive." };
    const files = await listAppDataFiles(interactive);
    const byName = new Map(files.map((f) => [f.name, f.id]));

    const indexId = byName.get(INDEX_NAME);
    if (indexId) {
      const index = JSON.parse(await downloadFile(indexId, interactive)) as { exportedAt?: string };
      const remote = typeof index.exportedAt === "string" ? index.exportedAt : null;
      const local = getVersion();
      const remoteNewer = !!remote && (local === null || remote > local);
      if (!remoteNewer) {
        const pushed = await pushToDrive(interactive);
        if (!pushed.ok) return pushed;
        return { ok: true, message: pushed.message };
      }
      return pullSharded(interactive, byName);
    }

    const legacyId = byName.get(LEGACY_NAME);
    if (legacyId) {
      // One-time migration from the old single-file backup: import it first
      // when it is newer, then push the sharded format and only then let
      // pushToDrive remove the legacy file — nothing is lost in between.
      await importLegacy(legacyId, interactive);
      return pushToDrive(interactive);
    }

    return pushToDrive(interactive);
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
