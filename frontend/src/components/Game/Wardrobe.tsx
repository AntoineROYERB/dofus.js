import React, { useEffect, useState } from "react";
import { infusedBook } from "../../utils/spellUtils";
import { ContentResponse, Loadout, SpellBook } from "../../types/message";
import { CharacterShowcase, ShowcaseCast } from "./CharacterShowcase";
import { OutfitIcon } from "./OutfitIcon";
import { RelicIcon } from "./RelicIcon";
import { ElementGlyph } from "./ElementGlyph";
import { SpellGlyph } from "./SpellGlyph";
import { AttackShape } from "./AttackShape";
import { grimoireRule, grimoireStats, runeFact, spellFacts, ultimateFacts } from "../../utils/gearFacts";
import { areaPattern } from "../../utils/spellUtils";
import { elementLook, elementName } from "../../utils/elements";
import { Key, t } from "../../i18n/lang";
import { useT } from "../../i18n/LanguageProvider";
import { hasRelic, runeKey } from "../../vfx/relics";
import {
  championOf,
  grimoireFor,
  kitOf,
  outfitFor,
  settleLoadout,
} from "../../utils/loadoutUtils";
import { useFxManifest } from "../../utils/fxManifest";
import { apiBaseUrl } from "../../lib/api";
import { Modal } from "../Overlay";

type Slot = "outfit" | "grimoire" | "rune" | "talisman";

interface WardrobeProps {
  /** Null while it is on its way, or when it never came. */
  content: ContentResponse | null;
  /** The content is not coming: the server did not answer. */
  failed?: boolean;
  loadout: Partial<Loadout> | undefined;
  /** Only drawn for a fighter without an outfit; players have no colour of their own. */
  color: string;
  name: string;
  onSave: (loadout: Loadout) => void;
  onCancel: () => void;
}

/**
 * What each slot is called, for what the character does with it, the one line
 * that says what it is for, and the side of the fighter it hangs on.
 */
