export const DEPARTMENTS = ["Signalling", "Engg", "OHE", "Telecom"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const PRIORITIES = ["Urgent", "Normal", "Later"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ["Pending", "Completed"] as const;
export type Status = (typeof STATUSES)[number];

export const DEFAULT_TAGS = [
  { name: "monthly inspection", color: "#2563eb" },
  { name: "quarterly inspection", color: "#0e7490" },
  { name: "joint inspection", color: "#059669" },
  { name: "maintenance", color: "#0d9488" },
  { name: "footplate", color: "#0891b2" },
  { name: "failures", color: "#dc2626" },
];

export const PRIORITY_COLORS: Record<string, string> = {
  Urgent: "#dc2626",
  Normal: "#2563eb",
  Later: "#64748b",
};

export const DEPARTMENT_COLORS: Record<string, string> = {
  Signalling: "#2563eb",
  Engg: "#059669",
  OHE: "#d97706",
  Telecom: "#0e7490",
};
