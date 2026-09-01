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
import type { PcdoWork, CounterReset } from "@/lib/types";

// Stations
export const stations = pgTable("stations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 30 }),
  // Distance from the headquarters station: "below8" (≤ 8 km) or "above8" (> 8 km).
  // The headquarters station itself is always "below8" with 0 minutes travel time.
  // "variable" means one side of the station is within 8 km and the other side is
  // beyond it; variableKm holds the KMs marker (free text, e.g. "8+") at which the
  // "greater than 8 km" side starts.
  distanceFromHq: varchar("distance_from_hq", { length: 10 }).default("below8").notNull(),
  variableKm: text("variable_km"),
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
  // Pay metric (e.g. "L-VI") and pay (e.g. "42,300/-") printed in the TA
  // Journal header, mirroring the official G.A.31 claim form.
  payMetric: varchar("pay_metric", { length: 40 }),
  pay: varchar("pay", { length: 60 }),
  // TA rate (₹ per full day) used to fill the AMOUNT column of the TA Journal
  taRate: numeric("ta_rate", { precision: 12, scale: 2 }),
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
  // Clock times the user enters for a station-movement day (HH:MM). The diary /
  // TA exports show them verbatim — nothing is derived.
  timeDep: varchar("time_dep", { length: 5 }),
  timeArr: varchar("time_arr", { length: 5 }),
  returnTimeDep: varchar("return_time_dep", { length: 5 }),
  returnTimeArr: varchar("return_time_arr", { length: 5 }),
  // How the HQ → station journey was made: "road" (default) or "train".
  // When "train", travelTrainNo holds the train number. Null on days with no
  // movement (Rest/Leave/CR/NH) or when the station is the headquarters.
  travelMode: varchar("travel_mode", { length: 10 }).default("road"),
  travelTrainNo: varchar("travel_train_no", { length: 30 }),
  // How the station → HQ return journey was made: "road" (default) or "train".
  returnMode: varchar("return_mode", { length: 10 }).default("road"),
  returnTrainNo: varchar("return_train_no", { length: 30 }),
  // Custom export rows — one row per leg, each with its own from / to and
  // clock times. When non-empty the Diary and TA Journal exports render each
  // leg as its own line; otherwise the default two-leg layout is used.
  journeyLegs: jsonb("journey_legs").$type<JourneyLeg[]>().default([]).notNull(),
  // Non-station movement types: "rest" | "leave" | "cr" (null = a station movement)
  movementKind: varchar("movement_kind", { length: 10 }),
  // For leave: CL / LAP / SICK
  leaveKind: varchar("leave_kind", { length: 10 }),
  // For CR: the rest day the user worked on (which earned the compensatory rest)
  crFrom: date("cr_from"),
  workDone: text("work_done"),
  ta: numeric("ta", { precision: 12, scale: 2 }),
  // TA claim percentage: 100 / 70 / 30  (100% = 1 full day)
  taPercent: integer("ta_percent").default(100).notNull(),
  // For stations with a variable distance (one side ≤ 8 km, the other > 8 km):
  // true when the day's work was done at/after the station's variableKm marker,
  // making the entry claimable in the TA Journal. null for fixed-distance stations.
  taAtVariableKm: boolean("ta_at_variable_km"),
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
  // Structured data of a "Footplate" movement entry — the boarding / other-end
  // stations, direction, shift, and the outbound / return train legs. The first
  // ride in a multi-Footplate chain is mirrored here for older app versions.
  footplateJourney: jsonb("footplate_journey").$type<FootplateJourney | null>(),
  // Every Footplate ride in the movement chain, each with its own boarding /
  // other-end stations and Day / Night train details. Empty on logs with no
  // Footplate stop. The first item is kept in sync with footplateJourney.
  footplateJourneys: jsonb("footplate_journeys").$type<FootplateRide[]>().default([]).notNull(),
  // Extra movement-chain stops after the primary (station names, or the
  // "__footplate__" sentinel). Empty when the entry is a single movement.
  extraStops: jsonb("extra_stops").$type<string[]>().default([]).notNull(),
  inspectionSide: varchar("inspection_side", { length: 160 }),
  // Author of this log — private data is only visible to its owner
  ownerStaffId: integer("owner_staff_id"),
  // PCDO — special works reported in the monthly PCDO return.
  // Station & date always mirror the parent log entry.
  pcdoWork: text("pcdo_work"),
  // Department-wise special works: one entry per department, each with its own
  // work text. Supersedes pcdoWork (kept for older app versions / legacy rows).
  pcdoWorks: jsonb("pcdo_works").$type<PcdoWork[]>().default([]).notNull(),
  pcdoStationId: integer("pcdo_station_id"),
  pcdoDate: date("pcdo_date"),
  // Disconnections given, split by purpose
  hasDisconnections: boolean("has_disconnections").default(false).notNull(),
  discSpecialWork: integer("disc_special_work").default(0).notNull(),
  discFailure: integer("disc_failure").default(0).notNull(),
  discMaintenance: integer("disc_maintenance").default(0).notNull(),
  discNotPermitted: integer("disc_not_permitted").default(0).notNull(),
  // Counter resets on equipment with registers (MSDAC at a station, UFSBI /
  // BPAC between two stations), split by the cause (failure / testing).
  counterResets: jsonb("counter_resets").$type<CounterReset[]>().default([]).notNull(),
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
  /** Id of the deficiency task this planned work was converted from. When the
   * planned work is completed, the linked deficiency is marked Completed. */
  convertFromId: integer("convert_from_id"),
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

/** One custom export row for a station-movement daily log. When a log carries
 *  one or more custom rows (journeyLegs), the Diary and TA Journal exports
 *  print each row as its own line — letting the user add, delete or reorder
 *  legs and pick their own from / to instead of the fixed HQ ↔ station pair.
 *  A null / empty array means "use the default two-leg layout". */
export type JourneyLeg = {
  from: string;
  to: string;
  timeDep: string | null;
  timeArr: string | null;
  mode: "road" | "train";
  trainNo: string;
};

export type FootplateDetail = {
  trainNo: string;
  engineNo: string;
  lpName: string;
  alpName: string;
  tmrName: string;
  /** Deficiency / remark noted while riding that train on the footplate. */
  remarks: string;
};

/** One shift (Day or Night) of a footplate inspection: its direction and the
 * train details for that direction. */
export type FootplateBlock = {
  direction: string; // "Up" | "Down" | "Both"
  up: FootplateDetail | null;
  down: FootplateDetail | null;
};

/** A single footplate train leg — the standard train details plus the clock
 * times the loco inspector boarded at and got off at (HH:MM). */
export type FootplateJourneyTrain = FootplateDetail & {
  depTime: string;
  arrTime: string;
};

/** A footplate movement (a "Footplate" daily-log entry). The inspector goes
 * HQ → boarding station, rides the engine of a train in one direction to the
 * other end, optionally rides another train in the opposite direction back,
 * then returns to HQ. */
export type FootplateJourney = {
  boardingStationId: number;
  otherEndStationId: number;
  direction: string; // "Up" | "Down" | "Both"
  shift: string | null; // "Day" | "Night" | "Day,Night"
  outbound: FootplateJourneyTrain | null;
  inbound: FootplateJourneyTrain | null;
};

/** One Footplate ride in a daily-log movement chain. Unlike FootplateJourney
 *  (the flattened first-ride shape), this keeps Day and Night blocks so two
 *  rides in the same entry can each have their own trains and times. */
export type FootplateRide = {
  boardingStationId: number;
  otherEndStationId: number;
  shift: string | null;
  day: FootplateBlock | null;
  night: FootplateBlock | null;
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

/** A material on the required list, with the quantity needed (in its unit). */
export type Material = {
  id: number;
  name: string;
  requiredQty: number;
  /** Minimum spare to keep in hand at any station. When a station's in-hand
   *  quantity drops below this, the app raises a low-stock alert. 0 = no
   *  minimum set (no alerts). */
  minRequiredSpare: number;
  /** "Nos" | "Kg" | "Sets" | "Units" — the unit the quantity is counted in. */
  unit: string;
  /** The equipment this material belongs to ("general" when none chosen). */
  equipment: string;
  createdAt: string;
};

/** One user-defined equipment group materials are filed under. */
export type EquipmentType = {
  id: number;
  name: string;
  createdAt: string;
};

/** A station-specific requirement for a material: how many are required and
 *  what minimum spare must be kept in hand at that station. When no row exists
 *  for a (material, station) pair the material's own requiredQty /
 *  minRequiredSpare act as the default. */
export type MaterialStation = {
  id: number;
  materialId: number;
  stationId: number;
  requiredQty: number;
  minRequiredSpare: number;
  createdAt: string;
};

/** One delivery of a material: how many were received and where they were kept
 *  (station + room) with a remark recording exactly where they were placed. */
export type MaterialReceipt = {
  id: number;
  materialId: number;
  qty: number;
  /** ISO date the material was received. */
  date: string;
  stationId: number | null;
  room: string;
  remarks: string;
  createdAt: string;
};

/** One issue of a material: how many were used and for what purpose. */
export type MaterialUsage = {
  id: number;
  materialId: number;
  qty: number;
  /** ISO date the material was used. */
  date: string;
  purpose: string;
  stationId: number | null;
  /** The received batch this usage was taken from (null on older rows). */
  receiptId: number | null;
  createdAt: string;
};

/** One transfer of material from one station to another. The stock that was
 *  moved is linked to the received batch it came from (receiptId), so the
 *  transfer record always knows exactly which delivery (and its kept-location
 *  data) was moved. */
export type MaterialTransfer = {
  id: number;
  materialId: number;
  qty: number;
  /** ISO date the material was transferred. */
  date: string;
  /** Station the stock was moved from (the batch's current location). */
  fromStationId: number | null;
  /** Station the stock was moved to. */
  toStationId: number | null;
  /** The received batch the transferred stock came from (null on older rows). */
  receiptId: number | null;
  /** Where the material was placed at the destination station. */
  room: string;
  /** Remarks — where exactly it was placed at the destination. */
  remarks: string;
  createdAt: string;
};
