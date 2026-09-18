/**
 * Whether the board should damp its animations.
 *
 * It used to answer the system's `prefers-reduced-motion`, and on a phone with
 * "Reduce Motion" turned on that did not produce a calmer fight, it produced
 * an unreadable one: the terrain froze on a single frame, so a relay or a
 * patch of fire could be wiped off the board and never come back; spell
 * effects dropped to a third of their particles; and a global CSS rule cut
 * every transition to a thousandth of a millisecond. The result read as a
 * broken game rather than a restful one.
 *
 * Asked to choose, this project ships the fight as it is drawn and ignores the
 * preference. That is a deliberate accessibility trade-off, taken knowingly:
 * people turn that setting on for vestibular disorders and motion sickness,
 * and this board will not accommodate them.
 *
 * It is one switch. Returning the media query below honours the setting again,
 * and every caller follows — but the damped paths need the fixes above before
 * that would be worth doing.
 */
export const prefersReducedMotion = (): boolean => false;
