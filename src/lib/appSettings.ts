export type AppSettings = Record<string, string>;

const SETTINGS_KEYS = [
  "snt.taGenConfig",
  "snt.reminderDays",
  "snt.fontSize",
  "snt.contentScale",
  "snt.myStationsOnly",
  "snt.autoDriveSync",
  "snt.exportFormat",
] as const;

const CONTENT_FONT_PREFIX = "snt.contentFontSize.";

export function collectAppSettings(): AppSettings {
  const out: AppSettings = {};
  try {
    for (const k of SETTINGS_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CONTENT_FONT_PREFIX)) {
        const v = localStorage.getItem(k);
        if (v !== null) out[k] = v;
      }
    }
  } catch {
    // Storage unavailable — return whatever was already read.
  }
  return out;
}

export function applyAppSettings(settings: AppSettings): void {
  if (!settings || typeof settings !== "object") return;
  try {
    for (const [k, v] of Object.entries(settings)) {
      if (!k.startsWith("snt.") || typeof v !== "string") continue;
      localStorage.setItem(k, v);
    }
  } catch {
    // Storage unavailable — the settings simply won't persist.
  }
}
