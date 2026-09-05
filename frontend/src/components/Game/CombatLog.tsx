import React, { useEffect, useRef } from "react";
import { GameState, LogEntry } from "../../types/message";

interface CombatLogProps {
  entries: LogEntry[];
  /** To tell a spell with no damage stat from one that got fully absorbed. */
  spellBook?: GameState["spells"];
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
export const CombatLog: React.FC<CombatLogProps> = ({ entries, spellBook }) => {
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
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        const noTarget = entry.kind === "cast" && entry.text.endsWith("hitting nothing");
        const dealsDamage = entry.spellId != null && (spellBook?.[entry.spellId]?.damage ?? 0) > 0;
        const absorbed = entry.kind === "cast" && !noTarget && !entry.damage && dealsDamage;

        return (
          <li
            key={`${entry.turn}-${i}`}
            className={`flex items-baseline gap-2.5 border-t border-hairline py-[7px] text-[12.5px] leading-snug ${
              isLast ? "animate-log-settle" : ""
            }`}
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
            <span className="flex flex-none items-baseline gap-1.5">
              {entry.damage ? (
                <i
                  className={`font-mono text-[11.5px] font-semibold not-italic text-vermilion ${
                    entry.crit ? "underline" : ""
                  }`}
                >
                  &minus;{entry.damage}
                </i>
              ) : null}
              {entry.apChange ? (
                <i className="font-mono text-[11.5px] font-semibold not-italic text-pa">
                  {entry.apChange > 0 ? "+" : "−"}
                  {Math.abs(entry.apChange)} PA
                </i>
              ) : null}
              {entry.mpChange ? (
                <i className="font-mono text-[11.5px] font-semibold not-italic text-pm">
                  {entry.mpChange > 0 ? "+" : "−"}
                  {Math.abs(entry.mpChange)} PM
                </i>
              ) : null}
              {entry.shieldChange ? (
                <i className="font-mono text-[11.5px] font-semibold not-italic text-graphite">
                  {entry.shieldChange > 0 ? "+" : "−"}
                  {Math.abs(entry.shieldChange)} shield
                </i>
              ) : null}
              {noTarget ? (
                <span className="rounded-sm bg-hairline px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted">
                  no target
                </span>
              ) : null}
              {absorbed ? (
                <span className="rounded-sm bg-amber-wash px-1.5 py-0.5 font-sans text-[10px] font-semibold text-amber">
                  absorbed
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
      <div ref={endRef} />
    </ul>
  );
};

export default CombatLog;
