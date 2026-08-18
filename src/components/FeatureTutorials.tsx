"use client";

import { useState } from "react";
import { PrimaryButton } from "./ui";
import { APP_VERSION_BASE } from "@/lib/types";
import {
  TUTORIAL_CATALOG,
  markTutorialsSeen,
  markTutorialsSkipped,
  type VersionTutorial,
} from "@/lib/tutorials";

type Props = {
  tutorials?: VersionTutorial[];
  /** Replay mode (from Settings) — never persists anything. */
  replay?: boolean;
  onClose: () => void;
};

export function FeatureTutorials({ tutorials = TUTORIAL_CATALOG, replay = false, onClose }: Props) {
  const [versionIdx, setVersionIdx] = useState(0);
  const [slide, setSlide] = useState(0);

  const tutorial = tutorials[versionIdx];
  const s = tutorial.slides[slide];
  const lastSlide = tutorial.slides.length - 1;
  const lastVersion = versionIdx === tutorials.length - 1;

  function finishVersion() {
    if (!replay) markTutorialsSeen(tutorial.version);
    if (lastVersion) {
      onClose();
    } else {
      setVersionIdx((v) => v + 1);
      setSlide(0);
    }
  }

  function skipAll() {
    if (!replay) markTutorialsSkipped();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="bg-blue-900 px-5 pb-5 pt-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">What&apos;s new in {tutorial.version}</h2>
              <p className="mt-0.5 text-xs text-blue-200">{tutorial.subtitle}</p>
            </div>
            <span className="mt-0.5 shrink-0 rounded-full bg-blue-800 px-2 py-1 text-[11px] font-semibold text-white">
              {tutorials.length > 1 ? `${versionIdx + 1} of ${tutorials.length}` : tutorial.tag}
            </span>
          </div>
          {tutorials.length > 1 && (
            <div className="mt-4 flex gap-1.5">
              {tutorials.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= versionIdx ? "bg-emerald-400" : "bg-blue-800"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-5 flex h-40 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 text-6xl text-blue-900">
            {s.glyph}
          </div>
          <h4 className="mb-1 text-center text-lg font-bold text-slate-800">{s.title}</h4>
          <p className="mb-6 text-center text-sm leading-relaxed text-slate-500">{s.body}</p>

          <div className="mb-5 flex justify-center gap-1.5">
            {tutorial.slides.map((_, i) => (
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
              {replay ? "Close" : "Skip tutorials"}
            </button>
            <PrimaryButton onClick={() => (slide === lastSlide ? finishVersion() : setSlide(slide + 1))} className="flex-1">
              {slide === lastSlide ? (lastVersion ? "Done" : "Next version") : "Next"}
            </PrimaryButton>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">
            {replay
              ? "What’s new in the major updates so far."
              : `Shown once for each update you’ve missed, up to ${APP_VERSION_BASE}. Replay anytime from Settings → About.`}
          </p>
        </div>
      </div>
    </div>
  );
}
