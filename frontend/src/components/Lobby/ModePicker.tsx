import React from "react";
import { Modal } from "../Overlay";
import { ElementGlyph } from "../Game/ElementGlyph";
import { HomeIcon, ICONS } from "./homeIcons";
import { t } from "../../i18n/lang";

export type ModeId = "duel" | "dreams" | "rooms";

export interface ModeCard {
  id: ModeId;
  name: string;
  /** One line on what it is. */
  line: string;
  icon: HomeIcon;
  /** A rival's element, drawn instead of the icon. */
  element?: string;
  /** Why it cannot be picked yet, when it cannot. */
  locked?: string;
  /** A small count in the corner: rooms open, a dream under way. */
  badge?: string;
}

/**
 * What Play starts, as a row of large cards — the way a brawler lays out its
 * events — rather than three buttons spread round the home screen. A duel's
 * card says which rival it is against and opens the rivals to change it.
 */
export const ModePicker: React.FC<{
  modes: ModeCard[];
  selected: ModeId;
  onSelect: (id: ModeId) => void;
  /** The duel's rival, and the way to pick another. */
  rival?: { name: string; element?: string };
  onChangeRival: () => void;
  onClose: () => void;
}> = ({ modes, selected, onSelect, rival, onChangeRival, onClose }) => (
  <Modal
    onClose={onClose}
    labelledBy="modes-title"
    className="max-w-3xl rounded-3xl border-2 border-gold/70 bg-paper p-5 shadow-[0_0_40px_rgb(var(--night)/0.8)] short:p-4"
  >
    <h2 id="modes-title" className="pr-10 font-display text-[24px] leading-none">
      {t("Pick a mode")}
    </h2>
    <div className="mt-4 grid grid-cols-3 gap-3 narrow:grid-cols-1">
      {modes.map((mode) => {
        const isSelected = mode.id === selected;
        return (
          <div
            key={mode.id}
            className={`relative flex flex-col rounded-2xl p-3 ${
              isSelected
                ? "bg-panel shadow-[inset_0_0_0_2.5px_rgb(var(--gold)),0_0_18px_rgb(var(--gold)/0.35)]"
                : "bg-panel/70 shadow-[inset_0_0_0_1.5px_rgb(var(--rule))]"
            } ${mode.locked ? "opacity-55" : ""}`}
          >
            <button
              type="button"
              disabled={!!mode.locked}
              onClick={() => onSelect(mode.id)}
              aria-pressed={isSelected}
              className="flex flex-1 flex-col items-start gap-2 text-left transition-transform active:scale-[0.97] disabled:active:scale-100"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-board text-gold">
                {mode.element ? (
                  <ElementGlyph element={mode.element} size={30} />
                ) : (
                  <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d={ICONS[mode.icon]} />
                  </svg>
                )}
              </span>
              <span className="font-display text-[20px] leading-none">{mode.name}</span>
              <span className="text-[12.5px] leading-snug text-graphite">
                {mode.locked ?? mode.line}
              </span>
            </button>
            {mode.id === "duel" && rival && (
              <button
                type="button"
                onClick={onChangeRival}
                className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-board px-2.5 py-2 text-left transition-transform active:scale-[0.97]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <ElementGlyph element={rival.element} size={14} />
                  <span className="truncate font-display text-[14px]">{rival.name}</span>
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-label text-gold">
                  {t("Change")}
                </span>
              </button>
            )}
            {mode.badge && (
              <span className="absolute right-2.5 top-2.5 rounded-full bg-gold px-2 font-mono text-[10px] uppercase tracking-label text-[#2a1b00]">
                {mode.badge}
              </span>
            )}
          </div>
        );
      })}
    </div>
  </Modal>
);

export default ModePicker;
