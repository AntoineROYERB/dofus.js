import React, { useEffect, useState } from "react";
import { infusedBook } from "../../utils/spellUtils";
import { ContentResponse, Loadout, SpellBook } from "../../types/message";
import { CharacterShowcase, ShowcaseCast } from "./CharacterShowcase";
import { RelicIcon } from "./RelicIcon";
import { hasRelic } from "../../vfx/relics";
import {
  championOf,
  grimoireFor,
  kitOf,
  outfitFor,
  settleLoadout,
} from "../../utils/loadoutUtils";
import { outfitSheet, useFxManifest } from "../../utils/fxManifest";
import { apiBaseUrl } from "../../lib/api";

type Slot = "outfit" | "grimoire" | "rune" | "talisman";

interface WardrobeProps {
  /** Null while it is on its way, or when it never came. */
  content: ContentResponse | null;
  /** The content is not coming: the server did not answer. */
  failed?: boolean;
  loadout: Partial<Loadout> | undefined;
  /** The player's own colour, on the trims of every outfit. */
  color: string;
  name: string;
  onSave: (loadout: Loadout) => void;
  onCancel: () => void;
}

/**
 * What each slot is called, for what the character does with it, the one line
 * that says what it is for, and the side of the fighter it hangs on.
 */
const SLOTS: Record<Slot, { verb: string; flavour: string }> = {
  outfit: {
    verb: "Wears",
    flavour: "What you wear is your element, and the weapon drawn in it is your basic attack.",
  },
  grimoire: {
    verb: "Reads from",
    flavour: "Three spells and the rule they share. It speaks your outfit's element.",
  },
  rune: {
    verb: "Carries the rune",
    flavour: "Carved stone. It does not care what you wear.",
  },
  talisman: {
    verb: "Bears",
    flavour: "It circles you, and brightens when your ultimate is ready.",
  },
};
const LEFT: Slot[] = ["outfit", "grimoire"];
const RIGHT: Slot[] = ["rune", "talisman"];
/** On a phone held upright: two by two under the fighter. */
const UPRIGHT: Record<Slot, string> = {
  outfit: "narrow:col-start-1 narrow:row-start-2",
  grimoire: "narrow:col-start-1 narrow:row-start-3",
  rune: "narrow:col-start-2 narrow:row-start-2",
  talisman: "narrow:col-start-2 narrow:row-start-3",
};

/** The stand's cells, two from its middle, in board coordinates. */
const STAND_CELLS = [-2, -1, 0, 1, 2].flatMap((x) =>
  [-2, -1, 0, 1, 2].filter((y) => Math.abs(x) + Math.abs(y) <= 2).map((y) => ({ x, y }))
);

const MONO = "font-mono text-[9.5px] uppercase tracking-label";
const PRESS = "transition-transform active:scale-[0.97]";

/** An item as a slot or a shelf shows it: a picture, a name, one line. */
type Item = {
  id: string;
  title: string;
  line: string;
  /** What picking it would also change, if anything. */
  note?: string;
  icon: React.ReactNode;
};

/** The outfit itself, facing you: its idle sheet's first frame, cropped to the figure. */
const OutfitIcon: React.FC<{ sprite: string; size: number }> = ({ sprite, size }) => {
  // A frame twice the icon's size, so the figure — a third of its frame —
  // fills the icon; the sheet is 24 frames by 8 directions, south on row 3.
  const frame = size * 2.1;
  return (
    <span
      aria-hidden
      className="block flex-none border border-hairline bg-board"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${outfitSheet(sprite, "Idle")})`,
        backgroundSize: `${frame * 24}px ${frame * 8}px`,
        backgroundPosition: `${-(frame / 2 - size / 2)}px ${-(3 * frame + frame * 0.49 - size / 2)}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      }}
    />
  );
};

const TextIcon: React.FC<{ size: number; children: React.ReactNode; tint?: string }> = ({
  size,
  children,
  tint,
}) => (
  <span
    aria-hidden
    className="grid flex-none place-items-center border border-hairline bg-board"
    style={{ width: size, height: size, fontSize: size * 0.5, backgroundColor: tint }}
  >
    {children}
  </span>
);