const SLOTS: Record<Slot, { verb: Key; flavour: Key }> = {
  grimoire: {
    verb: "Element",
    flavour: "What you fight with: its grimoire's three spells, the rule they share, and the outfits that go with it.",
  },
  outfit: {
    verb: "Wears",
    flavour: "An outfit of your element. The weapon drawn in it is your basic attack.",
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
  /**
   * What it does, as a few short facts with their numbers — "6 dégâts ·
   * 3 PA · portée 7" — read off the content rather than a sentence.
   */
  facts?: string[];
  /** What picking it would also change, if anything. */
  note?: string;
  /** More than a line can say, shown on the shelf only. */
  detail?: React.ReactNode;
  icon: React.ReactNode;
};

const TextIcon: React.FC<{ size: number; children: React.ReactNode; tint?: string }> = ({
  size,
  children,
  tint,
}) => (
  <span
    aria-hidden
    className="grid flex-none place-items-center rounded-xl bg-board"
    style={{ width: size, height: size, fontSize: size * 0.5, backgroundColor: tint }}
  >
    {children}
  </span>
);

/** The rune's carved stone, its sign lit; its first letter if it has no stone. */
const RuneIcon: React.FC<{ size: number; id: string; name: string }> = ({ size, id, name }) => (
  <TextIcon size={size}>
    {hasRelic(runeKey(id)) ? (
      <RelicIcon id={runeKey(id)} unit={Math.max(1, Math.floor(size / 16))} />
    ) : (
    <span
      className="grid place-items-center border border-graphite bg-hairline font-display font-extrabold text-graphite"
      style={{ width: size * 0.55, height: size * 0.55, fontSize: size * 0.3, transform: "rotate(45deg)" }}
    >
      <span style={{ transform: "rotate(-45deg)" }}>{name.charAt(0)}</span>
    </span>
    )}
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
 * hung either side: its element first, then what it wears, the rune it
 * carries and the talisman it bears.
 *
 * Tapping one opens a shelf of what could take its place, on the far side so
 * the fighter stays in view and changes as each is tried on. On a phone held
 * upright the shelf rises from the bottom instead, under the stand.
 *
 * The element comes first. Each has one grimoire — its school — and a few
 * outfits: picking another element changes into one of its outfits, and the
 * outfit shelf only ever shows the element's own, so the draft is always a
 * set the server will accept and nothing changes behind the player's back.
 */
export const Wardrobe: React.FC<WardrobeProps> = ({ content, failed, loadout, onCancel, ...rest }) => {
  const kit = content && kitOf(settleLoadout(loadout, content), content);
  if (content && kit) {
    return <WardrobeSheet content={content} loadout={loadout} onCancel={onCancel} {...rest} />;
  }
  // Never a dead button: the wardrobe opens, and says why it is empty.
  return (
    <Modal
      onClose={onCancel}
      labelledBy="wardrobe-title"
      closeButton={false}
      className="max-w-md rounded-3xl border-2 border-gold/70 bg-panel p-5"
    >
      <h2 id="wardrobe-title" className="font-display text-[20px] font-bold leading-none tracking-tight">
        {t("The wardrobe")}
      </h2>
      <p className="mt-3 text-[13px] leading-snug text-graphite">
        {failed || content
          ? t("The server did not send the wardrobe. Is this branch's server running at {url}?", { url: apiBaseUrl() })
          : t("Bringing out the wardrobe…")}
      </p>
      <button
        type="button"
        onClick={onCancel}
        className={`mt-4 border border-rule px-4 py-2 font-display text-[14px] font-bold hover:border-ink ${PRESS}`}
      >
        {t("Close")}
      </button>
    </Modal>
  );
};

const WardrobeSheet: React.FC<Omit<WardrobeProps, "content" | "failed"> & { content: ContentResponse }> = ({
  content,
  loadout,
  color,
  onSave,
  onCancel,
}) => {
  const [draft, setDraft] = useState<Loadout | undefined>(() =>
    settleLoadout(loadout, content)
  );
  const [open, setOpen] = useState<Slot | null>(null);
  const [cast, setCast] = useState<ShowcaseCast | null>(null);
  const manifest = useFxManifest();
  useT();

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

  // A legendary's ultimate reads as it would be cast in the element worn.
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
    // Its real shape, turned to face along the stand, the way the board turns it.
    const { pattern, rotates } = areaPattern(spell.areaOfEffect);
    const area = pattern
      .map((p) => (rotates ? { x: target.x + p.y, y: target.y - p.x } : { x: target.x + p.x, y: target.y + p.y }))
      .filter((c) => STAND_CELLS.some((s) => s.x === c.x && s.y === c.y));
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
        return content.outfits
          .filter((o) => o.element === kit.element)
          .map((o) => {
            const attack = spells[o.basicAttack];
            return {
              id: o.id,
              title: o.name,
              line: attack ? attack.name : spellName(o.basicAttack),
              facts: attack ? spellFacts(attack) : undefined,
              detail: attack && (
                <span className="mt-1 block">
                  <AttackShape spell={attack} />
                </span>
              ),
              icon: <OutfitIcon sprite={o.sprite} size={size} />,
            };
          });
      case "grimoire":
        return content.grimoires.map((g) => ({
          id: g.id,
          title: `${elementName(g.element)} · ${g.name}`,
          line: grimoireRule(g),
          facts: grimoireStats(g),
          icon: (
            <TextIcon size={size}>
              <ElementGlyph element={g.element} size={Math.round(size * 0.6)} />
            </TextIcon>
          ),
        }));
      case "rune":
        return content.runes.map((r) => ({
          id: r.id,
          title: r.name,
          line: runeFact(r),
          icon: <RuneIcon size={size} id={r.id} name={r.name} />,
        }));
      case "talisman":
        return content.talismans.map((tal) => ({
          id: tal.id,
          title: tal.name,
          // The ultimate it carries, as facts; a legendary's adds your element.
          line: `${t("Ultimate")} · ${spellName(tal.ultimate)}`,
          facts: spells[tal.ultimate]
            ? ultimateFacts(spells[tal.ultimate], !!content.spells[tal.ultimate]?.infusions?.[kit.element])
            : undefined,
          icon: <TalismanIcon size={size} color={ultimateColor(tal.ultimate)} id={tal.id} />,
        }));
    }
  };

  const worn = (slot: Slot, size: number) =>
    items(slot, size).find((i) => i.id === draft[slot]) ?? items(slot, size)[0];

  /*
   * Each slot has its own frame colour, the way a brawler's gadgets, star
   * powers and gears each have theirs: the element's for what comes from it
   * (the grimoire, the outfit), the runes' violet, and gold for the talisman
   * that carries the ultimate.
   */
  const frame = (slot: Slot): string =>
    slot === "rune"
      ? "#a88cf0"
      : slot === "talisman"
        ? "rgb(var(--gold))"
        : elementLook(kit.element)?.color ?? "rgb(var(--gold))";

  /** A slot as a large square tile: its picture, what it is, its facts. */
  const slotTile = (slot: Slot) => {
    const item = worn(slot, 44);
    const active = open === slot;
    const line = item.facts?.length ? item.facts.join(" · ") : item.line;
    return (
      <button
        key={slot}
        type="button"
        aria-expanded={active}
        aria-controls="wardrobe-shelf"
        onClick={() => setOpen(active ? null : slot)}
        className={`relative flex min-w-0 flex-col items-start gap-1.5 rounded-2xl bg-panel/95 p-2.5 text-left ${PRESS}`}
        style={{
          boxShadow: active
            ? `inset 0 0 0 2.5px rgb(var(--gold)), 0 0 18px rgb(var(--gold) / 0.45)`
            : `inset 0 0 0 2px ${frame(slot)}, inset 0 -4px 0 rgb(var(--night) / 0.35)`,
        }}
      >
        <span className="flex w-full items-center gap-2">
          {item.icon}
          <span className="min-w-0 flex-1">
            <span className={`${MONO} block truncate`} style={{ color: frame(slot) }}>
              {t(SLOTS[slot].verb)}
            </span>
            <span className="line-clamp-2 font-display text-[14px] leading-tight">{item.title}</span>
          </span>
        </span>
        <span className="line-clamp-2 w-full font-display text-[12px] leading-snug text-graphite">
          {line}
        </span>
      </button>
    );
  };

  /** What could take a slot's place, as cards, where the tiles were. */
  const shelf = open && (
    <div id="wardrobe-shelf" role="region" aria-label={t(SLOTS[open].verb)} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <p className={MONO} style={{ color: frame(open) }}>
            {t(SLOTS[open].verb)}
          </p>
          <p className="text-[12px] leading-snug text-graphite">{t(SLOTS[open].flavour)}</p>
        </div>
        <button type="button" onClick={() => setOpen(null)} className="btn-night flex-none px-4 py-1.5 font-display text-[14px]">
          {t("Done")}
        </button>
      </div>
      <div
        role="radiogroup"
        aria-label={t(SLOTS[open].verb)}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-1 pr-1"
      >
        {items(open, 48).map((o) => {
          const chosen = draft[open] === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => pick(open, o.id)}
              className={`flex flex-none items-start gap-2.5 rounded-2xl p-2.5 text-left ${PRESS} ${
                chosen ? "bg-panel" : "bg-panel/60"
              }`}
              style={{
                boxShadow: chosen
                  ? "inset 0 0 0 2.5px rgb(var(--gold)), 0 0 14px rgb(var(--gold) / 0.35)"
                  : "inset 0 0 0 1.5px rgb(var(--rule))",
              }}
            >
              {o.icon}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[15px] leading-tight">{o.title}</span>
                  {chosen && (
                    <span className="flex-none rounded-full bg-gold px-2 font-mono text-[9px] uppercase tracking-label text-[#2a1b00]">
                      {t("Worn")}
                    </span>
                  )}
                </span>
                <span className="block text-[12px] leading-snug text-graphite">{o.line}</span>
                {o.facts && o.facts.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {o.facts.map((fact) => (
                      <span key={fact} className="rounded-full bg-board px-2 font-display text-[12px] leading-5 text-ink">
                        {fact}
                      </span>
                    ))}
                  </span>
                )}
                {o.detail}
                {o.note && !chosen && <span className={`${MONO} mt-0.5 block text-muted`}>{o.note}</span>}
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
    glyph: spells[id]?.baseId ?? spells[id]?.id,
    icon: spells[id]?.icon ?? "",
    color: spells[id]?.color,
    role: i === 0 ? "basic" : i === kit.bar.length - 1 ? "ultimate" : "spell",
  }));
  const roleName: Record<string, Key> = { basic: "basic", ultimate: "ultimate", spell: "spell" };
  const outlined =
    "[text-shadow:0_2px_0_rgb(var(--night)),2px_0_0_rgb(var(--night)),-2px_0_0_rgb(var(--night)),0_-2px_0_rgb(var(--night)),0_4px_0_rgb(var(--night))]";

  /*
   * A brawler's screen, full bleed: the fighter large on a lit stage on the
   * left, with its class, its numbers and its spells under it; the four
   * things it takes into a fight as tiles on the right, which give way to
   * the cards of what could replace one when it is tapped; and along the
   * bottom the champions' sets in one tap, and the gold button.
   */
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wardrobe-title"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-ink"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 34% 62% at 27% 52%, rgb(var(--board) / 0.95) 0%, rgb(var(--board) / 0) 100%), radial-gradient(ellipse 60% 40% at 30% 0%, rgb(43 47 134 / 0.7), transparent 70%)",
        }}
      />

      <header className="relative mx-auto flex w-full max-w-5xl flex-none items-center gap-3 px-4 pb-1 pt-2.5 short:pt-1.5">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("Leave the wardrobe")}
          className="btn-night grid h-11 w-11 flex-none place-items-center"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        {/*
          The fighter's class, large, where a brawler's screen names its
          brawler, and its three numbers beside it: up here rather than over
          the stage, where they covered the fighter's head on a phone.
        */}
        <h2 id="wardrobe-title" className={`flex min-w-0 items-center gap-2 font-display text-[24px] leading-none text-white ${outlined}`}>
          <span className="sr-only">{t("The wardrobe")} · </span>
          <ElementGlyph element={kit.element} size={20} />
          <span className="truncate">{kit.grimoire.name}</span>
        </h2>
        <p className="flex flex-none items-center gap-3 rounded-full bg-panel/80 px-3.5 py-0.5 font-display text-[14px] tabular-nums shadow-[inset_0_0_0_1px_rgb(var(--gold)/0.35)] narrow:hidden">
          <span className="text-hp">♥ {kit.grimoire.health}</span>
          <span className="text-pa">{t("{n} AP", { n: kit.grimoire.actionPoints })}</span>
          <span className="text-pm">{t("{n} MP", { n: kit.grimoire.movementPoints })}</span>
        </p>
        <span className="ml-auto flex min-w-0 max-w-[40%] items-center gap-1.5 rounded-full narrow:hidden bg-panel/90 px-3 py-1 font-display text-[13px] shadow-[inset_0_0_0_1.5px_rgb(var(--gold)/0.5)]">
          <ElementGlyph element={kit.element} size={14} />
          <span className="truncate">
            {champion ? t("{name}'s set", { name: champion.name }) : t("your own set")}
          </span>
        </span>
      </header>

      <div className="relative mx-auto grid min-h-0 w-full max-w-5xl flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 px-4 py-2 narrow:flex narrow:flex-col narrow:gap-2 narrow:overflow-y-auto">
        {/* The stage. */}
        <div className="flex min-h-0 flex-col items-center narrow:flex-none">
          <p className="hidden flex-none items-center gap-3 rounded-full bg-panel/80 px-3.5 py-0.5 font-display text-[14px] tabular-nums shadow-[inset_0_0_0_1px_rgb(var(--gold)/0.35)] narrow:flex">
            <span className="text-hp">♥ {kit.grimoire.health}</span>
            <span className="text-pa">{t("{n} AP", { n: kit.grimoire.actionPoints })}</span>
            <span className="text-pm">{t("{n} MP", { n: kit.grimoire.movementPoints })}</span>
          </p>
          <div className="flex min-h-0 w-full flex-1 items-end justify-center narrow:h-[min(44dvh,300px)] narrow:flex-none">
            <CharacterShowcase
              color={color}
              outfit={kit.outfit.sprite}
              glyph={kit.grimoire.glyph}
              talisman={ultimateColor(kit.talisman.ultimate)}
              talismanId={kit.talisman.id}
              cast={cast}
              figureScale={2.5}
              className="w-[min(100%,360px,calc((100dvh-190px)*1.15))]"
            />
          </div>
          {/* The spells, as round buttons: a tap casts one on the stand. */}
          <ol aria-label={t("Spell bar")} className="mt-1 flex flex-none flex-wrap justify-center gap-2">
            {bar.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  title={t("{role} — cast it on the stand", { role: t(roleName[s.role]) })}
                  aria-label={t("Cast {name}, {role}", { name: s.name, role: t(roleName[s.role]) })}
                  onClick={() => play(s.id)}
                  className={`flex w-[58px] flex-col items-center gap-0.5 ${PRESS}`}
                >
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full bg-panel"
                    style={{
                      color: s.role === "ultimate" ? "rgb(var(--gold))" : s.color,
                      boxShadow:
                        s.role === "ultimate"
                          ? "inset 0 0 0 2px rgb(var(--gold)), 0 0 12px rgb(var(--gold) / 0.4)"
                          : "inset 0 0 0 1.5px rgb(var(--rule))",
                    }}
                  >
                    {s.glyph !== undefined ? (
                      <SpellGlyph spellId={s.glyph} fallback={s.icon} className="h-[22px] w-[22px]" />
                    ) : (
                      s.icon
                    )}
                  </span>
                  <span className="w-full truncate text-center font-display text-[11px] leading-tight text-graphite">
                    {s.name}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* The gear: four tiles, or the cards of the slot being changed. */}
        <div className="flex min-h-0 flex-col narrow:flex-none">
          {shelf || (
            <div className="grid flex-1 grid-cols-2 content-center gap-2.5">
              {(["grimoire", "outfit", "rune", "talisman"] as Slot[]).map(slotTile)}
            </div>
          )}
        </div>
      </div>

      <footer className="relative mx-auto flex w-full max-w-5xl flex-none items-center gap-3 px-4 pb-2.5 pt-1.5 narrow:flex-col narrow:items-stretch narrow:gap-2">
        {/* A champion's whole set, in one tap. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          <span className={`${MONO} flex-none text-gold`}>{t("A champion's set")}</span>
          {content.champions.map((c) => {
            const set = kitOf(c.set, content);
            const on = champion?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setDraft(c.set)}
                aria-label={t("{name}'s set", { name: c.name })}
                title={t("{name}'s set", { name: c.name })}
                className={`grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-full bg-panel ${PRESS}`}
                style={{
                  boxShadow: on
                    ? "inset 0 0 0 2.5px rgb(var(--gold)), 0 0 12px rgb(var(--gold) / 0.5)"
                    : "inset 0 0 0 1.5px rgb(var(--rule))",
                }}
              >
                {set && <OutfitIcon sprite={set.outfit.sprite} size={34} framed={false} />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="btn-gold h-14 flex-none px-9 font-display text-[22px] uppercase"
        >
          {t("Gear up")}
        </button>
      </footer>
    </div>
  );
};

export default Wardrobe;
