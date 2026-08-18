"use client";

import { useState } from "react";
import { PrimaryButton } from "./ui";
import { APP_VERSION, APP_VERSION_BASE } from "@/lib/types";

const LS_SHOWN = "snt.whatsNewShown";
const LS_SKIP = "snt.tutorialsSkipped";

type Slide = { glyph: string; title: string; body: string };

const SLIDES: Slide[] = [
  {
    glyph: "▦",
    title: "Materials tab",
    body: "The hamburger menu now has a Materials tab that keeps every material required for maintenance work, with the required quantity and its unit.",
  },
  {
    glyph: "⇄",
    title: "Receive & Use",
    body: "Tap Receive to log a delivery (quantity, date, station, room and where it was placed) and Use to log what was consumed. The outstanding Required figure drops by itself as material arrives.",
  },
  {
    glyph: "＋",
    title: "Add materials",
    body: "The + button adds a new material. “+ Req” adds extra requirement on top of the current amount without opening the edit form.",
  },
  {
    glyph: "▣",
    title: "Grouped by equipment",
    body: "The required list is grouped by equipment — point, signal, block instrument, BPAC and more. New materials start under general, and you can create your own equipment groups.",
  },
  {
    glyph: "▾",
    title: "Collapsible groups",
    body: "Each equipment group is a dropdown. Press the group header to drop its materials down — the ▾ / ▴ arrow shows whether it is open, and groups start collapsed.",
  },
  {
    glyph: "▤",
    title: "Station-wise summary",
    body: "Below the list, each station is a collapsible row that expands to show the materials received, used and in hand there, plus the station total.",
  },
];

export function FeatureTutorials({ onClose }: { onClose: () => void }) {
  const [slide, setSlide] = useState(0);
  const last = SLIDES.length - 1;
  const s = SLIDES[slide];

  function markShown() {
    try {
      localStorage.setItem(LS_SHOWN, APP_VERSION_BASE);
    } catch {
      /* storage unavailable */
    }
  }

  function finish() {
    markShown();
    onClose();
  }

  function skipAll() {
    try {
      localStorage.setItem(LS_SKIP, "1");
      localStorage.setItem(LS_SHOWN, APP_VERSION_BASE);
    } catch {
      /* storage unavailable */
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-blue-900 px-5 pb-5 pt-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">What&apos;s new in {APP_VERSION}</h2>
              <p className="mt-0.5 text-xs text-blue-200">
                The Materials tab and its collapsible groups — in six quick slides.
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-1.5">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= slide ? "bg-emerald-400" : "bg-blue-800"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-5 flex h-40 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 text-6xl text-blue-900">
            {s.glyph}
          </div>
          <h4 className="mb-1 text-center text-lg font-bold text-slate-800">{s.title}</h4>
          <p className="mb-6 text-center text-sm leading-relaxed text-slate-500">{s.body}</p>

          <div className="mb-5 flex gap-1.5 justify-center">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${i === slide ? "bg-blue-800" : "bg-slate-200"}`}
              />
            ))}
          </div>

          <div className="flex w-full gap-3">
            <button
              onClick={skipAll}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              Skip tutorials
            </button>
            <PrimaryButton onClick={() => (slide === last ? finish() : setSlide(slide + 1))} className="flex-1">
              {slide === last ? "Done" : "Next"}
            </PrimaryButton>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">
            Shown once per update. Replay anytime from Settings → About.
          </p>
        </div>
      </div>
    </div>
  );
}