/** A carved stone: the same for every rune, its first letter cut in it. */
const RuneIcon: React.FC<{ size: number; name: string }> = ({ size, name }) => (
  <TextIcon size={size}>
    <span
      className="grid place-items-center border border-graphite bg-hairline font-display font-extrabold text-graphite"
      style={{ width: size * 0.55, height: size * 0.55, fontSize: size * 0.3, transform: "rotate(45deg)" }}
    >
      <span style={{ transform: "rotate(-45deg)" }}>{name.charAt(0)}</span>
    </span>
  </TextIcon>
);

/** The talisman's shard, alive; a gem in its ultimate's colour if it has none. */
const TalismanIcon: React.FC<{ size: number; color: string; id: string }> = ({ size, color, id }) => (
  <TextIcon size={size}>
    {hasRelic(id) ? (
      <RelicIcon id={id} unit={Math.max(1, Math.floor(size / 16))} />
    ) : (
    <span
      className="block border border-ink"
      style={{
        width: size * 0.34,
        height: size * 0.34,
        backgroundColor: color,
        boxShadow: `0 0 ${size * 0.3}px ${size * 0.06}px ${color}`,
        transform: "rotate(45deg)",
      }}
    />
    )}
  </TextIcon>
);

/**
 * Where a character is dressed for a fight, the way a role-playing game's
 * character sheet is: the fighter on a stand in the middle, on its grimoire's
 * circle, its talisman circling it; the four things it takes into the fight
 * hung either side, each named for what the character does with it — wears
 * an outfit, reads from a grimoire, carries a rune, bears a talisman.
 *
 * Tapping one opens a shelf of what could take its place, on the far side so
 * the fighter stays in view and changes as each is tried on. On a phone held
 * upright the shelf rises from the bottom instead, under the stand.
 *
 * The outfit decides the element and the grimoire follows it: picking an
 * outfit of another element brings a grimoire of that element along, and
 * picking a grimoire of another element changes the outfit to match, so the
 * draft is always a set the server will accept.
 */
export const Wardrobe: React.FC<WardrobeProps> = ({ content, failed, loadout, onCancel, ...rest }) => {
  const kit = content && kitOf(settleLoadout(loadout, content), content);
  if (content && kit) {
    return <WardrobeSheet content={content} loadout={loadout} onCancel={onCancel} {...rest} />;
  }
  // Never a dead button: the wardrobe opens, and says why it is empty.
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wardrobe-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md border border-rule bg-paper p-5"
      >
        <h2 id="wardrobe-title" className="font-display text-[20px] font-bold leading-none tracking-tight">
          The wardrobe
        </h2>
        <p className="mt-3 text-[13px] leading-snug text-graphite">
          {failed || content
            ? `The server did not send the wardrobe. Is this branch's server running at ${apiBaseUrl()}?`
            : "Bringing out the wardrobe…"}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className={`mt-4 border border-rule px-4 py-2 font-display text-[14px] font-bold hover:border-ink ${PRESS}`}
        >
          Close
        </button>
      </div>
    </div>
  );
};

