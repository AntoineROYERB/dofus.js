import { Effect, EffectKind } from "../types/message";

/** Sum of a given effect kind currently riding on a character, e.g. total shield. */
export const effectTotal = (
  effects: Effect[] | null | undefined,
  kind: EffectKind
): number =>
  (effects ?? [])
    .filter((effect) => effect.kind === kind)
    .reduce((sum, effect) => sum + effect.value, 0);
