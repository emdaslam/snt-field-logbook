export type NotifKind = "planned" | "due" | "inspection" | "tag" | "stock";

export const NOTIF_GROUP_ORDER = ["inspection", "planned", "due", "stock"] as const;
export type NotifGroup = (typeof NOTIF_GROUP_ORDER)[number];

export const NOTIF_GROUP_LABEL: Record<NotifGroup, string> = {
  inspection: "Inspections",
  planned: "Planned works",
  due: "Deficiencies",
  stock: "Material order",
};

export function notifGroup(kind: NotifKind): NotifGroup {
  if (kind === "inspection" || kind === "tag") return "inspection";
  if (kind === "planned") return "planned";
  if (kind === "due") return "due";
  return "stock";
}

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, Normal: 1, Later: 2 };

export type SortableNotif = {
  kind: NotifKind;
  priority?: string;
  dueDays?: number;
};

export function sortNotifications<T extends SortableNotif>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ga = NOTIF_GROUP_ORDER.indexOf(notifGroup(a.kind));
    const gb = NOTIF_GROUP_ORDER.indexOf(notifGroup(b.kind));
    if (ga !== gb) return ga - gb;
    const pa = PRIORITY_RANK[a.priority ?? "Normal"] ?? 1;
    const pb = PRIORITY_RANK[b.priority ?? "Normal"] ?? 1;
    if (pa !== pb) return pa - pb;
    return (a.dueDays ?? Number.POSITIVE_INFINITY) - (b.dueDays ?? Number.POSITIVE_INFINITY);
  });
}
