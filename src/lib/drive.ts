import { registerPlugin } from "@capacitor/core";
import { api } from "./api";
import * as ldb from "./localdb";
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
 * locally as the sync version. The version is kept per Google account, so
 * switching the signed-in account never compares stamps written by a
 * different account's backup — and the first sync after a switch pushes the
 * current app data to the new account instead of overwriting it with the new
 * account's own backup (a genuine restore is always possible through the
 * explicit "Import from Drive" action).
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
const LAST_SYNC_KEY = "snt.drive.lastSync";

export type DriveAuth = { accessToken: string; email: string; displayName: string };

export type DriveResult = {
  ok: boolean;
  message: string;
  imported?: boolean;
};

export type DriveProgress = {
  done: number;
  total: number;
  phase: "backup" | "restore";
};

export type DriveProgressFn = (p: DriveProgress) => void;

export type LastSyncInfo = {
  at: string;
  ok: boolean;
  message: string;
  days?: number;
  bytes?: number;
  records?: number;
};

export type DriveStatus = {
  available: boolean;
  email: string | null;
  lastSynced: string | null;
  lastSync: LastSyncInfo | null;
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

function getVersion(email?: string): string | null {
  try {
    const raw = localStorage.getItem(VERSION_KEY);
    if (!raw) return null;
    if (raw.startsWith("{")) {
      const map = JSON.parse(raw) as Record<string, string>;
      const key = email ?? getStoredEmail();
      const v = key ? map[key] : undefined;
      return typeof v === "string" ? v : null;
    }
    return raw; // legacy single-account stamp
  } catch {
    return null;
  }
}

/**
 * Persist the sync version for one account. Versions are kept per email so
 * that switching the signed-in Google account never compares stamps written by
 * a different account's backup.
 */
function setVersion(v: string, email?: string) {
  try {
    const key = email ?? getStoredEmail();
    if (!key) {
      localStorage.setItem(VERSION_KEY, v);
      return;
    }
    const raw = localStorage.getItem(VERSION_KEY);
    let map: Record<string, string> = {};
    if (raw?.startsWith("{")) {
      try {
        map = JSON.parse(raw) as Record<string, string>;
      } catch {
        map = {};
      }
    } else if (raw) {
      // Legacy plain stamp: adopt it under the current account so the next
      // sync keeps comparing against the same clock.
      map = { [key]: raw };
    }
    map[key] = v;
    localStorage.setItem(VERSION_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable */
  }
}

/** True when accounts other than `email` have a sync stamp on this device. */
function hasOtherAccountStamps(email: string): boolean {
  try {
    const raw = localStorage.getItem(VERSION_KEY);
    if (!raw?.startsWith("{")) return false;
    const map = JSON.parse(raw) as Record<string, string>;
    return Object.keys(map).some((k) => k.toLowerCase() !== email.toLowerCase());
  } catch {
    return false;
  }
}

/** True when the local database holds any records at all. */
async function hasAnyLocalData(): Promise<boolean> {
  try {
    for (const t of ldb.TABLES) {
      if ((await ldb.readTable(t)).length > 0) return true;
    }
  } catch {
    /* treat unknown as no data so the restore path stays open */
  }
  return false;
}

function getLastSync(): LastSyncInfo | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as LastSyncInfo;
    return typeof rec?.at === "string" ? rec : null;
  } catch {
    return null;
  }
}

/** Persist the outcome of the most recent Drive sync so the result of an
 * automatic sync (which the user never sees) is still visible in Settings. */
