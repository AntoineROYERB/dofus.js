import React, { useEffect, useRef } from "react";
import { LogEntry } from "../../types/message";

interface CombatLogProps {
  entries: LogEntry[];
}

const tone: Record<LogEntry["kind"], string> = {
  cast: "text-stone-700",
  death: "text-red-700 font-medium",
  turn: "text-stone-400",
  end: "text-emerald-700 font-medium",
  effect: "text-violet-700",
};

/**
 * Without this, a spell that missed because of line of sight and a spell that
 * simply did nothing looked identical, and a critical was invisible.
 */
export const CombatLog: React.FC<CombatLogProps> = ({ entries }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <ul className="text-[11px] leading-snug flex flex-col gap-0.5 max-h-24 overflow-y-auto pr-1">
      {entries.map((entry, i) => (
        <li key={`${entry.turn}-${i}`} className={tone[entry.kind]}>
          <span className="text-stone-400 tabular-nums">T{entry.turn}</span>{" "}
          <span className="font-medium">{entry.actor}</span> {entry.text}
          {entry.damage ? (
            <span className={entry.crit ? "text-red-600 font-bold" : ""}>
              {" "}
              &minus;{entry.damage}
            </span>
          ) : null}
        </li>
      ))}
      <div ref={endRef} />
    </ul>
  );
};

export default CombatLog;
