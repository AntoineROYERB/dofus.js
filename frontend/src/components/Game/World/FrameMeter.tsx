import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { t } from "../../../i18n/lang";

/**
 * `?fps` in the address: how the fight's frames are doing, in the corner.
 *
 * The target is 60 frames a second held on a recent phone, and that is
 * checked against numbers, not by eye: the time between frames, the share
 * of frames that missed 16.7 ms, and how long the frame's own work took.
 * It reads on a real phone through the dev server on the local network.
 * The same numbers sit on `window.__asciiFrames` for scripted checks.
 */

export type FrameMeter = { record: (now: number, workMs: number) => void };

type Stats = { fps: number; p95: number; missed: number; work: number; workP95: number; frames: number };

declare global {
  interface Window {
    __asciiFrames?: Stats & { renderer: string };
  }
}

const SIZE = 240;

const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};

export const FrameMeter = React.forwardRef<FrameMeter, { renderer: string }>(({ renderer }, ref) => {
  const gaps = useRef<number[]>([]);
  const works = useRef<number[]>([]);
  const last = useRef(0);
  const [stats, setStats] = useState<Stats | null>(null);

  useImperativeHandle(ref, () => ({
    record: (now, workMs) => {
      if (last.current) gaps.current.push(now - last.current);
      last.current = now;
      works.current.push(workMs);
      if (gaps.current.length > SIZE) gaps.current.shift();
      if (works.current.length > SIZE) works.current.shift();
    },
  }));

  useEffect(() => {
    const id = setInterval(() => {
      const g = gaps.current;
      if (g.length < 10) return;
      const mean = g.reduce((a, b) => a + b, 0) / g.length;
      const s: Stats = {
        fps: 1000 / mean,
        p95: percentile(g, 0.95),
        missed: g.filter((x) => x > 1000 / 60 + 1.5).length / g.length,
        work: works.current.reduce((a, b) => a + b, 0) / works.current.length,
        workP95: percentile(works.current, 0.95),
        frames: g.length,
      };
      window.__asciiFrames = { ...s, renderer };
      setStats(s);
    }, 500);
    return () => clearInterval(id);
  }, [renderer]);

  if (!stats) return null;
  return (
    <div className="pointer-events-none fixed bottom-1 left-1/2 z-50 -translate-x-1/2 rounded-sm bg-night/85 px-2 py-1 font-mono text-[10px] tabular-nums text-ink">
      {t("{renderer} · {fps} fps · p95 {p95} ms · over 16.7 ms {missed}% · work {work} ms (p95 {workP95})", {
        renderer,
        fps: stats.fps.toFixed(0),
        p95: stats.p95.toFixed(1),
        missed: (stats.missed * 100).toFixed(0),
        work: stats.work.toFixed(1),
        workP95: stats.workP95.toFixed(1),
      })}
    </div>
  );
});
FrameMeter.displayName = "FrameMeter";