function recordSync(info: {
  ok: boolean;
  message: string;
  days?: number;
  bytes?: number;
  records?: number;
}) {
  try {
    const rec: LastSyncInfo = { at: new Date().toISOString(), ...info };
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(rec));
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
    lastSync: getLastSync(),
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
export async function pushToDrive(interactive = true, onProgress?: DriveProgressFn): Promise<DriveResult> {
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
        const message = `Already up to date (${localDates.length} days backed up).`;
        recordSync({ ok: true, message });
        return { ok: true, message };
      }
    }

    const exportedAt = payload.exportedAt ?? new Date().toISOString();
    let uploadedBytes = 0;
    let changed = false;

    // Count the work ahead of time so progress can be reported as a
    // percentage of the whole backup: touched/missing day uploads, orphan
    // day deletions, the data file, the index and the superseded legacy file.
    const dayUploads = [...groups].filter(
      ([date]) => !(seeded && !dirtyDays.has(date) && byName.has(dayFileName(date)))
    );
    const orphanDeletes = files.filter((f) => {
      const d = dateFromDayFile(f.name);
      return d !== null && !groups.has(d);
    });
    const dataUpload = !seeded || dataDirty || !byName.has(DATA_NAME) ? 1 : 0;
    const total =
      dayUploads.length + orphanDeletes.length + dataUpload + (byName.has(LEGACY_NAME) ? 1 : 0) + 1;
    let done = 0;
    const tick = () => {
      done++;
      onProgress?.({ done, total, phase: "backup" });
    };

    // Upload every touched or missing day; drop day files whose date is gone.
    for (const [date, dayLogs] of dayUploads) {
      const body = JSON.stringify({ date, exportedAt, logs: dayLogs });
      await uploadFile(byName.get(dayFileName(date)) ?? null, dayFileName(date), body, interactive);
      uploadedBytes += body.length;
      changed = true;
      tick();
    }
    for (const f of orphanDeletes) {
      await deleteFile(f.id, interactive);
      changed = true;
      tick();
    }

    // Non-log tables: re-upload only when they changed or are missing.
    const dataBody = JSON.stringify(buildDataPayload(payload));
    if (dataUpload) {
      await uploadFile(byName.get(DATA_NAME) ?? null, DATA_NAME, dataBody, interactive);
      uploadedBytes += dataBody.length;
      changed = true;
      tick();
    }

    if (!changed) {
      clearDirty();
      const message = `Already up to date (${localDates.length} days backed up).`;
      recordSync({ ok: true, message });
      return { ok: true, message };
    }

    // Tiny index — rewritten whenever anything changed so the exportedAt stamp
    // advances (this is what last-write-wins compares against).
    const indexBody = JSON.stringify({ version: 2, exportedAt, days: localDates });
    await uploadFile(byName.get(INDEX_NAME) ?? null, INDEX_NAME, indexBody, interactive);
    tick();

    // The old single-file backup is superseded once the sharded copy is safe.
    const legacyId = byName.get(LEGACY_NAME);
    if (legacyId) {
      await deleteFile(legacyId, interactive);
      tick();
    }

    setVersion(exportedAt, auth.email);
    markShardedSeeded();
    clearDirty();
    const dayLabel = groups.size === 1 ? "1 day" : `${groups.size} days`;
    const message = `Synced to Drive (${dayLabel}, ${formatBytes(uploadedBytes)}).`;
    recordSync({ ok: true, message, days: groups.size, bytes: uploadedBytes });
    return { ok: true, message };
  } catch (e) {
    const message = errorMessage(e);
    recordSync({ ok: false, message });
    return { ok: false, message };
  }
}

