"use client";

import { STATION_DISTANCE_OPTIONS, type StationDistance } from "@/lib/types";
import type { Station } from "@/db/schema";
import { inputClass } from "./ui";

/**
 * The editable fields of a station, kept as raw strings while the user types.
 * Numbers (travelMin / travelMax) are stringified so empty inputs stay empty;
 * {@link stationPayload} clamps them to valid integers when saving.
 */
export type StationDraft = {
  name: string;
  code: string;
  distanceFromHq: StationDistance;
  variableKm: string;
  travelMin: string;
  travelMax: string;
};

export const EMPTY_STATION_DRAFT: StationDraft = {
  name: "",
  code: "",
  distanceFromHq: "below8",
  variableKm: "",
  travelMin: "",
  travelMax: "",
};

/**
 * Turns a draft into the API payload. The distance marker only applies to
 * "variable" stations; travel times clamp to whole minutes with max ≥ min.
 */
export function stationPayload(draft: StationDraft): Partial<Station> {
  const min = Math.max(0, Math.round(Number(draft.travelMin)) || 0);
  const max = Math.max(min, Math.round(Number(draft.travelMax)) || 0);
  return {
    name: draft.name.trim(),
    code: draft.code.trim() || null,
    distanceFromHq: draft.distanceFromHq,
    variableKm: draft.distanceFromHq === "variable" ? draft.variableKm.trim() || null : null,
    travelMin: min,
    travelMax: max,
  };
}

/**
 * The shared station input group used by onboarding, the daily-log quick add
 * and the Settings manager: name, code, distance-from-HQ, variable KMs marker
 * (when applicable) and the travel time range from HQ.
 */
export function StationFields({
  draft,
  onChange,
}: {
  draft: StationDraft;
  onChange: (d: StationDraft) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={`${inputClass} w-full`}
        placeholder="Station name"
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />
      <input
        className="w-24 rounded-lg border border-slate-300 px-2 text-sm"
        placeholder="Code"
        value={draft.code}
        onChange={(e) => onChange({ ...draft, code: e.target.value })}
      />
      <select
        className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        value={draft.distanceFromHq}
        onChange={(e) => onChange({ ...draft, distanceFromHq: e.target.value as StationDistance })}
      >
        {STATION_DISTANCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {draft.distanceFromHq === "variable" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400">at</span>
          <input
            className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm"
            type="text"
            maxLength={12}
            placeholder="KMs"
            value={draft.variableKm}
            onChange={(e) => onChange({ ...draft, variableKm: e.target.value })}
          />
        </div>
      )}
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">min</span>
        <input
          className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-sm"
          type="number"
          min={0}
          placeholder="0"
          value={draft.travelMin}
          onChange={(e) => onChange({ ...draft, travelMin: e.target.value })}
        />
        <span className="text-xs text-slate-400">max</span>
        <input
          className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-sm"
          type="number"
          min={0}
          placeholder="0"
          value={draft.travelMax}
          onChange={(e) => onChange({ ...draft, travelMax: e.target.value })}
        />
      </div>
    </div>
  );
}
