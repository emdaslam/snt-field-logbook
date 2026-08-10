import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  boolean,
  numeric,
  jsonb,
  date,
} from "drizzle-orm/pg-core";

// Stations
export const stations = pgTable("stations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 30 }),
  // Distance from the headquarters station: "below8" (≤ 8 km) or "above8" (> 8 km).
  // The headquarters station itself is always "below8" with 0 minutes travel time.
  distanceFromHq: varchar("distance_from_hq", { length: 10 }).default("below8").notNull(),
  // Travel time range (minutes) from the headquarters to this station.
  travelMin: integer("travel_min").default(0).notNull(),
  travelMax: integer("travel_max").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Staff / User Profiles
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  designation: varchar("designation", { length: 120 }),
  pfNo: varchar("pf_no", { length: 60 }),
  buNo: varchar("bu_no", { length: 60 }),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 160 }),
  department: varchar("department", { length: 60 }),
  stationIds: jsonb("station_ids").$type<number[]>().default([]).notNull(),
  // Headquarters station — the "from" end of every movement in the diary
  headquartersStationId: integer("headquarters_station_id"),
  isCurrentUser: boolean("is_current_user").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Custom Tags
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 30 }).default("#3b82f6").notNull(),
  // When enabled, selecting this tag during a log entry asks for the side
  // (towards which station) the work was carried out.
  needsSide: boolean("needs_side").default(false).notNull(),
  // Per-tag reminder: switchable, with a cycle (periodicity in days) and a
  // lead time telling how many days before the due date to start warning.
  remindEnabled: boolean("remind_enabled").default(false).notNull(),
  remindIntervalDays: integer("remind_interval_days"),
  remindBeforeDays: integer("remind_before_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Daily Logs
export const dailyLogs = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  logDate: date("log_date").notNull(),
  stationMovement: text("station_movement"),
  // Non-station movement types: "rest" | "leave" | "cr" (null = a station movement)
  movementKind: varchar("movement_kind", { length: 10 }),
  // For leave: CL / LAP / SICK
  leaveKind: varchar("leave_kind", { length: 10 }),
  // For CR: the date(s) for which the compensatory rest is availed
  crFrom: date("cr_from"),
  crTo: date("cr_to"),
  workDone: text("work_done"),
  ta: numeric("ta", { precision: 12, scale: 2 }),
  // TA claim percentage: 100 / 70 / 30  (100% = 1 full day)
  taPercent: integer("ta_percent").default(100).notNull(),
  // Periodic inspection recorded by this entry
  inspectionKind: varchar("inspection_kind", { length: 20 }),
  // Station the inspection was carried out AT (mirrors the log entry station)
  inspectionStationId: integer("inspection_station_id"),
  // Which side of that station it was done TOWARDS (a neighbouring station)
  inspectionTowardsStationId: integer("inspection_towards_station_id"),
  // For joint inspections: the department it was carried out with (Engg / OHE)
  inspectionJointDept: varchar("inspection_joint_dept", { length: 40 }),
  // Footplate inspection: day/night shift, direction, and per-direction train details
  // Footplate & joint inspections run on either a monthly or quarterly cycle
  inspectionPeriodicity: varchar("inspection_periodicity", { length: 20 }),
  // Custom reminder cycle in days for point oiling / battery distilled water
  inspectionRemindDays: integer("inspection_remind_days"),
  footplateShift: varchar("footplate_shift", { length: 10 }),
  footplateDirection: varchar("footplate_direction", { length: 10 }),
  footplateUp: jsonb("footplate_up").$type<FootplateDetail | null>(),
  footplateDown: jsonb("footplate_down").$type<FootplateDetail | null>(),
  // Footplate details per shift — both Day and Night can be recorded together,
  // and each shift asks its own direction (Up / Down / Both) + train details
  footplateDay: jsonb("footplate_day").$type<FootplateBlock | null>(),
  footplateNight: jsonb("footplate_night").$type<FootplateBlock | null>(),
  inspectionSide: varchar("inspection_side", { length: 160 }),
  // Author of this log — private data is only visible to its owner
  ownerStaffId: integer("owner_staff_id"),
  // PCDO — special works reported in the monthly PCDO return.
  // Station & date always mirror the parent log entry.
  pcdoWork: text("pcdo_work"),
  pcdoStationId: integer("pcdo_station_id"),
  pcdoDate: date("pcdo_date"),
  // Disconnections given, split by purpose
  hasDisconnections: boolean("has_disconnections").default(false).notNull(),
  discSpecialWork: integer("disc_special_work").default(0).notNull(),
  discFailure: integer("disc_failure").default(0).notNull(),
  discMaintenance: integer("disc_maintenance").default(0).notNull(),
  discNotPermitted: integer("disc_not_permitted").default(0).notNull(),
  tagIds: jsonb("tag_ids").$type<number[]>().default([]).notNull(),
  // Side (towards station id) recorded per tag that needs one.
  tagSides: jsonb("tag_sides").$type<Record<number, number>>().default({}).notNull(),
  attachments: jsonb("attachments").$type<Attachment[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Deficiency Tasks
export const deficiencyTasks = pgTable("deficiency_tasks", {
  id: serial("id").primaryKey(),
  department: varchar("department", { length: 60 }).notNull(),
  stationId: integer("station_id"),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 20 }).default("Normal").notNull(),
  dueDate: date("due_date"),
  assignedStaffId: integer("assigned_staff_id"),
  status: varchar("status", { length: 20 }).default("Pending").notNull(),
  selectedForTomorrow: boolean("selected_for_tomorrow").default(false).notNull(),
  attachments: jsonb("attachments").$type<Attachment[]>().default([]).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Future Planned Works
export const plannedWorks = pgTable("planned_works", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  plannedDate: date("planned_date").notNull(),
  stationId: integer("station_id"),
  department: varchar("department", { length: 60 }).default("Signalling").notNull(),
  materialRemarks: text("material_remarks"),
  ownerStaffId: integer("owner_staff_id"),
  status: varchar("status", { length: 20 }).default("Pending").notNull(),
  selectedForTomorrow: boolean("selected_for_tomorrow").default(false).notNull(),
  notified: boolean("notified").default(false).notNull(),
  attachments: jsonb("attachments").$type<Attachment[]>().default([]).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// User-managed categories for important notes
export const noteCategories = pgTable("note_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  color: varchar("color", { length: 30 }).default("#2563eb").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type NoteCategory = typeof noteCategories.$inferSelect;

// Important notes — installation dates, reference info, standing instructions
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  body: text("body"),
  category: varchar("category", { length: 60 }).default("General").notNull(),
  stationId: integer("station_id"),
  refDate: date("ref_date"),
  pinned: boolean("pinned").default(false).notNull(),
  ownerStaffId: integer("owner_staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Note = typeof notes.$inferSelect;

export type FootplateDetail = {
  trainNo: string;
  engineNo: string;
  lpName: string;
  alpName: string;
  tmrName: string;
};

/** One shift (Day or Night) of a footplate inspection: its direction and the
 * train details for that direction. */
export type FootplateBlock = {
  direction: string; // "Up" | "Down" | "Both"
  up: FootplateDetail | null;
  down: FootplateDetail | null;
};

export type Attachment = {
  name: string;
  type: string;
  dataUrl: string;
};

export type Station = typeof stations.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type DailyLog = typeof dailyLogs.$inferSelect;
export type DeficiencyTask = typeof deficiencyTasks.$inferSelect;
export type PlannedWork = typeof plannedWorks.$inferSelect;
