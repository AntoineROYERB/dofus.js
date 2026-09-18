/*
 * Reshoots the README's screenshots and the demo videos: one scripted fight
 * against the bot, played twice — on a desk and on a phone held sideways.
 *
 * It drives the real client against a real server, so the assets can never
 * show a game that no longer exists. Playwright is not a dependency of the
 * app; install it when you need to shoot:
 *
 *   cd backend && PORT=8082 go run ./cmd/server
 *   cd frontend && VITE_WS_URL=ws://localhost:8082 npx vite --port 5175
 *   npx --yes playwright@latest install chromium
 *   SHOOT_URL=http://localhost:5175 node scripts/shoot-readme.mjs
 *
 * Then turn the two recordings into the README's GIFs, cutting the waits out
 * (the script prints the timestamp of every step it reaches):
 *
 *   ffmpeg -i shots/video-desk/*.webm -filter_complex \
 *     "[0:v]trim=start=4.8:end=10.2,setpts=PTS-STARTPTS[a];\
 *      [0:v]trim=start=11.5:end=28,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[d];\
 *      [d]setpts=PTS/2,fps=8,scale=640:-1:flags=lanczos,split[s0][s1];\
 *      [s0]palettegen=max_colors=48:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer" \
 *     docs/assets/demo.gif
 *
 * The phone GIF is not shot here. Playwright emulates a phone; the iOS app is
 * one, and the difference shows — so `docs/assets/demo-phone.gif` is recorded
 * off a simulator running the real app against the dev server. Play a fight,
 * end a turn and let the bot answer, since its spells supply the motion
 * without racing the turn clock:
 *
 *   xcrun simctl io booted recordVideo --codec h264 --force rec.mp4   # ^C to stop
 *
 * The recording is portrait with a -90 rotation tag, which ffmpeg applies on
 * its own. The crop drops the Dynamic Island, which reads as a black blob
 * without a device frame around it:
 *
 *   ffmpeg -ss <start> -t <len> -i rec.mp4 -filter_complex \
 *     "[0:v]crop=2470:1206:0:0,setpts=PTS/2,fps=8,scale=640:-1:flags=lanczos,\
 *      split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];\
 *      [s1][p]paletteuse=dither=bayer" \
 *     docs/assets/demo-phone.gif
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.SHOOT_URL ?? "http://localhost:5175";
const OUT = process.env.SHOOT_OUT ?? "./shots";
const CLASS = process.env.SHOOT_CLASS ?? "Pyromancer";
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = [];
const mark = (name, started) => {
  const at = (Date.now() - started) / 1000;
  marks.push(`${name} @ ${at.toFixed(1)}s`);
  console.log(`${name} @ ${at.toFixed(1)}s`);
};

/** Every cell the board will let the player act on right now. */
const actionable = (page) =>
  page.locator('[role="button"][aria-label^="Cell"]');

/** The spell's own button, however the bar or the arc labels it. */
const spellButton = (page, spell) =>
  page.getByRole("button", { name: new RegExp(`^${spell}[ ,—]`) }).first();

/**
 * Finds the cell the enemy stands on, by moving the mouse over each cell the
 * board offers until the fighter's own card comes up.
 */
async function enemyCell(page, name) {
  const cells = actionable(page);
  for (let i = 0; i < (await cells.count()); i++) {
    const cell = cells.nth(i);
    const box = await cell.boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await wait(60);
    if (await page.locator("#tutorial-board").getByText(name).first().isVisible()) {
      return { cell, box };
    }
  }
  return null;
}

/**
 * Waits until the bot has walked close enough for the spell to land, ending
 * turns while it comes. Returns the box of the cell it is standing on.
 */
async function enemyInRange(page, spell, name, { rounds = 6 } = {}) {
  for (let round = 0; round < rounds; round++) {
    await spellButton(page, spell).click();
    await wait(400);
    const found = await enemyCell(page, name);
    if (found) return found.box;
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /End turn/ }).first().click();
    // Its turn: a walk of several cells, then whatever it casts.
    await wait(9000);
  }
  return null;
}

