"use client";

import { type Dispatch, type SetStateAction, useState } from "react";
import { api } from "@/lib/api";
import { DEPARTMENTS } from "@/lib/types";
import { Chip, inputClass, PrimaryButton } from "./ui";
import { EMPTY_STATION_DRAFT, StationFields, stationPayload, type StationDraft } from "./StationForm";

type MyStation = { id: number } & StationDraft;

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [mine, setMine] = useState<MyStation[]>([]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="bg-blue-900 px-5 pb-5 pt-6 text-white">
          <h2 className="text-lg font-bold">Welcome to the Field Logbook</h2>
          <p className="mt-0.5 text-xs text-blue-200">Three quick steps and you&apos;re ready to log.</p>
          <div className="mt-4 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-emerald-400" : "bg-blue-800"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 0 && (
            <StationsStep
              mine={mine}
              setMine={setMine}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <ProfileStep
              stations={mine}
              onNext={async () => setStep(2)}
            />
          )}
          {step === 2 && <TutorialStep onDone={onComplete} />}
        </div>
      </div>
    </div>
  );
}

function StationsStep({
  mine,
  setMine,
  onNext,
}: {
  mine: MyStation[];
  setMine: Dispatch<SetStateAction<MyStation[]>>;
  onNext: () => void;
}) {
  const [draft, setDraft] = useState<StationDraft>(EMPTY_STATION_DRAFT);

  function add() {
    if (!draft.name.trim()) return;
    setMine((m) => [
      ...m,
      { id: Date.now() + Math.random(), ...draft, name: draft.name.trim() },
    ]);
    setDraft(EMPTY_STATION_DRAFT);
  }

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold text-slate-800">1 · Your movement stations</h3>
      <p className="mb-4 text-sm text-slate-500">
        Add every station where you make entries — the diary and movement reports use these as the
        “to” ends. Add the distance from HQ and travel time too, so the TA journal can be filled
        correctly. You can add more later in Settings.
      </p>

      <div className="mb-3">
        <StationFields draft={draft} onChange={setDraft} />
      </div>
      <button
        onClick={add}
        disabled={!draft.name.trim()}
        className="mb-4 w-full rounded-lg border border-dashed border-blue-400 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
      >
        + Add station
      </button>

      <div className="mb-4 space-y-2">
        {mine.length === 0 && <p className="text-sm text-slate-400">No stations yet — add at least one.</p>}
        {mine.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{s.name}</p>
              <p className="text-[11px] text-slate-400">
                {[s.code && `Code: ${s.code}`, s.distanceFromHq, s.travelMin || s.travelMax ? `${s.travelMin}–${s.travelMax} min from HQ` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              onClick={() => setMine((m) => m.filter((x) => x.id !== s.id))}
              className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label={`Remove ${s.name}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <PrimaryButton onClick={onNext} className="w-full" disabled={mine.length === 0}>
        Continue
      </PrimaryButton>
      <p className="mt-2 text-center text-xs text-slate-400">
        {mine.length > 0 ? `${mine.length} station${mine.length === 1 ? "" : "s"} added` : "A station is required to continue"}
      </p>
    </div>
  );
}

function ProfileStep({ stations, onNext }: { stations: MyStation[]; onNext: () => Promise<void> }) {
  const [form, setForm] = useState<{
    name: string;
    designation: string;
    department: string;
    phone: string;
    email: string;
    headquartersStationId: number | null;
    assigned: number[];
  }>({
    name: "",
    designation: "",
    department: DEPARTMENTS[0],
    phone: "",
    email: "",
    headquartersStationId: stations.length ? stations[0].id : null,
    assigned: stations.map((s) => s.id),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const realIds = new Map<number, number>();
      for (const s of stations) {
        const row = await api.stations.create(stationPayload(s));
        realIds.set(s.id, row.id);
      }
      await api.staff.create({
        name: form.name.trim(),
        designation: form.designation.trim() || undefined,
        department: form.department,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        stationIds: form.assigned.map((id) => realIds.get(id) ?? id),
        headquartersStationId: form.headquartersStationId
          ? realIds.get(form.headquartersStationId) ?? form.headquartersStationId
          : null,
        isCurrentUser: true,
      });
      await onNext();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold text-slate-800">2 · Your details</h3>
      <p className="mb-4 text-sm text-slate-500">
        This profile tags your entries. If it is shared, each user sets up their own device.
      </p>

      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Aslam Khan"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Designation</span>
          <input
            className={inputClass}
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            placeholder="e.g. JE/SIG"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Department</span>
          <select
            className={inputClass}
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            inputMode="tel"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
          <input
            className={inputClass}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            inputMode="email"
          />
        </label>
      </div>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Headquarters station</span>
        <select
          className={inputClass}
          value={form.headquartersStationId ?? ""}
          onChange={(e) =>
            setForm({ ...form, headquartersStationId: e.target.value ? Number(e.target.value) : null })
          }
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">
          Used as the “from” station for every movement in the Diary export.
        </span>
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Assigned stations</span>
        <div className="flex flex-wrap gap-2">
          {stations.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              color="#0e7490"
              active={form.assigned.includes(s.id)}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  assigned: f.assigned.includes(s.id)
                    ? f.assigned.filter((x) => x !== s.id)
                    : [...f.assigned, s.id],
                }))
              }
            />
          ))}
        </div>
        <span className="mt-1 block text-xs text-slate-400">
          Tap to attach/detach. The “My Stations” filter uses this.
        </span>
      </label>

      <PrimaryButton onClick={save} className="w-full">
        {saving ? "Saving…" : "Save & Continue"}
      </PrimaryButton>
    </div>
  );
}

const TUTORIAL_SLIDES: { icon: string; title: string; body: string }[] = [
  {
    icon: "📝",
    title: "Daily logs",
    body: "Tap the green + button and note the station movement, the work done, and anything still needing attention.",
  },
  {
    icon: "🗓️",
    title: "Swipe the calendar",
    body: "Swipe sideways to jump between months. Coloured dots mark days that already have entries.",
  },
  {
    icon: "🔔",
    title: "Alerts",
    body: "The bell keeps due and overdue items in sight, and your phone can ring up to 4 reminders a day.",
  },
  {
    icon: "📄",
    title: "Reports & exports",
    body: "PCDO, diary, inspections and monthly lists export to PDF from the header — ready to share.",
  },
];

function TutorialStep({ onDone }: { onDone: () => void }) {
  const [slide, setSlide] = useState(0);
  const last = TUTORIAL_SLIDES.length - 1;
  const s = TUTORIAL_SLIDES[slide];

  return (
    <div className="flex flex-col items-center px-1 py-2">
      <h3 className="mb-4 self-start text-base font-semibold text-slate-800">3 · Quick tour</h3>
      <div className="mb-5 flex h-40 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 text-6xl">
        {s.icon}
      </div>
      <h4 className="mb-1 text-center text-lg font-bold text-slate-800">{s.title}</h4>
      <p className="mb-6 text-center text-sm leading-relaxed text-slate-500">{s.body}</p>

      <div className="mb-5 flex gap-1.5">
        {TUTORIAL_SLIDES.map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full transition-colors ${i === slide ? "bg-blue-800" : "bg-slate-200"}`}
          />
        ))}
      </div>

      <div className="flex w-full gap-3">
        <button
          onClick={onDone}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
        >
          Skip
        </button>
        <PrimaryButton onClick={() => (slide === last ? onDone() : setSlide(slide + 1))} className="flex-1">
          {slide === last ? "Start using the app" : "Next"}
        </PrimaryButton>
      </div>
    </div>
  );
}
