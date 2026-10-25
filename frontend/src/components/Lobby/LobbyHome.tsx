import React from "react";
import { CharacterAppearance } from "../../types/game";
import { ContentResponse, Loadout } from "../../types/message";
import { CharacterShowcase } from "../Game/CharacterShowcase";
import { kitOf } from "../../utils/loadoutUtils";
import { ElementGlyph } from "../Game/ElementGlyph";
import { HomeIcon, ICONS } from "./homeIcons";

/*
 * The lobby as a brawler's home screen: your fighter, large, on a lit stage
 * in the middle, and the one thing you came to do — Play — as the biggest
 * target, bottom right, under the thumb. Around it, as few buttons as the
 * screen can do with, each opening what it stands for: who you are (top
 * left), how far up the rivals you have climbed (top middle), the menu (top
 * right), your gear (left), and what Play will start (bottom left). The
 * words that used to sit under the fighter — its passive, its rune — live
 * behind a tap on it, in the wardrobe.
 */

const PRESS = "transition-transform active:scale-[0.96]";

const Icon: React.FC<{ d: string; className?: string }> = ({ d, className = "h-[22px] w-[22px]" }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);



/** What Play starts, as the mode card bottom left shows it. */
export interface HomeMode {
  /** The mode's name, in the card's small caps: "Duel", "Endless Dreams". */
  label: string;
  /** What it is against, in the card's large type. */
  title: string;
  icon: HomeIcon;
  /** An element to show instead of the icon, for a duel's rival. */
  element?: string;
}

interface LobbyHomeProps {
  character: CharacterAppearance;
  content: ContentResponse | null;
  /** What the character wears and carries, once the content has settled it. */
  loadout: Loadout | undefined;
  connected: boolean;
  notice: string | null;
  /** The rivals beaten so far, and how many there are. */
  beaten: number;
  rivals: number;
  mode: HomeMode;
  /** Play is held while the mode cannot start (a duel while offline). */
  canPlay: boolean;
  onPlay: () => void;
  onRename: () => void;
  onOpenWardrobe: () => void;
  onOpenModes: () => void;
  onOpenRivals: () => void;
  onOpenMenu: () => void;
}

