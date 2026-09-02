import React, { useEffect, useRef } from "react";
import { LogEntry } from "../../types/message";

interface CombatLogProps {
  entries: LogEntry[];
}

const tone: Record<LogEntry["kind"], string> = {
  cast: "text-graphite",
  death: "text-ink font-medium",
  turn: "text-muted",
  end: "text-ink font-medium",
  effect: "text-graphite",
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

  if (entries.length === 0) {
    return (
      <p className="border-t border-hairline py-2 text-[12.5px] text-muted">
        Nothing has happened yet.
      </p>
    );
  }

  return (
    <ul>
      {entries.map((entry, i) => (
        <li
          key={`${entry.turn}-${i}`}
          className="flex items-baseline gap-2.5 border-t border-hairline py-[7px] text-[12.5px] leading-snug"
        >
          <span className="w-4 flex-none font-mono text-[9.5px] tabular-nums text-rule">
            T{entry.turn}
          </span>
          <p className={`flex-1 ${tone[entry.kind]}`}>
            {entry.kind === "cast" || entry.kind === "death" ? (
              <b className="font-semibold text-ink">{entry.actor}</b>
            ) : (
              entry.actor
            )}{" "}
            {entry.text}
          </p>
          {entry.damage ? (
            <i
              className={`flex-none font-mono text-[11.5px] font-semibold not-italic text-vermilion ${
                entry.crit ? "underline" : ""
              }`}
            >
              &minus;{entry.damage}
            </i>
          ) : null}
        </li>
      ))}
      <div ref={endRef} />
    </ul>
  );
};

export default CombatLog;