/** Download everything sharded on Drive and import it in one go. */
async function pullSharded(
  interactive: boolean,
  byName: Map<string, string>,
  onProgress?: DriveProgressFn,
  email?: string
): Promise<DriveResult> {
  const indexId = byName.get(INDEX_NAME);
  if (!indexId) throw new Error("Drive backup looks invalid");
  const index = JSON.parse(await downloadFile(indexId, interactive)) as {
    version?: number;
    exportedAt?: string;
    days?: string[];
  };
  if (!Array.isArray(index.days)) throw new Error("Drive backup looks invalid");
  const remote = typeof index.exportedAt === "string" ? index.exportedAt : null;
  const local = getVersion(email);
  if (remote && local && remote <= local) {
    const message = "Already up to date with Drive.";
    recordSync({ ok: true, message });
    return { ok: true, message };
  }

  const dataId = byName.get(DATA_NAME);
  if (!dataId) throw new Error("Drive backup looks invalid");
  const total = index.days.length + 2; // index + data file + one per day
  let done = 1; // the index is already fetched
  const tick = () => {
    done++;
    onProgress?.({ done, total, phase: "restore" });
  };
  const data = JSON.parse(await downloadFile(dataId, interactive)) as Record<string, unknown>;
  tick();

  const allLogs: unknown[] = [];
  for (const date of index.days) {
    const id = byName.get(dayFileName(date));
    if (!id) throw new Error(`Drive backup is incomplete (missing ${date}).`);
    const day = JSON.parse(await downloadFile(id, interactive)) as { logs?: unknown[] };
    if (Array.isArray(day.logs)) allLogs.push(...day.logs);
    tick();
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
  if (remote) setVersion(remote, email);
  markShardedSeeded();
  clearDirty();
  const message = `Imported ${summary.totalRecords} records from Drive.`;
  recordSync({ ok: true, message, records: summary.totalRecords });
  return { ok: true, imported: true, message };
}

/** Pull the (old single-file) Drive backup and restore it if it is newer. */
async function importLegacy(
  legacyId: string,
  interactive: boolean,
  email?: string
): Promise<DriveResult> {
  const text = await downloadFile(legacyId, interactive);
  const payload = JSON.parse(text) as BackupPayload;
  const remote = typeof payload.exportedAt === "string" ? payload.exportedAt : null;
  const local = getVersion(email);
  if (remote && local && remote <= local) {
    const message = "Already up to date with Drive.";
    recordSync({ ok: true, message });
    return { ok: true, message };
  }
  const summary = summarizeBackup(payload);
  if (!summary.valid) throw new Error("Drive backup looks invalid");
  await api.backup.import(payload as unknown as Record<string, unknown>);
  if (remote) setVersion(remote, email);
  clearDirty();
  const message = `Imported ${summary.totalRecords} records from Drive.`;
  recordSync({ ok: true, message, records: summary.totalRecords });
  return { ok: true, imported: true, message };
}

/** Pull the Drive backup and restore it if it is newer than the last sync. */
export async function pullFromDrive(interactive = true, onProgress?: DriveProgressFn): Promise<DriveResult> {
  if (!isNative()) return { ok: false, message: "Drive sync works only in the Android app." };
  try {
    const auth = await currentAuth(interactive);
    if (!auth) return { ok: false, message: "Not signed in to Google Drive." };
    const files = await listAppDataFiles(interactive);
    const byName = new Map(files.map((f) => [f.name, f.id]));

    const indexId = byName.get(INDEX_NAME);
    if (indexId) return pullSharded(interactive, byName, onProgress, auth.email);

    const legacyId = byName.get(LEGACY_NAME);
    if (legacyId) return importLegacy(legacyId, interactive, auth.email);

    const message = "No backup found on Drive — sync once first.";
    recordSync({ ok: false, message });
    return { ok: false, message };
  } catch (e) {
    const message = errorMessage(e);
    recordSync({ ok: false, message });
    return { ok: false, message };
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
export async function syncWithDrive(interactive = true, onProgress?: DriveProgressFn): Promise<DriveResult> {
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
      const local = getVersion(auth.email);
      const remoteNewer = !!remote && (local === null || remote > local);
      if (!remoteNewer) {
        const pushed = await pushToDrive(interactive, onProgress);
        if (!pushed.ok) return pushed;
        return { ok: true, message: pushed.message };
      }
      // First contact with this account while data from a different account
      // is already in the app: push the local data to the new account instead
      // of silently overwriting it with the new account's own backup. A
      // genuine restore stays available through the explicit import button.
      if (local === null && hasOtherAccountStamps(auth.email) && (await hasAnyLocalData())) {
        const pushed = await pushToDrive(interactive, onProgress);
        if (!pushed.ok) return pushed;
        return { ok: true, message: pushed.message };
      }
      return pullSharded(interactive, byName, onProgress, auth.email);
    }

    const legacyId = byName.get(LEGACY_NAME);
    if (legacyId) {
      const local = getVersion(auth.email);
      if (local === null && hasOtherAccountStamps(auth.email) && (await hasAnyLocalData())) {
        return pushToDrive(interactive, onProgress);
      }
      // One-time migration from the old single-file backup: import it first
      // when it is newer, then push the sharded format and only then let
      // pushToDrive remove the legacy file — nothing is lost in between.
      await importLegacy(legacyId, interactive, auth.email);
      return pushToDrive(interactive, onProgress);
    }

    return pushToDrive(interactive, onProgress);
  } catch (e) {
    const message = errorMessage(e);
    recordSync({ ok: false, message });
    return { ok: false, message };
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