export const LobbyHome: React.FC<LobbyHomeProps> = ({
  character,
  content,
  loadout,
  connected,
  notice,
  beaten,
  rivals,
  mode,
  canPlay,
  onPlay,
  onRename,
  onOpenWardrobe,
  onOpenModes,
  onOpenRivals,
  onOpenMenu,
}) => {
  const kit = kitOf(loadout, content);
  return (
    <div className="relative h-[100dvh] select-none overflow-hidden bg-paper text-ink">
      {/* The stage: a pool of light, and a gold floor under the fighter. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 38% 70% at 50% 55%, rgb(var(--board) / 0.95) 0%, rgb(var(--board) / 0) 100%), radial-gradient(ellipse 60% 40% at 50% 0%, rgb(43 47 134 / 0.7), transparent 70%)",
        }}
      />

      {/*
        Centre stage. Laid over the whole screen rather than in a column, so
        the fighter sits on the screen's own centre line whatever the corners
        hold. Tapping the fighter opens the wardrobe, where everything about
        it can be read and changed.
      */}
      <div className="absolute inset-0 flex flex-col items-center px-[calc(max(env(safe-area-inset-left),env(safe-area-inset-right),16px)+96px)] pb-[calc(max(10px,env(safe-area-inset-bottom))+20px)] pt-[calc(max(10px,env(safe-area-inset-top))+50px)]">
        {/*
          The fighter's class above it, as a brawler's name sits over its
          stand — the player's own name is already top left — and its three
          numbers under the class, clear of the corners.
        */}
        <h1 className="flex flex-none items-center gap-2 font-display text-[26px] leading-none text-white [text-shadow:0_2px_0_rgb(var(--night)),2px_0_0_rgb(var(--night)),-2px_0_0_rgb(var(--night)),0_-2px_0_rgb(var(--night)),0_4px_0_rgb(var(--night))]">
          {kit && <ElementGlyph element={kit.element} size={22} />}
          {kit?.grimoire.name ?? character.name}
        </h1>
        {kit && (
          <p className="mt-1.5 flex flex-none items-center gap-3 rounded-full bg-panel/80 px-3.5 py-0.5 font-display text-[14px] tabular-nums shadow-[inset_0_0_0_1px_rgb(var(--gold)/0.35)]">
            <span className="text-hp">♥ {kit.grimoire.health}</span>
            <span className="text-pa">{kit.grimoire.actionPoints} AP</span>
            <span className="text-pm">{kit.grimoire.movementPoints} MP</span>
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mt-2 max-w-full flex-none rounded-full border border-vermilion bg-panel px-3 py-1 text-center text-[12px] text-vermilion"
          >
            {notice}
          </p>
        )}
        <button
          type="button"
          onClick={onOpenWardrobe}
          aria-label="Open the wardrobe"
          className={`relative flex min-h-0 w-full flex-1 items-end justify-center ${PRESS}`}
        >
          <CharacterShowcase
            color={character.color}
            outfit={kit?.outfit.sprite}
            glyph={kit?.grimoire.glyph}
            talisman={kit ? content?.spells[kit.talisman.ultimate]?.color : undefined}
            talismanId={kit?.talisman.id}
            figureScale={2.9}
            className="w-[min(100%,calc((100dvh-150px)*1.15))]"
          />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 pb-[max(10px,env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-[max(10px,env(safe-area-inset-top))] [&_button]:pointer-events-auto">
        {/* Top left: who you are. Tapping it renames you in place. */}
        <button
          type="button"
          onClick={onRename}
          className={`absolute left-[max(16px,env(safe-area-inset-left))] top-[max(10px,env(safe-area-inset-top))] flex items-center gap-2.5 rounded-2xl bg-panel/90 py-1.5 pl-1.5 pr-3.5 text-left shadow-[inset_0_0_0_1.5px_rgb(var(--gold)/0.5)] ${PRESS}`}
        >
          <span
            aria-hidden
            className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-gold font-display text-[19px] text-[#2a1b00]"
          >
            {character.symbol}
          </span>
          <span className="block max-w-[130px] truncate font-display text-[16px] leading-tight">
            {character.name}
          </span>
        </button>

        {/*
          Top middle: the climb. One dot a rival, gold once beaten; tapping it
          opens the rivals, in the order they come.
        */}
        <button
          type="button"
          onClick={onOpenRivals}
          aria-label={`Rivals: ${beaten} of ${rivals} beaten`}
          className={`absolute left-1/2 top-[max(10px,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-panel/90 py-1.5 pl-2 pr-4 shadow-[inset_0_0_0_1.5px_rgb(var(--gold)/0.5)] ${PRESS}`}
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gold text-[#2a1b00]">
            <Icon d={ICONS.trophy} className="h-[18px] w-[18px]" />
          </span>
          <span className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: rivals }, (_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rotate-45 ${
                  i < beaten ? "bg-gold shadow-[0_0_6px_rgb(var(--gold)/0.8)]" : "bg-night shadow-[inset_0_0_0_1.5px_rgb(var(--rule))]"
                }`}
              />
            ))}
          </span>
          <span className="font-display text-[15px] tabular-nums">
            {beaten}/{rivals}
          </span>
        </button>

        {/* Top right: whether the server is there, and the menu. */}
        <div className="absolute right-[max(16px,env(safe-area-inset-right))] top-[max(10px,env(safe-area-inset-top))] flex items-center gap-2.5">
          <span
            role="status"
            aria-label={connected ? "Online" : "Offline"}
            title={connected ? "Online" : "Offline"}
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-pm shadow-[0_0_8px_rgb(var(--pm)/0.8)]" : "animate-pulse bg-vermilion"
            }`}
          />
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Menu"
            className="btn-night grid h-11 w-11 place-items-center"
          >
            <Icon d={ICONS.menu} />
          </button>
        </div>

        {/* Left: the gear, the one place a fighter is changed. */}
        <button
          type="button"
          onClick={onOpenWardrobe}
          className={`absolute left-[max(16px,env(safe-area-inset-left))] top-1/2 flex h-[76px] w-[76px] -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-2xl bg-panel/90 shadow-[inset_0_0_0_1.5px_rgb(var(--gold)/0.5)] ${PRESS}`}
        >
          <span className="text-gold">
            <Icon d={ICONS.gear} className="h-7 w-7" />
          </span>
          <span className="font-display text-[13px]">Gear</span>
        </button>

        {/* Bottom left: what Play will start, and the way to change it. */}
        <button
          type="button"
          onClick={onOpenModes}
          className={`absolute bottom-[max(10px,env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] flex w-[min(280px,38vw)] items-center gap-3 rounded-2xl bg-panel/95 py-2 pl-2 pr-3 text-left shadow-[inset_0_0_0_1.5px_rgb(var(--gold)/0.6)] ${PRESS}`}
        >
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-board text-gold">
            {mode.element ? (
              <ElementGlyph element={mode.element} size={26} />
            ) : (
              <Icon d={ICONS[mode.icon]} className="h-7 w-7" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[9.5px] uppercase tracking-label text-gold">
              {mode.label}
            </span>
            <span className="block truncate font-display text-[17px] leading-tight">
              {mode.title}
            </span>
          </span>
          <span className="text-graphite">
            <Icon d={ICONS.chevron} className="h-5 w-5" />
          </span>
        </button>

        {/* Bottom right: the one big button. */}
        <button
          type="button"
          onClick={onPlay}
          disabled={!canPlay}
          className={`btn-gold absolute bottom-[max(10px,env(safe-area-inset-bottom))] right-[max(16px,env(safe-area-inset-right))] h-[64px] w-[210px] font-display text-[30px] uppercase ${
            canPlay ? "animate-beckon" : ""
          }`}
        >
          Play
        </button>
      </div>
    </div>
  );
};

export default LobbyHome;