async function castAt(page, spell, box, { touch } = {}) {
  await spellButton(page, spell).click();
  await wait(350);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) {
    await page.touchscreen.tap(x, y);
    await wait(500);
    const cast = page.getByRole("button", { name: /^Cast/ });
    if (await cast.isVisible().catch(() => false)) await cast.click();
  } else {
    await page.mouse.move(x, y);
    await wait(200);
    await page.mouse.click(x, y);
  }
  await wait(1600);
}

async function play(page, { phone, started }) {
  await page.goto(URL);
  await page.getByPlaceholder("Your name").fill("Antoine");
  await page.getByRole("radio", { name: new RegExp(CLASS) }).click();
  await wait(600);
  mark("landing", started);
  if (!phone) await page.screenshot({ path: `${OUT}/01-landing.png` });

  await page.getByRole("button", { name: "Find a game", exact: true }).click();
  await wait(1500);
  if (phone) {
    // The phone gets its own home screen: the fighters on a stand, one Play.
    mark("phone home", started);
    await page.screenshot({ path: `${OUT}/08-phone-home.png` });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await wait(2000);
  } else {
    mark("lobby", started);
    await page.screenshot({ path: `${OUT}/02-lobby.png` });
    await page.getByRole("button", { name: /^Challenge/ }).click();
    await wait(1800);
  }

  const skip = page.getByRole("button", { name: "Skip tutorial" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await wait(500);
  mark("placement", started);
  if (!phone) await page.screenshot({ path: `${OUT}/03-placement.png` });

  // The only cells the board offers now are this player's starting ones.
  await actionable(page).last().click();
  await wait(500);
  await page.getByRole("button", { name: "Fight", exact: true }).click();
  await wait(2500);
  mark("fight", started);

  // A real turn, once the bot is close enough to be hit: a wall of fire
  // across it, then a burn on it.
  const enemy = "Ashka";
  const box = await enemyInRange(page, "Kindle", enemy);
  if (!box) throw new Error("the bot never came into range");
  mark("in range", started);

  await castAt(page, "Scorched Earth", box, { touch: phone });
  await castAt(page, "Kindle", box, { touch: phone });
  mark("cast", started);
  await page.screenshot({ path: `${OUT}/${phone ? "05-phone" : "04-combat"}.png` });

  // Its answer: on turn 2 the bot has its Meteor, which leaves a crater.
  await page.getByRole("button", { name: /End turn/ }).first().click();
  await wait(10000);
  mark("bot turn", started);
  await page.screenshot({ path: `${OUT}/${phone ? "09-phone-after" : "06-after-bot"}.png` });

  // And the burns it left on us go off in its face — it has moved since, so
  // the cell is looked up again rather than remembered.
  // A fight can be over by now, and then there is nothing left to cast.
  try {
    const again = (await enemyInRange(page, "Combustion", enemy, { rounds: 2 })) ?? box;
    await castAt(page, "Combustion", again, { touch: phone });
    mark("combustion", started);
  } catch {
    mark("fight over", started);
  }
  await page.screenshot({ path: `${OUT}/${phone ? "10-phone-combustion" : "07-combustion"}.png` });
}

for (const phone of [false, true]) {
  const browser = await chromium.launch();
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 844, height: 390 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          recordVideo: { dir: `${OUT}/video-phone`, size: { width: 844, height: 390 } },
        }
      : {
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 2,
          recordVideo: { dir: `${OUT}/video-desk`, size: { width: 1440, height: 900 } },
        }
  );
  const page = await context.newPage();
  const started = Date.now();
  try {
    await play(page, { phone, started });
  } catch (err) {
    console.error(`${phone ? "phone" : "desk"} run failed:`, err.message);
    await page.screenshot({ path: `${OUT}/failed-${phone ? "phone" : "desk"}.png` });
  }
  await context.close();
  await browser.close();
}
console.log(marks.join("\n"));
