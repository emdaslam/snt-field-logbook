/**
 * Native-only helpers for the Capacitor Android shell.
 * Everything here is a no-op when running in the web preview.
 */

/** True when running inside the Capacitor Android shell. */
export function isNative() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

export type ReminderItem = {
  kind: "planned" | "due" | "inspection" | "tag";
  title: string;
  detail: string;
};

const REMINDER_IDS = [1, 2, 3, 4];

/**
 * Request notification permission and schedule up to four daily reminders
 * (8:00 / 12:00 / 16:00 / 20:00) so alerts reach the phone's notification
 * panel even when the app is closed. The body carries the full list of
 * pending items (title + detail for each), not just counts. When nothing is
 * pending the reminders are cancelled — no point disturbing the user with
 * "all caught up".
 */
export async function scheduleDailyReminders(items: ReminderItem[]) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== "granted") return;
    }

    // Clear yesterday's reminders first so the content is always current
    await LocalNotifications.cancel({
      notifications: REMINDER_IDS.map((id) => ({ id })),
    });

    // Notify four times a day, but only when there is actually something to say.
    if (items.length === 0) return;

    const lines = items.slice(0, 8).map((i) => `• ${i.title} — ${i.detail}`);
    if (items.length > 8) lines.push(`…and ${items.length - 8} more`);
    const body = lines.join("\n");

    const base = {
      title: `S&T Field Logbook — ${items.length} pending`,
      body,
      sound: "default",
      // White bell = status-bar small icon (must be monochrome). The app logo
      // is shown as the notification's large icon so it appears on the phone's
      // notification panel.
      smallIcon: "ic_stat_notification",
      largeIcon: "ic_notification_logo",
      iconColor: "#1e3a8a",
    };

    await LocalNotifications.schedule({
      notifications: [
        { ...base, id: 1, schedule: { on: { hour: 8, minute: 0 }, repeats: true } },
        { ...base, id: 2, schedule: { on: { hour: 12, minute: 0 }, repeats: true } },
        { ...base, id: 3, schedule: { on: { hour: 16, minute: 0 }, repeats: true } },
        { ...base, id: 4, schedule: { on: { hour: 20, minute: 0 }, repeats: true } },
      ],
    });
  } catch {
    /* not native / permission denied — silent */
  }
}

/**
 * Hand an attachment to the device's share sheet so the user can open it in
 * another app. Returns false when sharing isn't possible (web preview, error).
 */
export async function shareAttachmentNative(name: string, dataUrl: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const base64 = dataUrl.split(",")[1];
    const written = await Filesystem.writeFile({
      path: `attachments/${name}`,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: name, text: name, url: written.uri, dialogTitle: "Open attachment" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Open an attachment directly in another app (Android ACTION_VIEW). The file
 * is written to the app's cache and handed to the system FileOpener, which
 * shows the standard "Open with" chooser. Returns false when unavailable.
 */
export async function openAttachmentNative(name: string, dataUrl: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const [{ Filesystem, Directory }, { FileOpener }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor-community/file-opener"),
    ]);
    const base64 = dataUrl.split(",")[1];
    const mime = dataUrl.match(/^data:([^;]+);/)?.[1] ?? "application/octet-stream";
    const written = await Filesystem.writeFile({
      path: `attachments/${name}`,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    await FileOpener.open({ filePath: written.uri, contentType: mime });
    return true;
  } catch {
    return false;
  }
}

/**
 * Save a text file (e.g. the JSON backup) via Android's system "Save to…"
 * picker (Storage Access Framework), bypassing the webview's broken file
 * picker. Writing straight to public folders like Documents is blocked by
 * scoped storage on Android 10+, so the user picks the location instead.
 * Returns false when the native shell isn't available or the save fails.
 */
export async function saveTextFileNative(filename: string, text: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { saveViaPicker, toBase64Utf8 } = await import("./documentSave");
    await saveViaPicker({
      filename,
      data: toBase64Utf8(text),
      mimeType: "application/json",
    });
    return true;
  } catch {
    return false;
  }
}