const WardrobeSheet: React.FC<Omit<WardrobeProps, "content" | "failed"> & { content: ContentResponse }> = ({
  content,
  loadout,
  color,
  name,
  onSave,
  onCancel,
}) => {
  const [draft, setDraft] = useState<Loadout | undefined>(() =>
    settleLoadout(loadout, content)
  );
  const [open, setOpen] = useState<Slot | null>(null);
  const [cast, setCast] = useState<ShowcaseCast | null>(null);
  const manifest = useFxManifest();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (open) setOpen(null);
      else onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const kit = kitOf(draft, content);
  if (!draft || !kit) return null;

  // A legendary's ultimate reads as it would be cast in the outfit worn.
  const spells: SpellBook = infusedBook(content.spells, kit.element) ?? content.spells;
  const spellName = (id: string) => spells[id]?.name ?? id;
  const ultimateColor = (id: string) => spells[id]?.color ?? "#d1462f";
  const champion = championOf(draft, content.champions);

  /**
   * Casts a spell on the stand, the way it goes off in a fight: at your own
   * feet, on the cell next to you, or two cells off, and over the cells
   * around its mark when it covers an area.
   */
  const play = (spellId: string) => {
    const fx = manifest?.spells[spellId];
    const spell = spells[spellId];
    if (!fx || !spell) return;
    const target =
      spell.targeting === "self" || spell.range === 0
        ? { x: 0, y: 0 }
        : spell.range === 1
          ? { x: 1, y: 0 }
          : { x: 2, y: 0 };
    const area =
      spell.areaOfEffect && spell.areaOfEffect !== "none"
        ? STAND_CELLS.filter(
            (c) => Math.abs(c.x - target.x) + Math.abs(c.y - target.y) <= 1
          )
        : [target];
    setCast({ key: Date.now(), spell: fx, target, area });
  };

  const pick = (slot: Slot, id: string) => {
    let next: Loadout = { ...draft, [slot]: id };
    if (slot === "outfit") {
      const outfit = content.outfits.find((o) => o.id === id);
      const grimoire = outfit && grimoireFor(outfit, kit.grimoire, content.grimoires);
      if (grimoire) next = { ...next, grimoire: grimoire.id };
    }
    if (slot === "grimoire") {
      const grimoire = content.grimoires.find((g) => g.id === id);
      const outfit = grimoire && outfitFor(grimoire, kit.outfit, content.outfits);
      if (outfit) next = { ...next, outfit: outfit.id };
    }
    setDraft(next);
    // A new outfit shows off its weapon.
    if (slot === "outfit") {
      const outfit = content.outfits.find((o) => o.id === id);
      if (outfit) play(outfit.basicAttack);
    }
  };

  /** Every item that could fill a slot; the one worn is `draft[slot]`. */
  const items = (slot: Slot, size: number): Item[] => {
    switch (slot) {
      case "outfit":
        return content.outfits.map((o) => ({
          id: o.id,
          title: o.name,
          line: `${o.element} · ${o.weapon} · ${spellName(o.basicAttack)}`,
          note:
            o.element !== kit.element
              ? `Your grimoire becomes ${grimoireFor(o, kit.grimoire, content.grimoires)?.name ?? "one of its element"}`
              : undefined,
          icon: <OutfitIcon sprite={o.sprite} size={size} />,
        }));
      case "grimoire":
        return content.grimoires.map((g) => ({
          id: g.id,
          title: g.name,
          line: `${g.spells.map(spellName).join(" · ")} — ${g.passive}`,
          note:
            g.element !== kit.element
              ? `You change into ${outfitFor(g, kit.outfit, content.outfits)?.name ?? `a ${g.element} outfit`}`
              : undefined,
          icon: <TextIcon size={size}>{g.symbol}</TextIcon>,
        }));
      case "rune":
        return content.runes.map((r) => ({
          id: r.id,
          title: r.name,
          line: r.description,
          icon: <RuneIcon size={size} name={r.name} />,
        }));
      case "talisman":
        return content.talismans.map((t) => ({
          id: t.id,
          title: t.name,
          line: `Ultimate · ${spellName(t.ultimate)} — ${spells[t.ultimate]?.description ?? ""}`,
          icon: <TalismanIcon size={size} color={ultimateColor(t.ultimate)} id={t.id} />,
        }));
    }
  };

  const worn = (slot: Slot, size: number) =>
    items(slot, size).find((i) => i.id === draft[slot]) ?? items(slot, size)[0];

  /** A slot hung beside the fighter: what it holds, and a tap to change it. */
  const slotButton = (slot: Slot, align: "left" | "right") => {
    const item = worn(slot, 40);
    const active = open === slot;
    // The grimoire's line is long; the slot shows its spells only.
    const line = slot === "grimoire" ? kit.grimoire.spells.map(spellName).join(" · ") : item.line;
    return (
      <button
        key={slot}
        type="button"
        aria-expanded={active}
        aria-controls="wardrobe-shelf"
        onClick={() => setOpen(active ? null : slot)}
        className={`flex w-full min-w-0 items-center gap-2.5 border px-2 py-2 text-left ${PRESS} ${
          align === "right" ? "flex-row-reverse text-right" : ""
        } ${active ? "border-ink bg-board" : "border-rule bg-panel/90 hover:border-graphite"}`}
      >
        {item.icon}
        <span className="min-w-0 flex-1">
          <span className={`${MONO} block truncate text-muted`}>{SLOTS[slot].verb}</span>
          <span className="block truncate font-display text-[14px] font-bold leading-tight">
            {item.title}
          </span>
          <span className="block truncate text-[11px] leading-snug text-graphite">{line}</span>
        </span>
      </button>
    );
  };

  const shelf = open && (
    <div
      id="wardrobe-shelf"
      role="region"
      aria-label={SLOTS[open].verb}
      className={`absolute z-10 flex flex-col border-rule bg-panel narrow:inset-x-0 narrow:bottom-0 narrow:top-[46%] narrow:border-t ${
        LEFT.includes(open)
          ? "sm:inset-y-0 sm:right-0 sm:w-[min(40%,340px)] sm:border-l"
          : "sm:inset-y-0 sm:left-0 sm:w-[min(40%,340px)] sm:border-r"
      }`}
    >
      <div className="flex flex-none items-start justify-between gap-3 border-b border-hairline px-3 pb-2 pt-2.5">
        <div className="min-w-0">
          <p className={`${MONO} text-muted`}>{SLOTS[open].verb}</p>
          <p className="text-[11.5px] italic leading-snug text-graphite">{SLOTS[open].flavour}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(null)}
          className={`${MONO} flex-none border border-rule px-2 py-1 text-ink hover:border-ink`}
        >
          Done
        </button>
      </div>
      <div role="radiogroup" aria-label={SLOTS[open].verb} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {items(open, 44).map((o) => {
          const chosen = draft[open] === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => pick(open, o.id)}
              className={`flex flex-none items-start gap-2.5 border px-2 py-2 text-left ${PRESS} ${
                chosen ? "border-ink bg-board" : "border-rule hover:border-graphite"
              }`}
            >
              {o.icon}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[13.5px] font-bold leading-tight">{o.title}</span>
                  {chosen && <span className={`${MONO} flex-none text-vermilion`}>Worn</span>}
                </span>
                <span className="block text-[11.5px] leading-snug text-graphite">{o.line}</span>
                {o.note && !chosen && (
                  <span className={`${MONO} mt-0.5 block text-muted`}>{o.note}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const bar = kit.bar.map((id, i) => ({
    id,
    name: spellName(id),
    role: i === 0 ? "basic" : i === kit.bar.length - 1 ? "ultimate" : "spell",
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 md:items-center md:px-6 md:py-6 short:items-stretch short:p-0"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wardrobe-title"
        onClick={(event) => event.stopPropagation()}
        className="relative flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-paper pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] md:h-[min(640px,92dvh)] md:border md:border-rule short:h-[100dvh] short:max-w-none short:border-0"
      >
        <header className="flex flex-none items-center gap-3 border-b-2 border-ink px-4 pb-1.5 pt-2.5 short:pt-1.5">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Leave the wardrobe"
            className={`grid h-8 w-8 flex-none place-items-center border border-rule text-ink hover:border-ink ${PRESS}`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h2 id="wardrobe-title" className="font-display text-[20px] font-bold leading-none tracking-tight">
            The wardrobe
          </h2>
          <span className={`${MONO} ml-auto truncate text-muted`}>
            {champion ? `${champion.name}'s set` : "Your own set"}
          </span>
        </header>

        {/*
          The character sheet: two slots either side of the fighter. On a
          phone held upright, the fighter above and the four slots under it.
        */}
        <div className="relative grid min-h-0 flex-1 overflow-hidden grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] items-center gap-3 px-4 py-3 narrow:grid-cols-2 narrow:grid-rows-[minmax(0,1fr)_auto_auto] narrow:content-start narrow:gap-2 short:py-2">
          <div className="flex flex-col gap-3 narrow:contents">
            {LEFT.map((slot) => (
              <div key={slot} className={UPRIGHT[slot]}>
                {slotButton(slot, "left")}
              </div>
            ))}
          </div>

          {/*
            Upright, the shelf rises over the slots and the lower half; the
            fighter moves up to stay in view, without the lines under it.
          */}
          <div className="flex min-h-0 flex-col items-center self-stretch narrow:col-span-2 narrow:row-start-1">
            <div
              className={`flex min-h-0 w-full flex-1 justify-center ${
                open ? "items-end narrow:items-start narrow:pt-10" : "items-end"
              }`}
            >
              <CharacterShowcase
                color={color}
                outfit={kit.outfit.sprite}
                glyph={kit.grimoire.glyph}
                talisman={ultimateColor(kit.talisman.ultimate)}
                talismanId={kit.talisman.id}
                cast={cast}
                figureScale={2.3}
                className="w-[min(100%,320px,calc((100dvh-170px)*1.2))] narrow:w-[min(92%,340px,calc((100dvh-400px)*1.2))]"
              />
            </div>
            <div className={`contents ${open ? "narrow:hidden" : ""}`}>
            <p className="mt-0.5 flex items-center gap-1.5 font-display text-[16px] font-bold leading-tight">
              <span aria-hidden className="h-2.5 w-2.5" style={{ backgroundColor: color }} />
              {name}
            </p>
            <p className={`${MONO} mt-0.5 text-graphite`}>
              {kit.element} · {kit.grimoire.health} hp · {kit.grimoire.actionPoints} ap ·{" "}
              {kit.grimoire.movementPoints} mp
            </p>
            <ol aria-label="Spell bar" className="mt-1.5 flex max-w-full flex-wrap justify-center gap-1">
              {bar.map((s) => (
                <li key={s.id}>
                  {/* A tap casts it on the stand. */}
                  <button
                    type="button"
                    title={`${s.role} — cast it on the stand`}
                    aria-label={`Cast ${s.name}, ${s.role}`}
                    onClick={() => play(s.id)}
                    className={`border px-1.5 py-0.5 text-[11px] leading-tight ${PRESS} ${
                      s.role === "ultimate"
                        ? "border-ink bg-ink text-paper"
                        : s.role === "basic"
                          ? "border-rule bg-board text-ink hover:border-ink"
                          : "border-hairline bg-panel text-graphite hover:border-ink"
                    }`}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ol>
            </div>
          </div>

          <div className="flex flex-col gap-3 narrow:contents">
            {RIGHT.map((slot) => (
              <div key={slot} className={UPRIGHT[slot]}>
                {slotButton(slot, "right")}
              </div>
            ))}
          </div>

          {shelf}
        </div>

        <footer className="flex flex-none items-center gap-2 border-t border-rule px-4 py-2.5 narrow:flex-col narrow:items-stretch">
          {/* A champion's whole set, in one tap. */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            <span className={`${MONO} mr-1 flex-none text-muted`}>A champion's set</span>
            {content.champions.map((c) => {
              const set = kitOf(c.set, content);
              const on = champion?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraft(c.set)}
                  aria-label={`${c.name}'s set`}
                  title={`${c.name}'s set`}
                  className={`flex-none border-2 p-0.5 ${PRESS} ${
                    on ? "border-ink" : "border-transparent hover:border-rule"
                  }`}
                >
                  {set && <OutfitIcon sprite={set.outfit.sprite} size={30} />}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className={`flex-none bg-vermilion px-8 py-2.5 font-display text-[16px] font-extrabold uppercase tracking-wide text-white hover:bg-[#b93a25] ${PRESS}`}
          >
            Gear up
          </button>
        </footer>
      </div>
    </div>
  );
};

export default Wardrobe;
