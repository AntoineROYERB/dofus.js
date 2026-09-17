import React from "react";
import { CharacterAppearance } from "../../types/game";
import { CharacterClass } from "../../types/message";
import { CharacterShowcase } from "../Game/CharacterShowcase";
import { ClassTag } from "../Game/ClassTag";
import { ClassCarousel } from "./ClassCarousel";

/*
 * The lobby as a phone game's home screen: your fighter in the middle, the
 * one thing you came to do — play — as the biggest target, bottom right,
 * under the thumb. Everything else is a small tile along the edges, and new
 * features get a tile of their own rather than a new page.
 *
 * It borrows the board's vocabulary: hairline rules on paper, no shadows,
 * and vermilion only on the button that starts a fight.
 */

/** Every container on this screen: a 1px rule on panel paper, no shadow. */
const HAIRLINE = "border border-rule bg-panel/90";
/** A tap shows by the thing giving way a little, not by a shadow moving. */
const PRESS = "transition-transform active:scale-[0.97]";

const Icon: React.FC<{ d: string }> = ({ d }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className="h-[22px] w-[22px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  swords: "M14.5 4H20v5.5L9 20.5 3.5 15zM6 13l5 5M4 20l2.5-2.5",
  games: "M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  help: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
} as const;

/** A square tile on the side rails: an icon over a mono label. */
export const HomeTile: React.FC<{
  icon: keyof typeof ICONS;
  label: string;
  onClick: () => void;
  badge?: string | number;
}> = ({ icon, label, onClick, badge }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex h-[58px] w-[64px] flex-col items-center justify-center gap-1 text-ink ${HAIRLINE} ${PRESS}`}
  >
    <Icon d={ICONS[icon]} />
    <span className="font-mono text-[8.5px] uppercase tracking-label text-graphite">
      {label}
    </span>
    {badge !== undefined && (
      <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-vermilion px-1 font-mono text-[10px] font-semibold text-white">
        {badge}
      </span>
    )}
  </button>
);

interface LobbyHomeProps {
  character: CharacterAppearance;
  classes: CharacterClass[];
  connected: boolean;
  notice: string | null;
  /** The computer opponent Play will start a fight against. */
  opponent?: CharacterClass;
  beaten: number;
  openRooms: number;
  onPlay: () => void;
  onRename: () => void;
  /** Turning the line-up in the middle picks the player's class. */
  onSelectClass: (cls: CharacterClass) => void;
  onOpenOpponents: () => void;
  onOpenRooms: () => void;
  onOpenHistory: () => void;
  onOpenHelp: () => void;
}

export const LobbyHome: React.FC<LobbyHomeProps> = ({
  character,
  classes,
  connected,
  notice,
  opponent,
  beaten,
  openRooms,
  onPlay,
  onRename,
  onSelectClass,
  onOpenOpponents,
  onOpenRooms,
  onOpenHistory,
  onOpenHelp,
}) => (
  <div className="relative h-[100dvh] select-none overflow-hidden bg-paper text-ink">
    {/* A pool of light under the fighter, so the middle reads as a stage. */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 45% 60% at 50% 58%, #ffffff 0%, rgba(255,255,255,0) 100%)",
      }}
    />

    {/*
      Centre stage: the fighter. It is laid over the whole screen rather than
      in the grid's middle column, whose position shifts with the width of the
      cards beside it — a longer class name used to nudge the stand sideways.
      Its padding clears the side rails and the bottom row, the same on both
      sides so the stand sits on the screen's own centre line.
    */}
    <div className="absolute inset-0 flex flex-col items-center px-[calc(max(env(safe-area-inset-left),env(safe-area-inset-right),16px)+80px)] pb-[calc(max(10px,env(safe-area-inset-bottom))+70px)] pt-[max(10px,env(safe-area-inset-top))]">
      <p className={`mt-1 flex flex-none items-center gap-2 px-3 py-1 font-display text-[17px] font-bold leading-tight tracking-tight ${HAIRLINE}`}>
        <span
          aria-hidden
          className="h-2.5 w-2.5 flex-none transition-colors duration-300"
          style={{ backgroundColor: character.color }}
        />
        {character.name}
      </p>
      {notice && (
        <p
          role="status"
          className="mt-2 max-w-full flex-none border border-vermilion bg-panel px-3 py-1.5 text-center text-[12px] text-vermilion"
        >
          {notice}
        </p>
      )}
      <div className="flex min-h-0 w-full flex-1 items-end justify-center">
        {classes.length > 0 ? (
          <ClassCarousel
            classes={classes}
            selectedId={character.class}
            onSelect={onSelectClass}
          />
        ) : (
          <CharacterShowcase
            color={character.color}
            figureScale={2.7}
            className="w-[min(100%,calc((100dvh-150px)*1.2))]"
          />
        )}
      </div>
    </div>

    <div className="pointer-events-none relative grid h-full [&>*]:pointer-events-auto grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] gap-x-4 gap-y-2 pb-[max(10px,env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-[max(10px,env(safe-area-inset-top))]">
      {/* Top left: who you are. Tapping it renames you in place. */}
      <button
        type="button"
        onClick={onRename}
        className={`col-start-1 row-start-1 flex items-center gap-2.5 self-start py-1.5 pl-1.5 pr-3 text-left ${HAIRLINE} ${PRESS}`}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 flex-none place-items-center font-display text-[18px] font-bold text-white"
          style={{ backgroundColor: character.color }}
        >
          {character.symbol}
        </span>
        <span className="min-w-0">
          <span className="block max-w-[140px] truncate font-display text-[15px] font-bold leading-tight">
            {character.name}
          </span>
          <span className="flex items-center gap-1.5">
            <ClassTag classId={character.class} classes={classes} />
          </span>
        </span>
      </button>

      {/* Top right: progress and whether the server is there at all. */}
      <div className="col-start-3 row-start-1 flex items-center gap-2 self-start justify-self-end">
        <span className={`px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-graphite ${HAIRLINE}`}>
          <b className="font-semibold tabular-nums text-ink">
            {beaten}/{classes.length}
          </b>{" "}
          beaten
        </span>
        <span
          className={`flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-graphite ${HAIRLINE}`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-pm" : "bg-vermilion"
            }`}
          />
          {connected ? "online" : "offline"}
        </span>
      </div>

      {/* Side rails. */}
      <nav
        aria-label="Menu"
        className="col-start-1 row-start-2 flex flex-col gap-3 self-center"
      >
        <HomeTile icon="swords" label="Rivals" onClick={onOpenOpponents} />
        <HomeTile icon="history" label="History" onClick={onOpenHistory} />
      </nav>
      <nav
        aria-label="More"
        className="col-start-3 row-start-2 flex flex-col items-end gap-3 self-center"
      >
        <HomeTile
          icon="games"
          label="Rooms"
          onClick={onOpenRooms}
          badge={openRooms > 0 ? openRooms : undefined}
        />
        <HomeTile icon="help" label="Help" onClick={onOpenHelp} />
      </nav>

      {/* Bottom left: what Play will do, and the way to change it. */}
      <button
        type="button"
        onClick={onOpenOpponents}
        className={`col-span-2 col-start-1 row-start-3 flex min-w-0 items-center gap-3 self-end justify-self-start py-1.5 pl-1.5 pr-4 text-left ${HAIRLINE} ${PRESS}`}
      >
        <span
          aria-hidden
          className="grid h-11 w-11 flex-none place-items-center border border-hairline bg-board text-[22px]"
        >
          {opponent?.symbol ?? "⚔"}
        </span>
        <span className="min-w-0">
          <span className="block font-mono text-[9px] uppercase tracking-label text-muted">
            Solo · {opponent?.name ?? "computer"}
          </span>
          <span className="block max-w-[260px] truncate font-display text-[16px] font-bold leading-tight">
            {opponent?.opponent.name ?? "Computer opponent"}
          </span>
        </span>
        <span className="ml-1 font-mono text-[9px] uppercase tracking-label text-vermilion">
          Change
        </span>
      </button>

      {/* Bottom right: the one big button. */}
      <button
        type="button"
        onClick={onPlay}
        disabled={!connected}
        className={`col-start-3 row-start-3 h-[60px] w-[210px] self-end bg-vermilion font-display text-[24px] font-extrabold uppercase tracking-wide text-white hover:bg-[#b93a25] disabled:bg-hairline disabled:text-muted ${PRESS}`}
      >
        Play
      </button>
    </div>
  </div>
);

export default LobbyHome;
