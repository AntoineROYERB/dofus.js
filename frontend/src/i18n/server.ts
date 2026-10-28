import { Key, t } from "./lang";

/*
 * What the server says in words — why it refused an action, what a fight's
 * log reports — it says in English, to every player alike: two players in
 * one fight may not read the same language. The client knows each sentence
 * it can send and puts it in the player's own. Names inside them — a
 * spell's, a fighter's — are content, and stay as the server wrote them.
 *
 * Both lists are typed against the dictionary, so a sentence listed here
 * without a translation does not compile. A sentence the server sends that
 * is not listed is shown as it came: new wording on the server reads in
 * English until it is added here, rather than not at all.
 */

const REASONS = [
  "a boss fights in its own champion's set",
  "a fight seats at most nine",
  "a game is already in progress",
  "a loadout names all four items or none",
  "aim at your own pylon",
  "another player already took that starting cell",
  "could not join, try again",
  "could not open a party, try again",
  "game name must be 3 to 24 letters, digits or spaces",
  "it is not your turn",
  "match not found",
  "name must be 3 to 20 letters, digits or spaces",
  "no opponent is standing still",
  "nobody of yours lies there",
  "not enough action points",
  "not enough movement points",
  "only the party's leader can do that",
  "someone is standing where they fell",
  "something is in the way",
  "that action is not available right now",
  "that boon was not offered to you",
  "that cell is already occupied",
  "that cell is blocked",
  "that cell is out of range",
  "that cell is outside the board",
  "that dream has ended",
  "that game has already started",
  "that game is full",
  "that game no longer exists",
  "that is not one of your starting cells",
  "that is not something to do right now",
  "that room could not be opened, try again",
  "that spell cannot be cast again this turn",
  "that spell has already been used this fight",
  "that spell is not one of yours",
  "that spell is still recharging",
  "that spell needs a free cell",
  "that team is not one this fight is played between",
  "that ultimate has already been used this fight",
  "that would wall part of the board off",
  "the grimoire is not of the outfit's element",
  "the loadout names an item that does not exist",
  "the party is full",
  "there is no party with that code",
  "there is no such room",
  "there is no way through to that cell",
  "ultimates unlock on turn 2",
  "unknown boon",
  "unknown boss",
  "unknown champion",
  "unknown island",
  "unknown monster",
  "unknown opponent level",
  "unknown opponent mode",
  "unknown spell",
  "you already have a character",
  "you are already in a dream",
  "you are already in a game",
  "you are already in this party",
  "you are already standing there",
  "you are not in a dream",
  "you are not in a game",
  "you are not in this dream",
  "you have already chosen a starting cell",
  "you have already chosen",
  "you have no pylon out",
  "you have not created a character yet",
  "your character is dead",
] as const satisfies readonly Key[];

/** The log's fixed lines, as the server writes them after the actor's name. */
const LOG_LINES = [
  "starts their turn",
  "wins the fight",
  "win the fight",
  "is out of the fight",
  "suffers from its wounds",
  "beats the drums",
  "refuses to fall",
  "slides on the ice",
  "is eaten by the acid",
  "is scorched by the lava",
  "is carried by the wind",
  "loses their pylon",
  "is caught in the pylon's blast",
  "is covered by their pillar",
  "loses a pillar",
  "catches fire",
  "springs a trap and is held fast",
  "slides across the ice",
  "slams into a pylon",
  "slams into something",
  "is dragged in",
  "is thrown back",
  "is struck by the drums",
  "is struck by the storm",
  "is dragged into the maelstrom",
  "is standing in fire",
  "puts its burns out in the water",
  "is soothed by the water",
] as const satisfies readonly Key[];

const known = (list: readonly Key[], text: string): text is Key =>
  (list as readonly string[]).includes(text);

/** Why the server refused an action, in the player's language. */
export const localizeReason = (reason: string): string =>
  known(REASONS, reason) ? t(reason) : reason;

/** A line of the fight's log, after the actor's name, in the player's language. */
export const localizeLogText = (text: string): string => {
  if (known(LOG_LINES, text)) return t(text);
  let m = /^cast (.+), hitting nothing$/.exec(text);
  if (m) return t("cast {spell}, hitting nothing", { spell: m[1] });
  m = /^cast (.+) — critical!$/.exec(text);
  if (m) return t("cast {spell} — critical!", { spell: m[1] });
  m = /^cast (.+)$/.exec(text);
  if (m) return t("cast {spell}", { spell: m[1] });
  m = /^stands (.+) back up$/.exec(text);
  if (m) return t("stands {name} back up", { name: m[1] });
  m = /^recovers (\d+) health$/.exec(text);
  if (m) return t("recovers {n} health", { n: m[1] });
  return text;
};
